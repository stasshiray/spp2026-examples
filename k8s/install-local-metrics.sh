#!/usr/bin/env bash
set -euo pipefail

# One-time Docker Desktop metrics stack (Prometheus + Grafana). Safe to re-run.
k8s_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$k8s_dir/gke-common.sh"
# shellcheck disable=SC1091
source "$k8s_dir/metrics-common.sh"

if ! kubectl get gatewayclass eg >/dev/null 2>&1; then
  echo "Local Gateway is not installed. Run k8s/install-local-gateway.sh once first." >&2
  exit 1
fi

apply_metrics_stack "metrics.localhost"
echo "Local metrics UI is ready. Open http://metrics.localhost after deploying an API with ./k8s/deploy-local-kubernetes.sh"
