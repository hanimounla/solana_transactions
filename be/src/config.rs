use std::env;

pub struct Config {
    pub database_url: String,
    pub server_port: u16,
    pub default_rpc_url: String,
}

impl Config {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgres://postgres:postgres@localhost:5432/solana_transactions_db".to_string()
        });

        let default_rpc_url = env::var("SOLANA_RPC_URL")
            .or_else(|_| env::var("RPC_ENDPOINT"))
            .unwrap_or_else(|_| "https://api.devnet.solana.com".to_string());

        let server_port = env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8080);

        Self {
            database_url,
            server_port,
            default_rpc_url,
        }
    }
}
