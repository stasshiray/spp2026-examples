# Shared helpers for the cluster log viewer. Source after gke-common.sh.
DOZZLE_IMAGE="${DOZZLE_IMAGE:-amir20/dozzle:v10.9.2}"
METRICS_SERVER_VERSION="${METRICS_SERVER_VERSION:-v0.8.0}"

metrics_api_ready() {
  kubectl get --raw /apis/metrics.k8s.io/v1beta1 >/dev/null 2>&1
}

# Dozzle panics without metrics.k8s.io ("failed to get pod metrics"). Docker Desktop
# does not ship Metrics Server; kubelet certs also need --kubelet-insecure-tls.
ensure_metrics_server() {
  if metrics_api_ready; then
    echo "Metrics API is ready"
    return 0
  fi

  gke_require_cmds kubectl
  echo "Installing metrics-server ${METRICS_SERVER_VERSION} (required by Dozzle)..."
  kubectl apply -f "https://github.com/kubernetes-sigs/metrics-server/releases/download/${METRICS_SERVER_VERSION}/components.yaml"

  local args
  args="$(kubectl -n kube-system get deploy metrics-server -o jsonpath='{.spec.template.spec.containers[0].args}' 2>/dev/null || true)"
  if [[ "$args" != *kubelet-insecure-tls* ]]; then
    echo "Patching metrics-server with --kubelet-insecure-tls (Docker Desktop / kind)..."
    kubectl -n kube-system patch deploy metrics-server --type='json' \
      -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
  fi

  kubectl -n kube-system rollout status deploy/metrics-server --timeout=3m

  local i
  for i in $(seq 1 30); do
    if metrics_api_ready; then
      echo "Metrics API is ready"
      return 0
    fi
    sleep 2
  done
  echo "Metrics API did not become ready. Dozzle will crash without it." >&2
  echo "Check: kubectl -n kube-system logs deploy/metrics-server" >&2
  exit 1
}

require_metrics_api() {
  if metrics_api_ready; then
    echo "Metrics API is ready"
    return 0
  fi
  echo "Metrics API (metrics.k8s.io) is missing. Dozzle panics without it." >&2
  echo "On GKE Standard it is usually enabled: kubectl get apiservice v1beta1.metrics.k8s.io" >&2
  exit 1
}

ensure_dozzle_auth_secret() {
  if kubectl -n logs get secret dozzle-users >/dev/null 2>&1; then
    echo "Secret dozzle-users already exists in logs"
    return 0
  fi

  gke_require_cmds kubectl docker openssl

  local user="${DOZZLE_USERNAME:-admin}"
  local password="${DOZZLE_PASSWORD:-}"
  if [ -z "$password" ]; then
    password="$(openssl rand -hex 16)"
  fi

  local tmp
  tmp="$(mktemp -d)"
  if ! docker run --rm "$DOZZLE_IMAGE" generate "$user" \
    --password "$password" --name Admin --email logs@localhost >"$tmp/users.yml"; then
    rm -rf "$tmp"
    echo "Failed to generate Dozzle users.yml (need Docker to run ${DOZZLE_IMAGE})" >&2
    return 1
  fi
  if [ ! -s "$tmp/users.yml" ]; then
    rm -rf "$tmp"
    echo "Dozzle generate produced an empty users.yml" >&2
    return 1
  fi

  kubectl -n logs create secret generic dozzle-users \
    --from-file=users.yml="$tmp/users.yml" \
    --from-literal=username="$user" \
    --from-literal=password="$password"
  rm -rf "$tmp"
}

dozzle_decode_secret() {
  local key="$1"
  kubectl -n logs get secret dozzle-users -o "jsonpath={.data.${key}}" | base64 --decode
  echo
}

print_dozzle_access() {
  local host="$1"
  local user password
  user="$(dozzle_decode_secret username | tr -d '\n')"
  password="$(dozzle_decode_secret password | tr -d '\n')"
  echo "Logs UI: http://${host}"
  echo "Login: ${user} / ${password}"
  echo "CLI follow: ./k8s/logs.sh"
  echo "Reprint password: kubectl -n logs get secret dozzle-users -o jsonpath='{.data.password}' | base64 --decode; echo"
}

apply_dozzle_stack() {
  local logs_host="${1:-}"
  if [ -z "$logs_host" ]; then
    echo "apply_dozzle_stack: hostname is required" >&2
    exit 1
  fi

  gke_require_cmds kubectl envsubst
  export DOZZLE_IMAGE
  export LOGS_HOST="$logs_host"

  envsubst '${DOZZLE_IMAGE}' < "$manifests/cluster/dozzle.yaml" | kubectl apply -f -
  ensure_dozzle_auth_secret
  envsubst '${LOGS_HOST}' < "$manifests/cluster/dozzle-httproute.yaml" | kubectl apply -f -
  # Restart so a crashloop from a missing Metrics API picks up the API we just installed.
  kubectl -n logs rollout restart deployment/dozzle
  kubectl -n logs rollout status deployment/dozzle --timeout=3m
  print_dozzle_access "$LOGS_HOST"
}
