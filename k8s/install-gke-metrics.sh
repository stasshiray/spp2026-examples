#!/usr/bin/env bash
set -euo pipefail

# One-time GKE metrics (Managed Prometheus + Cloud Monitoring dashboard).
# Safe to re-run. Do not run against Docker Desktop.
k8s_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$k8s_dir/gke-common.sh"

gke_load_env
gke_require_cmds gcloud kubectl python3
gke_require_vars GCP_PROJECT_ID GKE_CLUSTER GKE_LOCATION
gke_credentials

if ! kubectl -n gateway get gateway main-envoy-gateway >/dev/null 2>&1; then
  echo "GKE Gateway is not installed. Run k8s/install-gke-gateway.sh once first." >&2
  exit 1
fi

CLOUD_MONITORING_DASHBOARD_TITLE="Dating App API"

gmp_enabled() {
  local value
  value="$(gcloud container clusters describe "$GKE_CLUSTER" \
    --location "$GKE_LOCATION" \
    --project "$GCP_PROJECT_ID" \
    --format='value(monitoringConfig.managedPrometheusConfig.enabled)' 2>/dev/null || true)"
  [[ "$value" == "True" || "$value" == "true" ]]
}

ensure_managed_prometheus() {
  if gmp_enabled; then
    echo "Google Managed Prometheus is enabled"
    return 0
  fi

  echo "Enabling Google Managed Prometheus on ${GKE_CLUSTER}..."
  gcloud container clusters update "$GKE_CLUSTER" \
    --location "$GKE_LOCATION" \
    --project "$GCP_PROJECT_ID" \
    --enable-managed-prometheus

  local i
  for i in $(seq 1 30); do
    if gmp_enabled; then
      echo "Google Managed Prometheus is enabled"
      return 0
    fi
    sleep 4
  done
  echo "Managed Prometheus did not report as enabled. Check the cluster monitoring settings." >&2
  exit 1
}

wait_for_gmp_crd() {
  echo "Waiting for ClusterPodMonitoring CRD..."
  local i
  for i in $(seq 1 45); do
    if kubectl get crd clusterpodmonitorings.monitoring.googleapis.com >/dev/null 2>&1; then
      kubectl wait --for=condition=Established \
        crd/clusterpodmonitorings.monitoring.googleapis.com --timeout=2m
      return 0
    fi
    sleep 4
  done
  echo "CRD clusterpodmonitorings.monitoring.googleapis.com did not appear." >&2
  echo "Confirm Managed Prometheus: gcloud container clusters describe ${GKE_CLUSTER} --location ${GKE_LOCATION}" >&2
  exit 1
}

apply_cluster_pod_monitoring() {
  kubectl apply -f "$manifests/cluster/clusterpodmonitoring.yaml"
}

find_cloud_monitoring_dashboard() {
  local names
  names="$(gcloud monitoring dashboards list \
    --project="$GCP_PROJECT_ID" \
    --filter="displayName=\"${CLOUD_MONITORING_DASHBOARD_TITLE}\"" \
    --format='value(name)')"
  printf '%s' "${names%%$'\n'*}"
}

ensure_cloud_monitoring_dashboard() {
  local file="$manifests/cluster/cloud-monitoring-dashboard.json"
  local existing tmp dashboard_id
  existing="$(find_cloud_monitoring_dashboard)"

  if [ -z "$existing" ]; then
    echo "Creating Cloud Monitoring dashboard '${CLOUD_MONITORING_DASHBOARD_TITLE}'..."
    gcloud monitoring dashboards create \
      --project="$GCP_PROJECT_ID" \
      --config-from-file="$file"
    existing="$(find_cloud_monitoring_dashboard)"
  else
    echo "Updating Cloud Monitoring dashboard ${existing}..."
    tmp="$(mktemp)"
    python3 - "$file" "$existing" "$tmp" <<'PY'
import json
import sys

src, name, dst = sys.argv[1], sys.argv[2], sys.argv[3]
with open(src, encoding="utf-8") as handle:
    data = json.load(handle)
data["name"] = name
with open(dst, "w", encoding="utf-8") as handle:
    json.dump(data, handle)
PY
    gcloud monitoring dashboards update "$existing" \
      --project="$GCP_PROJECT_ID" \
      --config-from-file="$tmp"
    rm -f "$tmp"
  fi

  if [ -z "$existing" ]; then
    echo "Cloud Monitoring dashboard was created but could not be listed. Open Metrics Explorer." >&2
    return 0
  fi

  dashboard_id="${existing##*/}"
  echo "Dashboard: https://console.cloud.google.com/monitoring/dashboards/custom/${dashboard_id}?project=${GCP_PROJECT_ID}"
}

print_gke_metrics_access() {
  echo "Metrics Explorer (PromQL): https://console.cloud.google.com/monitoring/metrics-explorer?project=${GCP_PROJECT_ID}"
  echo "Example query: sum by (namespace, route) (rate(http_request_duration_seconds_count[1m]))"
  echo "Filter by namespace (git branch). Custom GMP metrics are billed; lecture traffic is cheap."
  echo "GKE already stores container CPU/memory as kubernetes.io/container/* — this install only scrapes API /metrics."
}

ensure_managed_prometheus
wait_for_gmp_crd
apply_cluster_pod_monitoring
ensure_cloud_monitoring_dashboard
print_gke_metrics_access
echo "GKE metrics are ready after an API deploy: ./k8s/deploy-gke-kubernetes.sh"
