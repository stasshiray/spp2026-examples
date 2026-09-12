#!/usr/bin/env bash
set -euo pipefail

# Remove lecture workloads from GKE (namespaces, Gateway LB, logs, metrics scrape,
# Cloud Monitoring dashboard, Artifact Registry). Keeps the GKE cluster, GitHub
# Actions SA / WIF, and the GCP project.
#
# Usage: ./k8s/teardown-gke.sh [--yes] [--keep-registry]
k8s_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$k8s_dir/gke-common.sh"

CONFIRM_YES=0
KEEP_REGISTRY=0
for arg in "$@"; do
  case "$arg" in
    --yes) CONFIRM_YES=1 ;;
    --keep-registry) KEEP_REGISTRY=1 ;;
    -h|--help)
      echo "Usage: $0 [--yes] [--keep-registry]"
      echo "  --yes            skip typing the cluster name"
      echo "  --keep-registry  leave Artifact Registry images (small storage cost)"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

gke_load_env
gke_require_cmds gcloud
gke_require_vars GCP_PROJECT_ID GKE_CLUSTER GKE_LOCATION
AR_REPOSITORY="${AR_REPOSITORY:-repository-1}"
CLOUD_MONITORING_DASHBOARD_TITLE="Dating App API"

cluster_exists() {
  gcloud container clusters describe "$GKE_CLUSTER" \
    --location "$GKE_LOCATION" \
    --project "$GCP_PROJECT_ID" >/dev/null 2>&1
}

confirm_teardown() {
  if [ "$CONFIRM_YES" -eq 1 ]; then
    return 0
  fi
  if [ ! -t 0 ]; then
    echo "Refusing to tear down without a TTY. Re-run with --yes." >&2
    exit 1
  fi
  echo "This deletes lecture resources in project ${GCP_PROJECT_ID}."
  echo "The GKE cluster ${GKE_CLUSTER} (${GKE_LOCATION}) is kept."
  echo "  - Gateway / global HTTP(S) load balancer"
  echo "  - namespaces labeled app.kubernetes.io/part-of=dating-app (apps, gateway, logs)"
  echo "  - ClusterPodMonitoring dating-app-api and Cloud Monitoring dashboard '${CLOUD_MONITORING_DASHBOARD_TITLE}'"
  if [ "$KEEP_REGISTRY" -eq 0 ]; then
    echo "  - Artifact Registry ${GCP_REGION:-<GCP_REGION>}/${AR_REPOSITORY} (all images)"
  else
    echo "  - Artifact Registry kept (--keep-registry)"
  fi
  echo "GitHub Actions SA and Workload Identity Federation are not deleted."
  echo
  printf "Type the cluster name (%s) to confirm: " "$GKE_CLUSTER"
  local typed
  read -r typed
  if [ "$typed" != "$GKE_CLUSTER" ]; then
    echo "Aborted." >&2
    exit 1
  fi
}

delete_in_cluster() {
  echo "Getting cluster credentials..."
  gcloud container clusters get-credentials "$GKE_CLUSTER" \
    --location "$GKE_LOCATION" \
    --project "$GCP_PROJECT_ID"
  gke_require_cmds kubectl

  echo "Deleting ClusterPodMonitoring dating-app-api..."
  kubectl delete clusterpodmonitoring dating-app-api --ignore-not-found=true 2>/dev/null || true

  echo "Deleting namespaces labeled app.kubernetes.io/part-of=dating-app (Gateway LB tears down here)..."
  local nss
  nss="$(kubectl get ns -l app.kubernetes.io/part-of=dating-app -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true)"
  if [ -n "${nss:-}" ]; then
    echo "  ${nss}"
    # Gateway LB release can take several minutes.
    kubectl delete ns -l app.kubernetes.io/part-of=dating-app --wait=true --timeout=15m
  else
    echo "  none found"
  fi

  echo "Deleting leftover ClusterRoles from Dozzle / local Prometheus..."
  kubectl delete clusterrole dozzle prometheus --ignore-not-found=true
  kubectl delete clusterrolebinding dozzle prometheus --ignore-not-found=true
}

delete_cloud_monitoring_dashboard() {
  local existing
  existing="$(gcloud monitoring dashboards list \
    --project="$GCP_PROJECT_ID" \
    --filter="displayName=\"${CLOUD_MONITORING_DASHBOARD_TITLE}\"" \
    --format='value(name)' 2>/dev/null || true)"
  existing="${existing%%$'\n'*}"
  if [ -z "$existing" ]; then
    echo "Cloud Monitoring dashboard '${CLOUD_MONITORING_DASHBOARD_TITLE}' not found"
    return 0
  fi
  echo "Deleting Cloud Monitoring dashboard ${existing}..."
  gcloud monitoring dashboards delete "$existing" --project="$GCP_PROJECT_ID" --quiet
}

delete_artifact_registry() {
  if [ "$KEEP_REGISTRY" -eq 1 ]; then
    echo "Keeping Artifact Registry (--keep-registry)"
    return 0
  fi
  if [ -z "${GCP_REGION:-}" ]; then
    echo "GCP_REGION is unset; skip Artifact Registry delete. Set it in k8s/gke.env to remove image storage." >&2
    return 0
  fi
  if ! gcloud artifacts repositories describe "$AR_REPOSITORY" \
    --location="$GCP_REGION" \
    --project="$GCP_PROJECT_ID" >/dev/null 2>&1; then
    echo "Artifact Registry ${AR_REPOSITORY} already gone"
    return 0
  fi
  echo "Deleting Artifact Registry ${AR_REPOSITORY} in ${GCP_REGION}..."
  gcloud artifacts repositories delete "$AR_REPOSITORY" \
    --location="$GCP_REGION" \
    --project="$GCP_PROJECT_ID" \
    --quiet
}

print_done() {
  echo
  echo "Lecture resources are gone. Cluster ${GKE_CLUSTER} is still running (nodes still bill)."
  echo "Gateway LB is deleted. Bring the app back with:"
  echo "  ./k8s/create-gke-artifact-registry.sh   # if the registry was deleted"
  echo "  ./k8s/install-gke-gateway.sh"
  echo "  ./k8s/install-gke-logs.sh"
  echo "  ./k8s/install-gke-metrics.sh"
  echo "  ./k8s/deploy-gke-kubernetes.sh"
}

confirm_teardown
if cluster_exists; then
  delete_in_cluster
else
  echo "Cluster ${GKE_CLUSTER} not found; cleaning leftover project resources"
fi
delete_cloud_monitoring_dashboard
delete_artifact_registry
print_done
