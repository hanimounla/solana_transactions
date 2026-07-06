use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::error;

use crate::db::{Db, FullTransactionDetail};
use crate::indexer::{IndexJobProgress, Indexer};
use crate::rpc::SolanaRpcClient;

pub struct AppState {
    pub db: Db,
    pub default_rpc_url: String,
    pub index_jobs: Mutex<HashMap<String, Arc<Mutex<IndexJobProgress>>>>,
}

#[derive(Deserialize)]
pub struct RpcTestRequest {
    pub rpc_url: String,
}

#[derive(Serialize)]
pub struct RpcTestResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Serialize)]
pub struct AccountOverviewResponse {
    pub address: String,
    pub balance_sol: f64,
    pub owner: String,
    pub executable: bool,
    pub data_size: usize,
}

#[derive(Deserialize)]
pub struct TransactionsQuery {
    pub start_date: Option<i64>, // timestamp in seconds
    pub end_date: Option<i64>,   // timestamp in seconds
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Serialize)]
pub struct TransactionsResponse {
    pub source: &'static str,
    pub transactions: Vec<FullTransactionDetail>,
}

#[derive(Deserialize)]
pub struct IndexRequest {
    pub start_date: i64, // timestamp
    pub end_date: i64,   // timestamp
}

#[derive(Serialize)]
pub struct IndexProgressResponse {
    pub total_found: usize,
    pub processed: usize,
    pub errors: usize,
    pub status: String,
    pub active: bool,
}

#[derive(Serialize)]
pub struct BalancePoint {
    pub timestamp: i64,
    pub balance_sol: f64,
}

// Helpers to parse header RPC configs
fn get_rpc_client(headers: &HeaderMap, default_rpc: &str) -> SolanaRpcClient {
    let rpc_url = headers
        .get("x-solana-rpc-url")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| default_rpc.to_string());

    SolanaRpcClient::new(rpc_url)
}

// Handler to test RPC URL connectivity
pub async fn test_rpc(Json(payload): Json<RpcTestRequest>) -> impl IntoResponse {
    let client = SolanaRpcClient::new(payload.rpc_url);
    match client.get_balance("FBQ23w6WVetKYJMLCrtxqPn9pKg9rZbB8GcW4MT63YzA").await {
        Ok(_) => (
            StatusCode::OK,
            Json(RpcTestResponse {
                success: true,
                message: "Successfully connected to RPC and queried balance!".to_string(),
            }),
        ),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(RpcTestResponse {
                success: false,
                message: format!("RPC query failed: {}", e),
            }),
        ),
    }
}

