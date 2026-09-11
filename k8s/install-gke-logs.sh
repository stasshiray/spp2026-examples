#!/usr/bin/env bash
set -euo pipefail

# One-time GKE log viewer (Dozzle). Safe to re-run. Do not run against Docker Desktop.
k8s_dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$k8s_dir/gke-common.sh"
# shellcheck disable=SC1091
source "$k8s_dir/logs-common.sh"

gke_load_env
gke_require_cmds gcloud kubectl envsubst docker
gke_require_vars GCP_PROJECT_ID GKE_CLUSTER GKE_LOCATION INGRESS_DOMAIN
gke_credentials

if ! kubectl -n gateway get gateway main-envoy-gateway >/dev/null 2>&1; then
  echo "GKE Gateway is not installed. Run k8s/install-gke-gateway.sh once first." >&2
  exit 1
fi

if [ "$INGRESS_DOMAIN" = "sslip.io" ] || [ "$INGRESS_DOMAIN" = "nip.io" ]; then
  echo "INGRESS_DOMAIN must include the Gateway IP, e.g. 8.232.28.79.sslip.io (not sslip.io)." >&2
  exit 1
fi

require_metrics_api
apply_dozzle_stack "logs.${INGRESS_DOMAIN}"
echo "GKE already stores container logs in Cloud Logging. Tail them with: ./k8s/logs.sh --cloud"
