#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for mode in full head10 tail label; do
  caffeinate -i tools/run.sh "$mode" > "results/raw-$mode.log" 2>&1
done
python3 tools/report.py
