#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MODE=${1:?uso: tools/run.sh full|head10|tail|label}
case "$MODE" in
  full)   export TRACE_RATIO=1   TRACES_MODE=full LOGS_MODE=metadata ;;
  head10) export TRACE_RATIO=0.1 TRACES_MODE=full LOGS_MODE=metadata ;;
  tail)   export TRACE_RATIO=1   TRACES_MODE=tail LOGS_MODE=metadata ;;
  label)  export TRACE_RATIO=1   TRACES_MODE=full LOGS_MODE=label ;;
  *) echo "modo desconocido: $MODE" >&2; exit 1 ;;
esac

OUT=results/raw/$MODE
rm -rf "$OUT" && mkdir -p "$OUT"

echo "== $MODE: Loki, Tempo y Alloy desde cero"
docker compose rm -sf alloy loki tempo >/dev/null
docker volume rm -f loki-tempo-lab_loki-data loki-tempo-lab_tempo-data loki-tempo-lab_alloy-data >/dev/null
docker compose --profile projector up -d --wait --force-recreate command-api query-api projector antifraud alloy loki tempo >/dev/null
sleep 20

START=$(date +%s)
( while true; do docker stats --no-stream --format '{{json .}}' loki-tempo-lab-loki-1 loki-tempo-lab-tempo-1 loki-tempo-lab-alloy-1 >> "$OUT/stats.jsonl"; sleep 5; done ) &
SAMPLER=$!
trap 'kill $SAMPLER 2>/dev/null || true' EXIT

docker compose run --rm -e MODE="$MODE" -e PHASE_MIN="${PHASE_MIN:-2}" k6 run --quiet /load/incidentes.js > "$OUT/k6.log" 2>&1
END=$(date +%s)
kill $SAMPLER 2>/dev/null || true

echo "== $MODE: esperando la decisión de muestreo y el envío por lotes"
sleep 30
curl -s -XPOST localhost:3100/flush >/dev/null || true

du_of() { docker run --rm -v "loki-tempo-lab_$1-data:/d:ro" alpine sh -c "du -sb $2 2>/dev/null | awk '{s+=\$1} END {print s+0}'"; }
prev=-1
for i in $(seq 1 20); do
  now=$(du_of tempo /d/blocks)
  [ "$now" = "$prev" ] && [ "$now" != "0" ] && break
  prev=$now
  sleep 30
done

curl -s localhost:3100/metrics > "$OUT/loki.metrics"
curl -s localhost:3200/metrics > "$OUT/tempo.metrics"
curl -s localhost:12345/metrics > "$OUT/alloy.metrics"
{
  echo "loki_chunks $(du_of loki /d/chunks)"
  echo "loki_index $(du_of loki '/d/tsdb-shipper-active /d/tsdb-shipper-cache')"
  echo "loki_wal $(du_of loki /d/wal)"
  echo "tempo_blocks $(du_of tempo /d/blocks)"
  echo "tempo_live_store $(du_of tempo /d/live-store)"
  echo "tempo_wal $(du_of tempo /d/wal)"
} > "$OUT/disk.txt"
echo "$START $END" > "$OUT/window"

python3 tools/measure.py "$MODE" "$START" "$END"
