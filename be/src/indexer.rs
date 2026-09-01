use crate::db::Db;
use crate::rpc::SolanaRpcClient;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{error, info};

pub struct IndexJobProgress {
    pub total_found: usize,
    pub processed: usize,
    pub errors: usize,
    pub status: String,
}

pub struct Indexer;

impl Indexer {
    pub async fn index_account(
        db: Db,
        rpc: SolanaRpcClient,
        address: String,
        start_time: i64,
        end_time: i64,
        progress: Arc<Mutex<IndexJobProgress>>,
    ) {
        info!(
            "Starting indexer job for address {} in range [{}, {}]",
            address, start_time, end_time
        );

        {
            let mut prog = progress.lock().await;
            prog.status = "Fetching signatures...".to_string();
        }

        // 1. Fetch signatures in the date range (walking backwards)
        let mut signatures_to_fetch = Vec::new();
        let mut before_signature: Option<String> = None;
        let mut stop_crawling = false;
        let limit = 1000;

        let mut min_block_time_seen: Option<i64> = None;
        let mut max_block_time_seen: Option<i64> = None;

        while !stop_crawling {
            let batch = match rpc
                .get_signatures_for_address(&address, before_signature.clone(), None, Some(limit))
                .await
            {
                Ok(b) => b,
                Err(e) => {
                    error!("Error fetching signatures for address {}: {}", address, e);
                    let mut prog = progress.lock().await;
                    prog.status = format!("Error: {}", e);
                    return;
                }
            };

            if batch.is_empty() {
                info!("No more signatures found for {}", address);
                break;
            }

            // Set before_signature to the last signature in the batch to paginate backwards
            if let Some(last) = batch.last() {
                before_signature = Some(last.signature.clone());
            }

            for sig_info in batch {
                let time = sig_info.block_time.unwrap_or(0);
                if time == 0 {
                    continue; // Skip signatures with no block time
                }

                // Keep track of total times seen
                min_block_time_seen =
                    Some(min_block_time_seen.map_or(time, |m| std::cmp::min(m, time)));
                max_block_time_seen =
                    Some(max_block_time_seen.map_or(time, |m| std::cmp::max(m, time)));

                // Smart date range conversion logic:
                if time > end_time {
                    // Too new, skip but continue crawling backwards
                    continue;
                }

                if time < start_time {
                    // Too old. Since they are sorted descending, everything after this is also too old.
                    stop_crawling = true;
                    break;
                }

                // Within range!
                signatures_to_fetch.push(sig_info.signature);
            }

            // If we received less than the limit, we hit the end of history
            if signatures_to_fetch.len() > 500000 {
                // Safety guard: don't index more than 500,000 transactions at once to avoid RPC overload
                info!("Safely capping indexing batch to 500000 signatures");
                break;
            }
        }

        let total_sigs = signatures_to_fetch.len();
        info!(
            "Found {} signatures within target date range to index",
            total_sigs
        );

        {
            let mut prog = progress.lock().await;
            prog.total_found = total_sigs;
            prog.status = format!("Indexing {} transactions...", total_sigs);
        }

        if total_sigs == 0 {
            let mut prog = progress.lock().await;
            prog.status = "Completed: No transactions in range".to_string();
            // Still update status
            let _ = db
                .update_index_status(&address, min_block_time_seen, max_block_time_seen)
                .await;
            return;
        }

        // 2. Fetch and process transaction details concurrently with a pacing cooldown
        let processed_count = Arc::new(AtomicUsize::new(0));
        let error_count = Arc::new(AtomicUsize::new(0));
        let rpc_arc = Arc::new(rpc);
        let db_arc = Arc::new(db);

        // Load cooldown pacing time from environment (default to 100ms for 10 RPS)
        let cooldown_ms = std::env::var("RPC_COOLDOWN_MS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(100);
        info!(
            "Indexing with pacing cooldown of {}ms between requests",
            cooldown_ms
        );

        let mut handlers = Vec::new();

        for signature in signatures_to_fetch {
            let sig = signature.clone();
            let rpc_client = Arc::clone(&rpc_arc);
            let db_client = Arc::clone(&db_arc);
            let proc = Arc::clone(&processed_count);
            let errs = Arc::clone(&error_count);
            let prog_mutex = Arc::clone(&progress);

            let handle = tokio::spawn(async move {
                match rpc_client.get_transaction(&sig).await {
                    Ok(Some(tx_details)) => {
                        if let Err(db_err) = db_client.insert_transaction(&tx_details).await {
                            error!("Failed to write transaction {} to DB: {}", sig, db_err);
                            errs.fetch_add(1, Ordering::SeqCst);
                        } else {
                            proc.fetch_add(1, Ordering::SeqCst);
                        }
                    }
                    Ok(None) => {
                        error!("Transaction {} not found on RPC", sig);
                        errs.fetch_add(1, Ordering::SeqCst);
                    }
                    Err(e) => {
                        error!("Failed to fetch transaction details for {}: {}", sig, e);
                        errs.fetch_add(1, Ordering::SeqCst);
                    }
                }

                // Update progress state
                let processed = proc.load(Ordering::SeqCst);
                let errors = errs.load(Ordering::SeqCst);
                let mut p = prog_mutex.lock().await;
                p.processed = processed;
                p.errors = errors;
                p.status = format!(
                    "Processed {}/{} (Errors: {})",
                    processed, p.total_found, errors
                );
            });

            handlers.push(handle);

            // Pacing sleep to distribute requests smoothly and avoid 429
            if cooldown_ms > 0 {
                tokio::time::sleep(tokio::time::Duration::from_millis(cooldown_ms)).await;
            }
        }

        // Wait for all requests to finish
        for h in handlers {
            let _ = h.await;
        }

        // 3. Mark indexing status complete
        let final_processed = processed_count.load(Ordering::SeqCst);
        let final_errors = error_count.load(Ordering::SeqCst);

        let _ = db_arc
            .update_index_status(&address, min_block_time_seen, max_block_time_seen)
            .await;

        let mut prog = progress.lock().await;
        prog.status = format!(
            "Completed! Indexed {} transactions successfully, {} errors.",
            final_processed, final_errors
        );
        info!("Indexing job finished: {}", prog.status);
    }
}
