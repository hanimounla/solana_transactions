use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use crate::rpc::RpcTransactionDetail;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexedAccount {
    pub address: String,
    pub last_indexed_at: chrono::DateTime<chrono::Utc>,
    pub min_block_time: Option<i64>,
    pub max_block_time: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbTransaction {
    pub signature: String,
    pub slot: i64,
    pub block_time: i64,
    pub err: bool,
    pub fee: i64,
    pub fee_payer: String,
    pub logs: Vec<String>,
    pub raw_data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbSolBalanceChange {
    pub address: String,
    pub pre_balance: i64,
    pub post_balance: i64,
    pub change_amount: i64,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbTokenBalanceChange {
    pub address: String,
    pub mint: String,
    pub owner: String,
    pub pre_amount: f64,
    pub post_amount: f64,
    pub change_amount: f64,
    pub decimals: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullTransactionDetail {
    pub signature: String,
    pub slot: i64,
    pub block_time: i64,
    pub err: bool,
    pub fee: i64,
    pub fee_payer: String,
    pub logs: Vec<String>,
    pub raw_data: serde_json::Value,
    pub sol_changes: Vec<DbSolBalanceChange>,
    pub token_changes: Vec<DbTokenBalanceChange>,
}

#[derive(Clone)]
pub struct Db {
    pub pool: PgPool,
}

impl Db {
    pub async fn connect(database_url: &str) -> Result<Self, String> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await
            .map_err(|e| format!("Failed to connect to database: {}", e))?;

        Ok(Self { pool })
    }

    pub async fn run_migrations(&self) -> Result<(), String> {
        sqlx::migrate!("./migrations")
            .run(&self.pool)
            .await
            .map_err(|e| format!("Migration failed: {}", e))?;
        Ok(())
    }

    pub async fn insert_transaction(&self, tx: &RpcTransactionDetail) -> Result<(), String> {
        let signature = match tx.transaction.signatures.first() {
            Some(sig) => sig.clone(),
            None => return Err("Transaction has no signature".to_string()),
        };

        let meta = match &tx.meta {
            Some(m) => m,
            None => return Err("Transaction has no metadata".to_string()),
        };

        let err = meta.err.is_some();
        let fee = meta.fee as i64;
        let logs = meta.log_messages.clone().unwrap_or_default();
        let block_time = tx.block_time.unwrap_or(0);
        let slot = tx.slot as i64;

        let mut account_keys = tx.transaction.message.account_keys.clone();
        if let Some(loaded) = &meta.loaded_addresses {
            account_keys.extend(loaded.writable.clone());
            account_keys.extend(loaded.readonly.clone());
        }

        let fee_payer = account_keys.first().cloned().unwrap_or_else(|| "".to_string());

        let raw_data = serde_json::to_value(tx).unwrap_or(serde_json::Value::Null);

        let db_tx = sqlx::query(
            "INSERT INTO transactions (signature, slot, block_time, err, fee, fee_payer, logs, raw_data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (signature) DO UPDATE SET
                slot = EXCLUDED.slot,
                block_time = EXCLUDED.block_time,
                err = EXCLUDED.err,
                fee = EXCLUDED.fee,
                fee_payer = EXCLUDED.fee_payer,
                logs = EXCLUDED.logs,
                raw_data = EXCLUDED.raw_data"
        )
        .bind(&signature)
        .bind(slot)
        .bind(block_time)
        .bind(err)
        .bind(fee)
        .bind(&fee_payer)
        .bind(&logs)
        .bind(&raw_data);

        let mut transaction = self.pool.begin().await
            .map_err(|e| format!("Failed to begin DB transaction: {}", e))?;

        db_tx.execute(&mut *transaction).await
            .map_err(|e| format!("Failed to insert transaction: {}", e))?;

        sqlx::query("DELETE FROM sol_balance_changes WHERE signature = $1")
            .bind(&signature)
            .execute(&mut *transaction).await
            .map_err(|e| format!("Failed to delete old SOL changes: {}", e))?;

        sqlx::query("DELETE FROM token_balance_changes WHERE signature = $1")
            .bind(&signature)
            .execute(&mut *transaction).await
            .map_err(|e| format!("Failed to delete old token changes: {}", e))?;

        for (i, address) in account_keys.iter().enumerate() {
            let pre = meta.pre_balances.get(i).cloned().unwrap_or(0);
            let post = meta.post_balances.get(i).cloned().unwrap_or(0);
            let change = (post as i64) - (pre as i64);

            let is_signer = i == 0;
            let is_writable = true;

            sqlx::query(
                "INSERT INTO sol_balance_changes (signature, address, pre_balance, post_balance, change_amount, is_signer, is_writable)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)"
            )
            .bind(&signature)
            .bind(address)
            .bind(pre as i64)
            .bind(post as i64)
            .bind(change)
            .bind(is_signer)
            .bind(is_writable)
            .execute(&mut *transaction).await
            .map_err(|e| format!("Failed to insert SOL balance change: {}", e))?;
        }

        let mut pre_token_map = HashMap::new();
        if let Some(pre_token) = &meta.pre_token_balances {
            for tb in pre_token {
                if let Some(owner) = &tb.owner {
                    let amount: f64 = tb.ui_token_amount.amount.parse().unwrap_or(0.0) / 10f64.powi(tb.ui_token_amount.decimals as i32);
                    pre_token_map.insert((tb.account_index, &tb.mint, owner), (amount, tb.ui_token_amount.decimals));
                }
            }
        }

        let mut post_token_map = HashMap::new();
        if let Some(post_token) = &meta.post_token_balances {
            for tb in post_token {
                if let Some(owner) = &tb.owner {
                    let amount: f64 = tb.ui_token_amount.amount.parse().unwrap_or(0.0) / 10f64.powi(tb.ui_token_amount.decimals as i32);
                    post_token_map.insert((tb.account_index, &tb.mint, owner), (amount, tb.ui_token_amount.decimals));
                }
            }
        }

        let mut all_token_keys = std::collections::HashSet::new();
        for key in pre_token_map.keys() {
            all_token_keys.insert(*key);
        }
        for key in post_token_map.keys() {
            all_token_keys.insert(*key);
        }

        for (account_index, mint, owner) in all_token_keys {
            let (pre_val, pre_dec) = pre_token_map.get(&(account_index, mint, owner)).cloned().unwrap_or((0.0, 0));
            let (post_val, post_dec) = post_token_map.get(&(account_index, mint, owner)).cloned().unwrap_or((0.0, 0));
            let change_val = post_val - pre_val;
            let decimals = if post_dec > 0 { post_dec } else { pre_dec };

            let token_account_address = account_keys.get(account_index as usize).cloned().unwrap_or_else(|| "".to_string());

            sqlx::query(
                "INSERT INTO token_balance_changes (signature, address, mint, owner, pre_amount, post_amount, change_amount, decimals)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
            )
            .bind(&signature)
            .bind(&token_account_address)
            .bind(mint)
            .bind(owner)
            .bind(pre_val)
            .bind(post_val)
            .bind(change_val)
            .bind(decimals as i32)
            .execute(&mut *transaction).await
            .map_err(|e| format!("Failed to insert Token balance change: {}", e))?;
        }

        transaction.commit().await
            .map_err(|e| format!("Failed to commit DB transaction: {}", e))?;

        Ok(())
    }

    pub async fn update_index_status(&self, address: &str, min_time: Option<i64>, max_time: Option<i64>) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO indexed_accounts (address, last_indexed_at, min_block_time, max_block_time)
             VALUES ($1, NOW(), $2, $3)
             ON CONFLICT (address) DO UPDATE SET
                last_indexed_at = NOW(),
                min_block_time = LEAST(indexed_accounts.min_block_time, EXCLUDED.min_block_time),
                max_block_time = GREATEST(indexed_accounts.max_block_time, EXCLUDED.max_block_time)"
        )
        .bind(address)
        .bind(min_time)
        .bind(max_time)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to update index status: {}", e))?;
        Ok(())
    }

    pub async fn get_indexed_status(&self, address: &str) -> Result<Option<IndexedAccount>, String> {
        let row = sqlx::query("SELECT address, last_indexed_at, min_block_time, max_block_time FROM indexed_accounts WHERE address = $1")
            .bind(address)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| format!("Failed to fetch indexed account status: {}", e))?;

        if let Some(r) = row {
            Ok(Some(IndexedAccount {
                address: r.get("address"),
                last_indexed_at: r.get("last_indexed_at"),
                min_block_time: r.get("min_block_time"),
                max_block_time: r.get("max_block_time"),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn get_transactions_for_account(
        &self,
        address: &str,
        start_time: Option<i64>,
        end_time: Option<i64>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<FullTransactionDetail>, String> {
        let mut query_str = "
            SELECT DISTINCT t.signature, t.slot, t.block_time, t.err, t.fee, t.fee_payer, t.logs, t.raw_data
            FROM transactions t
            LEFT JOIN sol_balance_changes s ON t.signature = s.signature
            LEFT JOIN token_balance_changes tok ON t.signature = tok.signature
            WHERE (s.address = $1 OR tok.owner = $1 OR t.fee_payer = $1)
        ".to_string();

        let mut bind_idx = 2;
        if start_time.is_some() {
            query_str.push_str(&format!(" AND t.block_time >= ${}", bind_idx));
            bind_idx += 1;
        }
        if end_time.is_some() {
            query_str.push_str(&format!(" AND t.block_time <= ${}", bind_idx));
            bind_idx += 1;
        }

        query_str.push_str(&format!(" ORDER BY t.block_time DESC LIMIT ${} OFFSET ${}", bind_idx, bind_idx + 1));

        let mut query = sqlx::query(&query_str).bind(address);

        if let Some(start) = start_time {
            query = query.bind(start);
        }
        if let Some(end) = end_time {
            query = query.bind(end);
        }

        query = query.bind(limit).bind(offset);

        let rows = query.fetch_all(&self.pool).await
            .map_err(|e| format!("Failed to fetch transactions: {}", e))?;

        let mut txs = Vec::new();
        for r in rows {
            let signature: String = r.get("signature");
            
            let sol_rows = sqlx::query("SELECT address, pre_balance, post_balance, change_amount, is_signer, is_writable FROM sol_balance_changes WHERE signature = $1")
                .bind(&signature)
                .fetch_all(&self.pool).await
                .map_err(|e| format!("Failed to fetch SOL changes: {}", e))?;
            
            let sol_changes = sol_rows.iter().map(|sr| DbSolBalanceChange {
                address: sr.get("address"),
                pre_balance: sr.get("pre_balance"),
                post_balance: sr.get("post_balance"),
                change_amount: sr.get("change_amount"),
                is_signer: sr.get("is_signer"),
                is_writable: sr.get("is_writable"),
            }).collect();

            let token_rows = sqlx::query("SELECT address, mint, owner, pre_amount, post_amount, change_amount, decimals FROM token_balance_changes WHERE signature = $1")
                .bind(&signature)
                .fetch_all(&self.pool).await
                .map_err(|e| format!("Failed to fetch Token changes: {}", e))?;
            
            let token_changes = token_rows.iter().map(|tr| DbTokenBalanceChange {
                address: tr.get("address"),
                mint: tr.get("mint"),
                owner: tr.get("owner"),
                pre_amount: tr.get("pre_amount"),
                post_amount: tr.get("post_amount"),
                change_amount: tr.get("change_amount"),
                decimals: tr.get("decimals"),
            }).collect();

            txs.push(FullTransactionDetail {
                signature,
                slot: r.get("slot"),
                block_time: r.get("block_time"),
                err: r.get("err"),
                fee: r.get("fee"),
                fee_payer: r.get("fee_payer"),
                logs: r.get("logs"),
                raw_data: r.get("raw_data"),
                sol_changes,
                token_changes,
            });
        }

        Ok(txs)
    }

    pub async fn get_sol_balance_changes_for_address(&self, address: &str) -> Result<Vec<(i64, i64)>, String> {
        let rows = sqlx::query(
            "SELECT DISTINCT ON ((t.block_time / 300) * 300)
                    (t.block_time / 300) * 300 AS bucket_time,
                    s.post_balance
             FROM sol_balance_changes s
             JOIN transactions t ON s.signature = t.signature
             WHERE s.address = $1
             ORDER BY bucket_time DESC, t.block_time DESC, s.id DESC"
        )
        .bind(address)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to fetch SOL balance changes: {}", e))?;

        let changes = rows.iter().map(|r| {
            (r.get::<i64, _>("bucket_time"), r.get::<i64, _>("post_balance"))
        }).collect();

        Ok(changes)
    }

    pub async fn get_fees_history_for_address(&self, address: &str) -> Result<Vec<DbFeesBucket>, String> {
        let rows = sqlx::query(
            "SELECT (block_time / 300) * 300 AS bucket_time,
                    SUM(fee)::BIGINT AS total_fees,
                    SUM(CASE WHEN err = FALSE THEN fee ELSE 0 END)::BIGINT AS success_fees,
                    SUM(CASE WHEN err = TRUE THEN fee ELSE 0 END)::BIGINT AS failed_fees,
                    COUNT(CASE WHEN err = FALSE THEN 1 END)::BIGINT AS success_count,
                    COUNT(CASE WHEN err = TRUE THEN 1 END)::BIGINT AS failed_count
             FROM transactions
             WHERE fee_payer = $1
             GROUP BY bucket_time
             ORDER BY bucket_time DESC"
        )
        .bind(address)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to fetch fees history: {}", e))?;

        let buckets = rows.iter().map(|r| {
            DbFeesBucket {
                bucket_time: r.get::<i64, _>("bucket_time"),
                total_fees: r.get::<i64, _>("total_fees"),
                success_fees: r.get::<i64, _>("success_fees"),
                failed_fees: r.get::<i64, _>("failed_fees"),
                success_count: r.get::<i64, _>("success_count"),
                failed_count: r.get::<i64, _>("failed_count"),
            }
        }).collect();

        Ok(buckets)
    }
}

#[derive(Debug, Clone)]
pub struct DbFeesBucket {
    pub bucket_time: i64,
    pub total_fees: i64,
    pub success_fees: i64,
    pub failed_fees: i64,
    pub success_count: i64,
    pub failed_count: i64,
}
