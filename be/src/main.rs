use axum::{
    routing::{get, post},
    Router,
};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod db;
mod indexer;
mod routes;
mod rpc;

use config::Config;
use db::Db;
use routes::AppState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "be=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 2. Load configuration
    let config = Config::from_env();

    // 3. Connect to Database and run migrations
    info!(
        "Connecting to PostgreSQL database at {}...",
        config.database_url
    );
    let db = Db::connect(&config.database_url).await?;
    info!("Running database migrations...");
    db.run_migrations().await?;
    info!("Database is ready!");

    // 4. Build application state
    let state = Arc::new(AppState {
        db,
        default_rpc_url: config.default_rpc_url.clone(),
        index_jobs: Mutex::new(HashMap::new()),
    });

    // 5. Configure CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_headers(Any)
        .allow_methods(Any);

    // 6. Setup routing
    let app = Router::new()
        .route("/health", get(routes::health_check))
        .route("/api/health", get(routes::health_check))
        .route("/api/rpc/test", post(routes::test_rpc))
        .route("/api/account/:address", get(routes::get_account_overview))
        .route(
            "/api/account/:address/transactions",
            get(routes::get_transactions),
        )
        .route(
            "/api/account/:address/index",
            post(routes::start_indexing).get(routes::get_indexing_progress),
        )
        .route(
            "/api/account/:address/balance-history",
            get(routes::get_balance_history),
        )
        .route(
            "/api/account/:address/fees-history",
            get(routes::get_fees_history),
        )
        .route(
            "/api/transaction/:signature",
            get(routes::get_transaction_detail),
        )
        .layer(cors)
        .with_state(state);

    // 7. Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], config.server_port));
    info!(
        "Backend server listening on http://localhost:{}",
        config.server_port
    );

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            info!("Received Ctrl+C, shutting down gracefully...");
        },
        _ = terminate => {
            info!("Received SIGTERM, shutting down gracefully...");
        },
    }
}
