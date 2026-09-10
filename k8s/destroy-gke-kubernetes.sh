#!/usr/bin/env bash
set -euo pipefail

k8s_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$k8s_dir/gke-common.sh"

cd "$repo_root"

gke_load_env
gke_require_cmds gcloud kubectl
gke_require_vars GCP_PROJECT_ID GKE_CLUSTER GKE_LOCATION
gke_credentials

ns="$(gke_namespace)"
gke_protect_namespace "$ns"

echo "Deleting namespace $ns"
kubectl delete namespace "$ns" --wait=true --timeout=5m
