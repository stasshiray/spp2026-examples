# Shared helpers for the local metrics stack (Prometheus + Grafana). Source after gke-common.sh.
PROMETHEUS_IMAGE="${PROMETHEUS_IMAGE:-prom/prometheus:v2.55.1}"
GRAFANA_IMAGE="${GRAFANA_IMAGE:-grafana/grafana:11.5.2}"

ensure_grafana_admin_secret() {
  if kubectl -n metrics get secret grafana-admin >/dev/null 2>&1; then
    echo "Secret grafana-admin already exists in metrics"
    return 0
  fi

  gke_require_cmds kubectl openssl

  local user="${GRAFANA_USERNAME:-admin}"
  local password="${GRAFANA_PASSWORD:-}"
  if [ -z "$password" ]; then
    password="$(openssl rand -hex 16)"
  fi

  kubectl -n metrics create secret generic grafana-admin \
    --from-literal=username="$user" \
    --from-literal=password="$password"
}

grafana_decode_secret() {
  local key="$1"
  kubectl -n metrics get secret grafana-admin -o "jsonpath={.data.${key}}" | base64 --decode
  echo
}

print_grafana_access() {
  local host="$1"
  local user password
  user="$(grafana_decode_secret username | tr -d '\n')"
  password="$(grafana_decode_secret password | tr -d '\n')"
  echo "Metrics UI: http://${host}"
  echo "Login: ${user} / ${password}"
  echo "Dashboard: Dating App API (provisioned)"
  echo "Reprint password: kubectl -n metrics get secret grafana-admin -o jsonpath='{.data.password}' | base64 --decode; echo"
}

apply_grafana_dashboards_configmap() {
  kubectl -n metrics create configmap grafana-dashboards \
    --from-file=api.json="$manifests/cluster/grafana-dashboard.json" \
    --dry-run=client -o yaml | kubectl apply -f -
}

apply_metrics_stack() {
  local metrics_host="${1:-}"
  if [ -z "$metrics_host" ]; then
    echo "apply_metrics_stack: hostname is required" >&2
    exit 1
  fi

  gke_require_cmds kubectl envsubst
  export PROMETHEUS_IMAGE
  export GRAFANA_IMAGE
  export METRICS_HOST="$metrics_host"

  envsubst '${PROMETHEUS_IMAGE}' < "$manifests/cluster/prometheus.yaml" | kubectl apply -f -
  ensure_grafana_admin_secret
  apply_grafana_dashboards_configmap
  envsubst '${GRAFANA_IMAGE}' < "$manifests/cluster/grafana.yaml" | kubectl apply -f -
  envsubst '${METRICS_HOST}' < "$manifests/cluster/grafana-httproute.yaml" | kubectl apply -f -

  kubectl -n metrics rollout status deployment/prometheus --timeout=3m
  kubectl -n metrics rollout status deployment/grafana --timeout=3m
  print_grafana_access "$METRICS_HOST"
}
