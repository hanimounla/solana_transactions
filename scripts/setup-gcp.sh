#!/usr/bin/env bash
# ==============================================================================
# Setup GCP Infrastructure for Solana Transactions - Solana Transactions (GKE Autopilot)
# ==============================================================================

set -euo pipefail

# Configuration Defaults (adjust as needed)
PROJECT_ID="${GCP_PROJECT_ID:-aiservice-solana-transactions}"
REGION="${GCP_REGION:-us-central1}"
CLUSTER_NAME="autopilot-cluster"
GAR_REPO="${GAR_REPOSITORY:-solana-transactions}"
SA_NAME="github-actions-gke"
GITHUB_REPO="hanimounla/solana_transactions"

echo "======================================================================"
echo "🚀 Setting up GCP Resources for project: ${PROJECT_ID}"
echo "   Region:       ${REGION}"
echo "   GKE Cluster:  ${CLUSTER_NAME} (Autopilot)"
echo "   Artifact Reg: ${GAR_REPO}"
echo "   GitHub Repo:  ${GITHUB_REPO}"
echo "======================================================================"

# Check if gcloud CLI is installed
if ! command -v gcloud &> /dev/null; then
  echo "❌ ERROR: 'gcloud' CLI is not found in your PATH."
  echo "Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
  echo "OR run this script directly in Google Cloud Shell (https://shell.cloud.google.com)."
  exit 1
fi

# 1. Set Active Project
gcloud config set project "${PROJECT_ID}"

# 2. Enable Required GCP APIs
echo "📦 Enabling GCP APIs..."
gcloud services enable \
  container.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com \
  compute.googleapis.com

# 3. Create Artifact Registry Repository (if not existing)
echo "🐳 Creating Artifact Registry repository: ${GAR_REPO} in ${REGION}..."
if ! gcloud artifacts repositories describe "${GAR_REPO}" --location="${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${GAR_REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Docker repository for Solana Transactions dashboard and indexer"
  echo "✅ Artifact Registry repository created."
else
  echo "ℹ️  Artifact Registry repository already exists."
fi

# 4. Create GKE Autopilot Cluster (if not existing)
echo "☸️  Creating GKE Autopilot Cluster: ${CLUSTER_NAME}..."
if ! gcloud container clusters describe "${CLUSTER_NAME}" --region="${REGION}" >/dev/null 2>&1; then
  gcloud container clusters create-auto "${CLUSTER_NAME}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --release-channel="regular"
  echo "✅ GKE Autopilot Cluster created."
else
  echo "ℹ️  GKE Cluster already exists."
fi

# 5. Create Service Account for GitHub Actions
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
echo "👤 Configuring Service Account: ${SA_EMAIL}..."

if ! gcloud iam service-accounts describe "${SA_EMAIL}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="GitHub Actions GKE Deployer"
  echo "✅ Service account created."
fi

# Assign GKE Developer and Artifact Registry Writer roles
echo "🔑 Granting IAM roles..."
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/container.developer" \
  --quiet >/dev/null

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.writer" \
  --quiet >/dev/null

# 6. Configure Workload Identity Federation (Keyless GitHub Actions)
echo "🔒 Configuring Workload Identity Federation for GitHub Actions..."
POOL_NAME="github-pool"
PROVIDER_NAME="github-provider"
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')

# Create Workload Identity Pool if not exists
if ! gcloud iam workload-identity-pools describe "${POOL_NAME}" --location="global" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "${POOL_NAME}" \
    --location="global" \
    --display-name="GitHub Actions Pool"
fi

# Create Workload Identity Provider if not exists
if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_NAME}" \
  --workload-identity-pool="${POOL_NAME}" --location="global" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_NAME}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --workload-identity-pool="${POOL_NAME}" \
    --display-name="GitHub Provider" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository == '${GITHUB_REPO}'"
fi

# Bind Service Account to GitHub Repo
WIF_PRINCIPAL="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${GITHUB_REPO}"

gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="${WIF_PRINCIPAL}" \
  --quiet >/dev/null

gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --member="${WIF_PRINCIPAL}" \
  --quiet >/dev/null

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --quiet >/dev/null

WIF_PROVIDER_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/providers/${PROVIDER_NAME}"

echo ""
echo "======================================================================"
echo "🎉 Setup Complete! Add the following secrets to GitHub Repository:"
echo "   URL: https://github.com/${GITHUB_REPO}/settings/secrets/actions"
echo "======================================================================"
echo ""
echo "📌 Option A: Workload Identity Federation (Recommended)"
echo "   Secret Name: GCP_WORKLOAD_IDENTITY_PROVIDER"
echo "   Value:       ${WIF_PROVIDER_RESOURCE}"
echo ""
echo "   Secret Name: GCP_SERVICE_ACCOUNT"
echo "   Value:       ${SA_EMAIL}"
echo ""
echo "📌 Repository Variables (https://github.com/${GITHUB_REPO}/settings/variables/actions):"
echo "   GCP_PROJECT_ID: ${PROJECT_ID}"
echo "   GCP_REGION:     ${REGION}"
echo "   GKE_CLUSTER:    ${CLUSTER_NAME}"
echo "   GAR_REPOSITORY: ${GAR_REPO}"
echo ""
echo "📌 Optional Secrets:"
echo "   DATABASE_URL: (Override in-cluster PostgreSQL with Cloud SQL if desired)"
echo "   SOLANA_RPC_URL: (Your private Solana RPC endpoint if desired)"
echo "======================================================================"
