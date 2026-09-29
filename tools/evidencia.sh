#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=results/evidencia
mkdir -p "$OUT"
LOKI=localhost:3100
TEMPO=localhost:3200

shot() {
  local file=$1; shift
  { echo "\$ $*"; bash -c "$*"; } > "$OUT/$file" 2>&1 || true
  echo "  $OUT/$file"
}

fresh() {
  docker compose rm -sf alloy loki tempo >/dev/null
  docker volume rm -f loki-tempo-lab_loki-data loki-tempo-lab_tempo-data loki-tempo-lab_alloy-data >/dev/null
  docker compose --profile projector --profile ui up -d --wait --force-recreate command-api query-api projector antifraud alloy loki tempo grafana >/dev/null
  sleep 20
}

load() {
  docker compose run --rm -e MODE="evidencia-$1" -e PHASE_MIN="$2" k6 run --quiet /load/incidentes.js > "$OUT/k6-$1.log" 2>&1
  sleep 30
}

if [ -z "${SKIP_FULL:-}" ]; then
echo "== 1/3 full: 100 % de trazas, trace_id como structured metadata"
export TRACE_RATIO=1 TRACES_MODE=full LOGS_MODE=metadata
fresh
load full 1

shot loki-errores.txt "curl -sG $LOKI/loki/api/v1/query_range --data-urlencode 'query={service_name=\"command-api\", level=\"error\"}' --data-urlencode limit=3 | jq -c '.data.result[].values[][1] | fromjson | {time, level, msg, wallet_id, antifraud_status, trace_id}'"
shot loki-lentos.txt "curl -sG $LOKI/loki/api/v1/query_range --data-urlencode 'query={service_name=\"command-api\"} | json | route=\"/payments\" | duration_ms > 1000' --data-urlencode limit=3 | jq -c '.data.result[].values[][1] | fromjson | {time, msg, route, status, duration_ms, trace_id}'"
shot tempo-lentos.txt "curl -sG $TEMPO/api/search --data-urlencode 'q={ name = \"antifraud.check\" && duration > 1s }' --data-urlencode limit=5 | jq -r '.traces[] | [.traceID, .rootServiceName, .rootTraceName, (.durationMs|tostring) + \" ms\"] | @tsv'"
SLOW=$(curl -sG $TEMPO/api/search --data-urlencode 'q={ name = "antifraud.check" && duration > 1s }' --data-urlencode limit=1 | jq -r '.traces[0].traceID')
ERR=$(curl -sG $TEMPO/api/search --data-urlencode 'q={ name = "antifraud.check" && status = error }' --data-urlencode limit=1 | jq -r '.traces[0].traceID')
OK=$(curl -sG $TEMPO/api/search --data-urlencode 'q={ name = "POST /payments" && status != error && duration < 50ms }' --data-urlencode limit=1 | jq -r '.traces[0].traceID')
shot traza-lenta.txt "tools/traza.py $SLOW"
shot traza-error.txt "tools/traza.py $ERR"
shot traza-normal.txt "tools/traza.py $OK"
echo "$SLOW $ERR $OK" > "$OUT/trazas.txt"
fi
[ -n "${STOP_AFTER_FULL:-}" ] && { echo "== stack en modo full, con Grafana en :3000"; exit 0; }

if [[ " ${PHASES:-head10 label} " == *" head10 "* ]]; then
echo "== 2/3 head10: head sampling al 10 %"
export TRACE_RATIO=0.1 TRACES_MODE=full LOGS_MODE=metadata
fresh
load head10 0.5
shot head10-trazas.txt "curl -sG $LOKI/loki/api/v1/query_range --data-urlencode 'query={service_name=\"command-api\", level=\"error\"}' --data-urlencode limit=10 | jq -r '.data.result[].values[][1] | fromjson | .trace_id' | while read id; do printf '%s  %s spans\\n' \$id \$(curl -s $TEMPO/api/v2/traces/\$id | jq '[.trace.resourceSpans[]?.scopeSpans[]?.spans[]?] | length'); done"

fi
if [[ " ${PHASES:-head10 label} " == *" label "* ]]; then
echo "== 3/3 label: trace_id como label de Loki"
export TRACE_RATIO=1 TRACES_MODE=full LOGS_MODE=label
fresh
load label 0.5
shot label-limite.txt "docker compose logs loki | grep -m1 -o 'maximum active stream limit exceeded[^}]*}'"
shot label-metricas.txt "curl -s $LOKI/metrics | grep -E '^loki_(discarded_samples_total|ingester_memory_streams|ingester_streams_created_total)\\{'"

fi
echo "== listo; el stack queda en modo label: tools/run.sh o docker compose up para volver a full"
