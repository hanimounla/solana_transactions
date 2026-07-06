use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

#[derive(Clone)]
pub struct SolanaRpcClient {
    client: Client,
    rpc_url: String,
}

#[derive(Serialize)]
struct JsonRpcRequest<T> {
    jsonrpc: &'static str,
    id: u64,
    method: &'static str,
    params: T,
}

#[derive(Deserialize)]
struct JsonRpcResponse<T> {
    result: Option<T>,
    error: Option<RpcError>,
}

#[derive(Deserialize, Debug)]
pub struct RpcError {
    pub code: i32,
    pub message: String,
}

#[derive(Deserialize, Debug, Clone, Serialize)]
pub struct RpcAccountInfo {
    pub lamports: u64,
    pub owner: String,
    pub executable: bool,
    #[serde(rename = "rentEpoch")]
    pub rent_epoch: u64,
    pub data: Value,
}

#[derive(Deserialize, Debug, Clone, Serialize)]
pub struct RpcAccountResponse {
    pub value: Option<RpcAccountInfo>,
}

#[derive(Deserialize, Debug, Clone, Serialize)]
pub struct RpcSignatureInfo {
    pub signature: String,
    pub slot: u64,
    #[serde(rename = "blockTime")]
    pub block_time: Option<i64>,
    pub err: Option<Value>,
    pub memo: Option<String>,
}

#[derive(Deserialize, Debug, Clone, Serialize)]
pub struct TokenBalance {
    #[serde(rename = "accountIndex")]
    pub account_index: u32,
    pub mint: String,
    pub owner: Option<String>,
    #[serde(rename = "uiTokenAmount")]
    pub ui_token_amount: UiTokenAmount,
}

#[derive(Deserialize, Debug, Clone, Serialize)]
pub struct UiTokenAmount {
    pub amount: String,
    pub decimals: u32,
    #[serde(rename = "uiAmountString")]
    pub ui_amount_string: Option<String>,
}

#[derive(Deserialize, Debug, Clone, Serialize)]
pub struct LoadedAddresses {
    pub writable: Vec<String>,
    pub readonly: Vec<String>,
}

#[derive(Deserialize, Debug, Clone, Serialize)]
pub struct RpcTransactionMeta {
    pub err: Option<Value>,
    pub fee: u64,
    #[serde(rename = "preBalances")]
    pub pre_balances: Vec<u64>,
    #[serde(rename = "postBalances")]
    pub post_balances: Vec<u64>,
    #[serde(rename = "preTokenBalances")]
    pub pre_token_balances: Option<Vec<TokenBalance>>,
    #[serde(rename = "postTokenBalances")]
    pub post_token_balances: Option<Vec<TokenBalance>>,
    #[serde(rename = "logMessages")]
    pub log_messages: Option<Vec<String>>,
    #[serde(rename = "computeUnitsConsumed")]
    pub compute_units_consumed: Option<u64>,
    #[serde(rename = "loadedAddresses")]
    pub loaded_addresses: Option<LoadedAddresses>,
}

#[derive(Deserialize, Debug, Clone, Serialize)]
pub struct Instruction {
    #[serde(rename = "programIdIndex")]
    pub program_id_index: u32,
    pub accounts: Option<Vec<u32>>,
    pub data: Option<String>,
    #[serde(rename = "stackHeight")]
    pub stack_height: Option<u32>,
}

#[derive(Deserialize, Debug, Clone, Serialize)]
pub struct InnerInstructions {
    pub index: u32,
    pub instructions: Vec<Instruction>,
}

#[derive(Deserialize, Debug, Clone, Serialize)]
pub struct AddressTableLookup {
    #[serde(rename = "accountKey")]
    pub account_key: String,
    #[serde(rename = "writableIndexes")]
    pub writable_indexes: Vec<u32>,
    #[serde(rename = "readonlyIndexes")]
    pub readonly_indexes: Vec<u32>,
}

#[derive(Deserialize, Debug, Clone, Serialize)]
pub struct TransactionMessage {
    #[serde(rename = "accountKeys")]
    pub account_keys: Vec<String>,
    pub instructions: Vec<Instruction>,
    #[serde(rename = "addressTableLookups")]
    pub address_table_lookups: Option<Vec<AddressTableLookup>>,
}

#[derive(Deserialize, Debug, Clone, Serialize)]
pub struct RpcTransactionData {
    pub message: TransactionMessage,
    pub signatures: Vec<String>,
}

#[derive(Deserialize, Debug, Clone, Serialize)]
pub struct RpcTransactionDetail {
    pub slot: u64,
    pub transaction: RpcTransactionData,
    pub meta: Option<RpcTransactionMeta>,
    #[serde(rename = "blockTime")]
    pub block_time: Option<i64>,
}

impl SolanaRpcClient {
    pub fn new(rpc_url: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap();
        Self { client, rpc_url }
    }

    async fn send_request<Req: Serialize, Res: for<'de> Deserialize<'de>>(
        &self,
        method: &'static str,
        params: Req,
    ) -> Result<Res, String> {
        let payload = JsonRpcRequest {
            jsonrpc: "2.0",
            id: 1,
            method,
            params,
        };

        let response = self
            .client
            .post(&self.rpc_url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Failed to send request: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("RPC error response status: {}", response.status()));
        }

        let body: JsonRpcResponse<Res> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response JSON: {}", e))?;

        if let Some(err) = body.error {
            return Err(format!("RPC error {}: {}", err.code, err.message));
        }

        body.result.ok_or_else(|| "Empty RPC response result".to_string())
    }

    pub async fn get_balance(&self, address: &str) -> Result<u64, String> {
        let res: Value = self.send_request("getBalance", vec![Value::String(address.to_string())]).await?;
        let value = res["value"].as_u64().ok_or_else(|| "Failed to parse balance value".to_string())?;
        Ok(value)
    }

    pub async fn get_account_info(&self, address: &str) -> Result<Option<RpcAccountInfo>, String> {
        let params = (
            address.to_string(),
            serde_json::json!({
                "encoding": "jsonParsed"
            }),
        );
        let res: RpcAccountResponse = self.send_request("getAccountInfo", params).await?;
        Ok(res.value)
    }

    pub async fn get_signatures_for_address(
        &self,
        address: &str,
        before: Option<String>,
        until: Option<String>,
        limit: Option<usize>,
    ) -> Result<Vec<RpcSignatureInfo>, String> {
        let mut config = serde_json::json!({});
        if let Some(b) = before {
            config["before"] = Value::String(b);
        }
        if let Some(u) = until {
            config["until"] = Value::String(u);
        }
        if let Some(l) = limit {
            config["limit"] = serde_json::json!(l);
        }

        let params = (address.to_string(), config);
        let signatures: Vec<RpcSignatureInfo> = self.send_request("getSignaturesForAddress", params).await?;
        Ok(signatures)
    }

    pub async fn get_transaction(&self, signature: &str) -> Result<Option<RpcTransactionDetail>, String> {
        let config = serde_json::json!({
            "encoding": "json",
            "maxSupportedTransactionVersion": 0
        });
        let params = (signature.to_string(), config);
        let transaction: Option<RpcTransactionDetail> = self.send_request("getTransaction", params).await?;
        Ok(transaction)
    }
}
