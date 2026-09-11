#!/usr/bin/env bash
set -euo pipefail

# One-time Docker Desktop log viewer (Dozzle). Safe to re-run.
k8s_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$k8s_dir/gke-common.sh"
# shellcheck disable=SC1091
source "$k8s_dir/logs-common.sh"

if ! kubectl get gatewayclass eg >/dev/null 2>&1; then
  echo "Local Gateway is not installed. Run k8s/install-local-gateway.sh once first." >&2
  exit 1
fi

ensure_metrics_server
apply_dozzle_stack "logs.localhost"
echo "Local logs UI is ready. Follow a branch with k8s/logs.sh"
