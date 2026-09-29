#!/usr/bin/env python3
import json
import os

MODES = [("full", "100 % de trazas"), ("head10", "Head 10 %"), ("tail", "Tail (errores + lentos + 10 %)"), ("label", "trace_id como label")]
reports = {m: json.load(open(f"results/raw/{m}/report.json")) for m, _ in MODES if os.path.exists(f"results/raw/{m}/report.json")}


def mb(b):
    return f"{b / 1024 / 1024:,.1f} MB"


lines = ["# Resultados de loki-tempo-lab", ""]
lines += ["## Carga y costo por request", ""]
lines += ["| Modo | Requests | Líneas de log | Spans | Recibido Loki | Recibido Tempo | Disco Loki (chunks + índice) | Disco Tempo (bloques) | Streams de Loki | Líneas descartadas |", "|---|---|---|---|---|---|---|---|---|---|"]
for m, name in MODES:
    r = reports.get(m)
    if not r:
        continue
    i, d, n = r["ingest"], r["disk"], r["k6"]["requests"]
    lines.append(
        f"| {name} | {n:,} | {int(i['lokiLines']):,} | {int(i['tempoSpans']):,} | {mb(i['lokiBytes'])} | {mb(i['tempoBytes'])} | "
        f"{mb(d['loki_chunks'] + d['loki_index'])} | {mb(d['tempo_blocks'])} | {int(i['lokiStreams']):,} | {int(sum(i['lokiDiscardedLinesByReason'].values())):,} |"
    )
lines += ["", "## Por request", "", "| Modo | Bytes a Loki | Bytes a Tempo | Disco Loki | Disco Tempo |", "|---|---|---|---|---|"]
for m, name in MODES:
    r = reports.get(m)
    if r:
        p = r["perRequest"]
        lines.append(f"| {name} | {p['lokiBytesReceived']} | {p['tempoBytesReceived']} | {p['lokiStoredBytes']} | {p['tempoStoredBytes']} |")
lines += ["", "## ¿Está la traza en Tempo? (muestra de hasta 300 requests por caso, tomadas de los logs de Loki)", ""]
lines += ["| Modo | Errores | Lentos | Normales | Cliente 777 |", "|---|---|---|---|---|"]
for m, name in MODES:
    r = reports.get(m)
    if r:
        c = {x["case"]: x for x in r["coverage"]}
        cell = lambda k: f"{c[k]['foundInTempo']}/{c[k]['checkedInTempo']} ({c[k]['foundRate'] * 100:.0f} %)" if c[k]["checkedInTempo"] else "—"
        lines.append(f"| {name} | {cell('errores')} | {cell('lentos')} | {cell('normales')} | {cell('cliente-777')} |")
lines += ["", "## Consultas (mediana de 3 ejecuciones, ventana completa de la corrida)", ""]
lines += ["| Modo | Backend | Consulta | ms | Resultados | Bytes leídos |", "|---|---|---|---|---|---|"]
for m, name in MODES:
    r = reports.get(m)
    if not r:
        continue
    for k, q in r["queries"]["loki"].items():
        lines.append(f"| {name} | Loki | `{q['query']}` | {q['wallMsMedian']} | {q['results']} | {mb(q['bytesProcessed'] or 0)} |")
    for k, q in r["queries"]["tempo"].items():
        lines.append(f"| {name} | Tempo | `{q['query']}` | {q['wallMsMedian']} | {q['results']} | {mb(q['inspectedBytes'])} |")
lines += ["", "## Recursos durante la carga (docker stats cada 5 s)", "", "| Modo | Loki CPU prom. | Loki RAM máx. | Tempo CPU prom. | Tempo RAM máx. | Alloy CPU prom. | Alloy RAM máx. |", "|---|---|---|---|---|---|---|"]
for m, name in MODES:
    r = reports.get(m)
    if r:
        s = r["resources"]
        lines.append(
            f"| {name} | {s['loki']['cpuAvgPct']} % | {s['loki']['memMaxMiB']} MiB | {s['tempo']['cpuAvgPct']} % | {s['tempo']['memMaxMiB']} MiB | {s['alloy']['cpuAvgPct']} % | {s['alloy']['memMaxMiB']} MiB |"
        )
lines += ["", "## Latencia de la API durante la corrida (k6, ms)", "", "| Modo | Pago p50 | Pago p99 | Pagos fallidos | Estado de cuenta p99 |", "|---|---|---|---|---|"]
for m, name in MODES:
    r = reports.get(m)
    if r:
        e = r["k6"]["endpoints"]
        lines.append(f"| {name} | {e['pay']['p50']:.1f} | {e['pay']['p99']:.1f} | {e['pay']['failedRate'] * 100:.2f} % | {e['statement']['p99']:.1f} |")
open("results/summary.md", "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
