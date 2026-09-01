# 🚀 GCP Deployment Guide: Solana Transactions on GKE Autopilot

This guide provides step-by-step instructions for deploying the **Solana Transactions** Indexer & Dashboard application to **Google Cloud Platform (GCP)** under the **Solana Transactions** project using **GKE Autopilot**, **Artifact Registry**, and automated **GitHub Actions CI/CD**.

---

## 🏗️ Architecture Overview

```mermaid
graph TD
    GH[GitHub Push / Release] -->|GitHub Actions| CI[CI/CD Workflow]
    CI -->|Build & Push| GAR[Artifact Registry (Docker)]
    CI -->|Deploy Manifests| GKE[GKE Autopilot Cluster]
    
    subgraph GKE Cluster: solana-transactions namespace
        ING[GKE Ingress / Load Balancer]
        FE[Frontend Deployment (Nginx + React SPA)]
        BE[Backend Deployment (Rust Axum + Indexer)]
        DB[(PostgreSQL StatefulSet / Cloud SQL)]
        
        ING -->|/*| FE
        ING -->|/api/*| BE
        FE -->|/api/ proxy| BE
        BE -->|SQLx (Pool)| DB
        BE -->|JSON-RPC| Solana[Solana Blockchain RPC]
    end
```

---

## ⚡ Quick Setup (Automated)

Run the automated GCP provisioning script from your terminal:

### On Linux / macOS:
```bash
chmod +x scripts/setup-gcp.sh
./scripts/setup-gcp.sh
```

### On Windows PowerShell:
```powershell
.\scripts\setup-gcp.ps1 -ProjectId "aiservice-solana-transactions" -Region "us-central1"
```

The script will automatically:
1. Enable all required GCP APIs (`container.googleapis.com`, `artifactregistry.googleapis.com`, `iam.googleapis.com`, etc.).
2. Create the Docker repository in **Google Artifact Registry** (`solana-transactions`).
3. Create the **GKE Autopilot Cluster** (`aiservice-solana-transactions-autopilot-cluster`).
4. Configure a Service Account (`github-actions-gke`) with `roles/container.developer` and `roles/artifactregistry.writer`.
5. Set up **Workload Identity Federation** (Keyless, zero-password Google Cloud authentication for GitHub Actions).

---

## 🔐 GitHub Secrets & Variables Configuration

Go to your repository settings on GitHub:
👉 `https://github.com/hanimounla/solana_transactions/settings/secrets/actions`

### 1. Repository Secrets (`Settings -> Secrets and variables -> Actions -> Secrets`)

| Secret Name                      | Description                                                            | Example / Source                                                                                  |
| :------------------------------- | :--------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full resource path of the WIF provider                                 | `projects/123456789/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `GCP_SERVICE_ACCOUNT`            | Email of deployer Service Account                                      | `github-actions-gke@aiservice-solana-transactions.iam.gserviceaccount.com`                        |
| `DATABASE_URL` *(Optional)*      | Custom DB string (if using Cloud SQL instead of in-cluster PostgreSQL) | `postgres://user:pass@10.x.x.x:5432/solana_transactions_db`                                       |
| `SOLANA_RPC_URL` *(Optional)*    | Private RPC endpoint (Helius, QuickNode, Alchemy)                      | `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY`                                                |

> [!NOTE]
> If using traditional Service Account keys instead of Workload Identity, provide `GCP_SA_KEY` with the JSON content of your downloaded service account key file.

### 2. Repository Variables (`Settings -> Secrets and variables -> Actions -> Variables`)

| Variable Name    | Default Value                                     | Description                                    |
| :--------------- | :------------------------------------------------ | :--------------------------------------------- |
| `GCP_PROJECT_ID` | `aiservice-solana-transactions`                   | GCP Project ID                                 |
| `GCP_REGION`     | `us-central1`                                     | GCP Region for Artifact Registry & GKE Cluster |
| `GKE_CLUSTER`    | `aiservice-solana-transactions-autopilot-cluster` | Name of the GKE Autopilot Cluster              |
| `GAR_REPOSITORY` | `solana-transactions`                             | Artifact Registry repository name              |

---

## 📦 Kubernetes Manifests Structure (`k8s/`)

| File                                                                                                                               | Description                                                                                  |
| :--------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| [`k8s/namespace.yaml`](file:///c:/Users/hanim/Work/Solana Transactions/solana_transactions/k8s/namespace.yaml)                     | Dedicated `solana-transactions` namespace.                                                   |
| [`k8s/configmap.yaml`](file:///c:/Users/hanim/Work/Solana Transactions/solana_transactions/k8s/configmap.yaml)                     | Non-sensitive configs (`PORT`, `SOLANA_RPC_URL`, `RUST_LOG`).                                |
| [`k8s/secret.yaml.template`](file:///c:/Users/hanim/Work/Solana Transactions/solana_transactions/k8s/secret.yaml.template)         | Secret template for database & RPC credentials.                                              |
| [`k8s/postgres.yaml`](file:///c:/Users/hanim/Work/Solana Transactions/solana_transactions/k8s/postgres.yaml)                       | StatefulSet + 20Gi `standard-rwo` PersistentVolumeClaim + Service for PostgreSQL.            |
| [`k8s/backend-deployment.yaml`](file:///c:/Users/hanim/Work/Solana Transactions/solana_transactions/k8s/backend-deployment.yaml)   | 2 replicas of the Rust backend, health probes on `/api/health`, Autopilot resource requests. |
| [`k8s/frontend-deployment.yaml`](file:///c:/Users/hanim/Work/Solana Transactions/solana_transactions/k8s/frontend-deployment.yaml) | 2 replicas of the Nginx/React frontend, health probes on `/healthz`.                         |
| [`k8s/ingress.yaml`](file:///c:/Users/hanim/Work/Solana Transactions/solana_transactions/k8s/ingress.yaml)                         | Cloud HTTP(S) Load Balancer routing `/api/*` to backend and `/*` to frontend.                |
| [`k8s/kustomization.yaml`](file:///c:/Users/hanim/Work/Solana Transactions/solana_transactions/k8s/kustomization.yaml)             | Kustomize bundling and dynamic image replacement.                                            |

---

## 🛠️ Manual Deployment via Kubectl

If you wish to deploy directly from your local machine:

1. **Connect to GKE Cluster**:
   ```bash
   gcloud container clusters get-credentials aiservice-solana-transactions-autopilot-cluster --region us-central1 --project aiservice-solana-transactions
   ```

2. **Apply Manifests**:
   ```bash
   kubectl apply -k k8s/
   ```

3. **Check Rollout & Status**:
   ```bash
   kubectl get pods,svc,ingress -n solana-transactions
   ```

---

## 🔍 Verification & Health Checking

- **Backend Health Check**:
  ```bash
  kubectl exec -it deployment/solana-transactions-be -n solana-transactions -- curl http://localhost:8080/health
  # Response: {"status":"ok","db":"connected"}
  ```

- **Frontend Health Check**:
  ```bash
  kubectl exec -it deployment/solana-transactions-fe -n solana-transactions -- wget -q -O - http://localhost/healthz
  # Response: OK
  ```

- **Ingress IP**:
  ```bash
  kubectl get ingress solana-transactions-ingress -n solana-transactions
  ```