// Handler for Account Overview
pub async fn get_account_overview(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
    Path(address): Path<String>,
) -> impl IntoResponse {
    let rpc = get_rpc_client(&headers, &state.default_rpc_url);

    match rpc.get_account_info(&address).await {
        Ok(info_opt) => {
            let balance = match rpc.get_balance(&address).await {
                Ok(bal) => bal as f64 / 1_000_000_000.0,
                Err(_) => 0.0,
            };

            if let Some(info) = info_opt {
                let data_size = match &info.data {
                    serde_json::Value::String(s) => s.len(), // Base64 or plain string length
                    serde_json::Value::Array(arr) => {
                        // Sometimes base64 is in format [data, encoding]
                        arr.first().and_then(|v| v.as_str()).map(|s| s.len()).unwrap_or(0)
                    }
                    _ => 0,
                };

                Json(AccountOverviewResponse {
                    address,
                    balance_sol: balance,
                    owner: info.owner,
                    executable: info.executable,
                    data_size,
                })
                .into_response()
            } else {
                // Return default state for unfunded or fresh accounts
                Json(AccountOverviewResponse {
                    address,
                    balance_sol: balance,
                    owner: "system".to_string(),
                    executable: false,
                    data_size: 0,
                })
                .into_response()
            }
        }
        Err(e) => {
            error!("Failed to fetch account info: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("RPC error: {}", e)).into_response()
        }
    }
}

// Handler for Transactions List
pub async fn get_transactions(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
    Path(address): Path<String>,
    Query(params): Query<TransactionsQuery>,
) -> impl IntoResponse {
    let limit = params.limit.unwrap_or(20);
    let offset = params.offset.unwrap_or(0);

    let indexed = match state.db.get_indexed_status(&address).await {
        Ok(Some(_status)) => {
            // Check if our query range falls within or overlaps indexed times
            // For simplicity, if indexed we fetch from DB.
            true
        }
        _ => false,
    };

    if indexed {
        // Query database
        match state
            .db
            .get_transactions_for_account(
                &address,
                params.start_date,
                params.end_date,
                limit,
                offset,
            )
            .await
        {
            Ok(txs) => {
                return Json(TransactionsResponse {
                    source: "db",
                    transactions: txs,
                })
                .into_response();
            }
            Err(e) => {
                error!("DB query failed for transactions: {}", e);
                // Fallback to RPC
            }
        }
    }

    // 2. Fallback: Fetch directly from RPC
    let rpc = get_rpc_client(&headers, &state.default_rpc_url);
    let start = params.start_date.unwrap_or(0);
    let end = params.end_date.unwrap_or(chrono::Utc::now().timestamp());

    match rpc.get_signatures_for_address(&address, None, None, Some(limit as usize + offset as usize)).await {
        Ok(signatures) => {
            let mut filtered_txs = Vec::new();
            
            // We slice the signatures to offset-limit
            let start_idx = std::cmp::min(offset as usize, signatures.len());
            let end_idx = std::cmp::min((offset + limit) as usize, signatures.len());
            let target_signatures = &signatures[start_idx..end_idx];

            for sig_info in target_signatures {
                let time = sig_info.block_time.unwrap_or(0);
                if time == 0 || (params.start_date.is_some() && time < start) || (params.end_date.is_some() && time > end) {
                    continue;
                }

                // Fetch details
                if let Ok(Some(tx_details)) = rpc.get_transaction(&sig_info.signature).await {
                    let signature = sig_info.signature.clone();
                    let slot = tx_details.slot as i64;
                    let block_time = tx_details.block_time.unwrap_or(0);
                    
                    let meta = tx_details.meta.clone().unwrap_or(crate::rpc::RpcTransactionMeta {
                        err: None,
                        fee: 0,
                        pre_balances: Vec::new(),
                        post_balances: Vec::new(),
                        pre_token_balances: None,
                        post_token_balances: None,
                        log_messages: None,
                        compute_units_consumed: None,
                        loaded_addresses: None,
                    });

                    let err = meta.err.is_some();
                    let fee = meta.fee as i64;
                    let logs = meta.log_messages.unwrap_or_default();
                    let raw_data = serde_json::to_value(&tx_details).unwrap_or(serde_json::Value::Null);

                    let mut account_keys = tx_details.transaction.message.account_keys.clone();
                    if let Some(loaded) = &meta.loaded_addresses {
                        account_keys.extend(loaded.writable.clone());
                        account_keys.extend(loaded.readonly.clone());
                    }
                    let fee_payer = account_keys.first().cloned().unwrap_or_default();

                    // Parse SOL Changes
                    let mut sol_changes = Vec::new();
                    for (i, addr) in account_keys.iter().enumerate() {
                        let pre = meta.pre_balances.get(i).cloned().unwrap_or(0);
                        let post = meta.post_balances.get(i).cloned().unwrap_or(0);
                        let change = (post as i64) - (pre as i64);
                        if change != 0 || addr == &address {
                            sol_changes.push(crate::db::DbSolBalanceChange {
                                address: addr.clone(),
                                pre_balance: pre as i64,
                                post_balance: post as i64,
                                change_amount: change,
                                is_signer: i == 0,
                                is_writable: true,
                            });
                        }
                    }

                    // Parse Token Changes (simplified representation for RPC fallback)
                    let token_changes = Vec::new();

                    filtered_txs.push(FullTransactionDetail {
                        signature,
                        slot,
                        block_time,
                        err,
                        fee,
                        fee_payer,
                        logs,
                        raw_data,
                        sol_changes,
                        token_changes,
                    });
                }
            }

            Json(TransactionsResponse {
                source: "rpc",
                transactions: filtered_txs,
            })
            .into_response()
        }
        Err(e) => {
            error!("RPC signature lookup failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("RPC error: {}", e)).into_response()
        }
    }
}

// Handler to start Background Indexer Job
pub async fn start_indexing(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
    Path(address): Path<String>,
    Json(payload): Json<IndexRequest>,
) -> impl IntoResponse {
    let rpc = get_rpc_client(&headers, &state.default_rpc_url);
    let mut jobs = state.index_jobs.lock().await;

    // Check if there is already a running job for this address
    if let Some(job) = jobs.get(&address) {
        let job_progress = job.lock().await;
        if !job_progress.status.contains("Completed") && !job_progress.status.contains("Error") {
            return (
                StatusCode::CONFLICT,
                "An indexing job is already running for this address.",
            )
                .into_response();
        }
    }

    let progress = Arc::new(Mutex::new(IndexJobProgress {
        total_found: 0,
        processed: 0,
        errors: 0,
        status: "Initiating crawl...".to_string(),
    }));

    jobs.insert(address.clone(), Arc::clone(&progress));

    // Spawn background task
    let db_clone = state.db.clone();
    let addr_clone = address.clone();
    let prog_clone = Arc::clone(&progress);

    tokio::spawn(async move {
        Indexer::index_account(
            db_clone,
            rpc,
            addr_clone,
            payload.start_date,
            payload.end_date,
            prog_clone,
        )
        .await;
    });

    (StatusCode::ACCEPTED, "Indexing job started").into_response()
}

// Handler to get Index Progress
pub async fn get_indexing_progress(
    State(state): State<Arc<AppState>>,
    Path(address): Path<String>,
) -> impl IntoResponse {
    let jobs = state.index_jobs.lock().await;

    if let Some(job) = jobs.get(&address) {
        let prog = job.lock().await;
        let active = !prog.status.contains("Completed") && !prog.status.contains("Error");
        Json(IndexProgressResponse {
            total_found: prog.total_found,
            processed: prog.processed,
            errors: prog.errors,
            status: prog.status.clone(),
            active,
        })
        .into_response()
    } else {
        // Check if there is an indexed status in the DB
        match state.db.get_indexed_status(&address).await {
            Ok(Some(status)) => Json(IndexProgressResponse {
                total_found: 0,
                processed: 0,
                errors: 0,
                status: format!("Account was previously indexed. Last run: {}", status.last_indexed_at),
                active: false,
            })
            .into_response(),
            _ => (
                StatusCode::NOT_FOUND,
                Json(IndexProgressResponse {
                    total_found: 0,
                    processed: 0,
                    errors: 0,
                    status: "No active index job found for this address.".to_string(),
                    active: false,
                }),
            )
                .into_response(),
        }
    }
}

// Handler for SOL Balance History over time
pub async fn get_balance_history(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
    Path(address): Path<String>,
    Query(params): Query<TransactionsQuery>,
) -> impl IntoResponse {
    let rpc = get_rpc_client(&headers, &state.default_rpc_url);

    // 1. Fetch current balance
    let current_balance_lamports = match rpc.get_balance(&address).await {
        Ok(bal) => bal as i64,
        Err(e) => {
            error!("Failed to fetch current balance for history: {}", e);
            return (StatusCode::BAD_REQUEST, format!("RPC error: {}", e)).into_response();
        }
    };

    // 2. Fetch all balance changes from database
    let changes = match state.db.get_sol_balance_changes_for_address(&address).await {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to fetch balance changes from database: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Database query error").into_response();
        }
    };

    if changes.is_empty() {
        // Return single current data point if no indexed transaction history
        let now_sec = chrono::Utc::now().timestamp();
        return Json(vec![BalancePoint {
            timestamp: now_sec,
            balance_sol: current_balance_lamports as f64 / 1_000_000_000.0,
        }])
        .into_response();
    }

    // 3. Reconstruct history backwards
    let mut history = Vec::new();
    let mut current = current_balance_lamports;

    // Add current balance as the first (newest) point
    let now_sec = chrono::Utc::now().timestamp();
    history.push(BalancePoint {
        timestamp: now_sec,
        balance_sol: current as f64 / 1_000_000_000.0,
    });

    for (block_time, change) in changes {
        // Balance before transaction = current_balance - change
        current = current - change;
        history.push(BalancePoint {
            timestamp: block_time,
            balance_sol: current as f64 / 1_000_000_000.0,
        });
    }

    // Reverse history so it goes from oldest to newest (perfect for charts!)
    history.reverse();

    // 4. Apply date range filters if requested
    if let Some(start) = params.start_date {
        history.retain(|pt| pt.timestamp >= start);
    }
    if let Some(end) = params.end_date {
        history.retain(|pt| pt.timestamp <= end);
    }

    Json(history).into_response()
}

// Handler for detailed single Transaction view
pub async fn get_transaction_detail(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
    Path(signature): Path<String>,
) -> impl IntoResponse {
    // 1. Try DB first
    match state.db.get_transactions_for_account(&signature, None, None, 1, 0).await {
        Ok(mut txs) => {
            if let Some(tx) = txs.pop() {
                return (StatusCode::OK, Json(tx)).into_response();
            }
        }
        Err(e) => {
            error!("Failed to fetch transaction details from DB: {}", e);
        }
    }

    // 2. Fallback to RPC
    let rpc = get_rpc_client(&headers, &state.default_rpc_url);
    match rpc.get_transaction(&signature).await {
        Ok(Some(tx_details)) => {
            let slot = tx_details.slot as i64;
            let block_time = tx_details.block_time.unwrap_or(0);
            
            let meta = tx_details.meta.clone().unwrap_or(crate::rpc::RpcTransactionMeta {
                err: None,
                fee: 0,
                pre_balances: Vec::new(),
                post_balances: Vec::new(),
                pre_token_balances: None,
                post_token_balances: None,
                log_messages: None,
                compute_units_consumed: None,
                loaded_addresses: None,
            });

            let err = meta.err.is_some();
            let fee = meta.fee as i64;
            let logs = meta.log_messages.unwrap_or_default();
            let raw_data = serde_json::to_value(&tx_details).unwrap_or(serde_json::Value::Null);

            let mut account_keys = tx_details.transaction.message.account_keys.clone();
            if let Some(loaded) = &meta.loaded_addresses {
                account_keys.extend(loaded.writable.clone());
                account_keys.extend(loaded.readonly.clone());
            }
            let fee_payer = account_keys.first().cloned().unwrap_or_default();

            // SOL changes
            let mut sol_changes = Vec::new();
            for (i, addr) in account_keys.iter().enumerate() {
                let pre = meta.pre_balances.get(i).cloned().unwrap_or(0);
                let post = meta.post_balances.get(i).cloned().unwrap_or(0);
                let change = (post as i64) - (pre as i64);
                if change != 0 {
                    sol_changes.push(crate::db::DbSolBalanceChange {
                        address: addr.clone(),
                        pre_balance: pre as i64,
                        post_balance: post as i64,
                        change_amount: change,
                        is_signer: i == 0,
                        is_writable: true,
                    });
                }
            }

            // Token changes (mocked/simplified on-the-fly)
            let token_changes = Vec::new();

            Json(FullTransactionDetail {
                signature,
                slot,
                block_time,
                err,
                fee,
                fee_payer,
                logs,
                raw_data,
                sol_changes,
                token_changes,
            })
            .into_response()
        }
        Ok(None) => (StatusCode::NOT_FOUND, "Transaction not found").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, format!("RPC error: {}", e)).into_response(),
    }
}
