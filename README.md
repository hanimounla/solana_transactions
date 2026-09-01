# Solana Transactions (SolTrn)

A high-performance Solana transaction indexer and visualization dashboard built with **Rust (Axum + SQLx)**, **PostgreSQL**, and **React (Vite + TailwindCSS + Recharts)**, engineered for automated cloud deployment on **Google Cloud Platform (GCP)** under the **Solana Transactions** project using **GKE Autopilot**.

---

## 🏗️ Architecture

```mermaid
graph TD
    Client[React Frontend (Nginx SPA)] <-->|HTTP API / Ingress| Server[Rust Axum Server]
    Server <-->|SQLx PgPool| DB[(PostgreSQL)]
    Server <-->|Reqwest JSON-RPC| Solana[Solana Blockchain RPC]
    Server -->|Background Indexer| DB
```

### Key Components
1. **Rust Backend (`be/`)**:
   - Zero-dependency custom Solana JSON-RPC client.
   - High-throughput asynchronous date-to-slot pagination and indexing crawler.
   - Embedded database migrations on boot via `sqlx::migrate!()`.
   - Health check endpoints (`/health`, `/api/health`) for Kubernetes liveness & readiness probes.
2. **React Frontend (`fe/`)**:
   - React 19 + TypeScript + Vite + TailwindCSS + Lucide Icons + Recharts.
   - Multi-stage Docker build served via Nginx with automated `/api/` reverse proxy and SPA routing.
3. **Cloud Infrastructure & CI/CD**:
   - **GKE Autopilot**: Auto-provisioned, highly scalable, and secured Kubernetes deployment.
   - **Google Artifact Registry**: High-speed Docker image repository.
   - **GitHub Actions**: Continuous Integration (`ci.yml`) and automated deployment (`deploy-gke.yml`) using Workload Identity Federation (keyless auth).

---

## 🚀 Cloud Deployment (GCP GKE Autopilot)

For full setup instructions, see the [Deployment Guide](DEPLOYMENT.md).

### Quick GCP Setup
Run the automated GCP provisioning script:
```powershell
# Windows PowerShell
.\scripts\setup-gcp.ps1 -ProjectId "aiservice-solana-transactions" -Region "us-central1"
```
```bash
# Linux / macOS
chmod +x scripts/setup-gcp.sh
./scripts/setup-gcp.sh
```

### GitHub Actions Workflows
- **CI Workflow (`.github/workflows/ci.yml`)**: Automatically runs Rust format/check/tests and React lint/build on pull requests and pushes.
- **Deploy Workflow (`.github/workflows/deploy-gke.yml`)**: Builds Docker images, pushes to Google Artifact Registry, applies Kubernetes manifests via Kustomize, and validates rollout in GKE Autopilot.

---

## ⚡ Local Development

### Prerequisites
- PostgreSQL running locally with database `solana_transactions_db`.
- Rust (stable toolchain) & Node.js 20+.

### Step 1: Start the Backend Server
```powershell
cd be
cargo run
```
The server listens on `http://localhost:8080`.

### Step 2: Start the Frontend Client
```powershell
cd fe
npm run dev
```
The client dashboard opens on `http://localhost:5173`.

---

## 🔍 Verification

1. **Backend Verification**: `cd be && cargo check && cargo test`
2. **Frontend Verification**: `cd fe && npm run lint && npm run build`
3. **Container Build Verification**: `docker build -t solana-be ./be` and `docker build -t solana-fe ./fe`
