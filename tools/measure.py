#!/usr/bin/env python3
import json
import random
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

LOKI = "http://localhost:3100"
TEMPO = "http://localhost:3200"
HOT_WALLET = 777
SAMPLE = 300

mode, start, end = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
out_dir = f"results/raw/{mode}"
random.seed(42)


def get(url, params, timeout=120):
    full = f"{url}?{urllib.parse.urlencode(params)}"
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(full, timeout=timeout) as res:
            body = json.load(res)
            status = res.status
    except urllib.error.HTTPError as err:
        body, status = None, err.code
    return status, body, (time.perf_counter() - t0) * 1000


def loki(query, limit=20, runs=3):
    params = {"query": query, "start": start * 10**9, "end": end * 10**9, "limit": limit, "direction": "backward"}
    walls, body = [], None
    for _ in range(runs):
        status, body, wall = get(f"{LOKI}/loki/api/v1/query_range", params)
        walls.append(wall)
    summary = (body or {}).get("data", {}).get("stats", {}).get("summary", {})
    lines = [v[1] for s in (body or {}).get("data", {}).get("result", []) for v in s.get("values", [])]
    return {
        "query": query,
        "wallMsMedian": round(statistics.median(walls), 1),
        "results": len(lines),
        "bytesProcessed": summary.get("totalBytesProcessed"),
        "linesProcessed": summary.get("totalLinesProcessed"),
    }, lines


def loki_count(query):
    status, body, wall = get(f"{LOKI}/loki/api/v1/query", {"query": query, "time": end * 10**9})
    result = (body or {}).get("data", {}).get("result", [])
    return {"query": query, "value": float(result[0]["value"][1]) if result else 0.0, "wallMs": round(wall, 1)}


def tempo_search(q, limit=20, runs=3):
    params = {"q": q, "start": start, "end": end, "limit": limit, "spss": 3}
    walls, body = [], None
    for _ in range(runs):
        status, body, wall = get(f"{TEMPO}/api/search", params)
        walls.append(wall)
    metrics = (body or {}).get("metrics", {})
    return {
        "query": q,
        "wallMsMedian": round(statistics.median(walls), 1),
        "results": len((body or {}).get("traces", [])),
        "inspectedBytes": int(metrics.get("inspectedBytes", 0) or 0),
        "inspectedTraces": int(metrics.get("inspectedTraces", 0) or 0),
    }


def tempo_count(q):
    step = max(60, end - start)
    status, body, wall = get(f"{TEMPO}/api/metrics/query_range", {"q": q, "start": start, "end": end, "step": f"{step}s"})
    total = 0.0
    for series in (body or {}).get("series", []):
        for sample in series.get("samples", []):
            total += float(sample.get("value", 0))
    return {"query": q, "value": total, "status": status, "wallMs": round(wall, 1)}


def trace_found(trace_id):
    status, body, wall = get(f"{TEMPO}/api/v2/traces/{trace_id}", {})
    return status == 200 and bool(body and body.get("trace", {}).get("resourceSpans")), wall


def trace_ids(lines):
    ids = []
    for line in lines:
        try:
            tid = json.loads(line).get("trace_id")
        except json.JSONDecodeError:
            continue
        if tid:
            ids.append(tid)
    return list(dict.fromkeys(ids))


def coverage(name, query):
    _, lines = loki(query, limit=5000, runs=1)
    ids = trace_ids(lines)
    sample = random.sample(ids, min(SAMPLE, len(ids)))
    found, walls = 0, []
    for tid in sample:
        ok, wall = trace_found(tid)
        found += ok
        walls.append(wall)
    return {
        "case": name,
        "logQuery": query,
        "requestsInLoki": len(ids),
        "checkedInTempo": len(sample),
        "foundInTempo": found,
        "foundRate": round(found / len(sample), 4) if sample else None,
        "traceByIdMsMedian": round(statistics.median(walls), 1) if walls else None,
    }


def prom(path, pattern):
    total = 0.0
    for line in open(path):
        if line.startswith("#"):
            continue
        m = re.match(pattern, line)
        if m:
            total += float(line.rsplit(" ", 1)[1])
    return total


def prom_by(path, metric, label):
    out = {}
    for line in open(path):
        if line.startswith(metric + "{"):
            m = re.search(label + r'="([^"]*)"', line)
            key = m.group(1) if m else ""
            out[key] = out.get(key, 0.0) + float(line.rsplit(" ", 1)[1])
    return out


def resources():
    rows = [json.loads(l) for l in open(f"{out_dir}/stats.jsonl") if l.strip()]
    by = {}
    for r in rows:
        name = r["Name"].replace("loki-tempo-lab-", "").rsplit("-", 1)[0]
        cpu = float(r["CPUPerc"].rstrip("%"))
        mem = r["MemUsage"].split(" / ")[0]
        num, unit = re.match(r"([\d.]+)\s*([KMG]i?B)", mem).groups()
        mib = float(num) * {"KiB": 1 / 1024, "MiB": 1, "GiB": 1024, "KB": 1 / 1024, "MB": 1, "GB": 1024}[unit]
        by.setdefault(name, {"cpu": [], "mem": []})
        by[name]["cpu"].append(cpu)
        by[name]["mem"].append(mib)
    return {
        k: {"cpuAvgPct": round(statistics.mean(v["cpu"]), 1), "cpuMaxPct": round(max(v["cpu"]), 1), "memMaxMiB": round(max(v["mem"]), 1)}
        for k, v in by.items()
    }


k6 = json.load(open(f"{out_dir}/k6.json"))
disk = dict(line.split() for line in open(f"{out_dir}/disk.txt"))
disk = {k: int(v) for k, v in disk.items()}
requests = k6["requests"]

_, error_lines = loki('{service_name="command-api", level="error"}', limit=1, runs=1)
_, one_payment = loki('{service_name="command-api"} | json | route="/payments" | status="201"', limit=1, runs=1)
sample_trace = (trace_ids(one_payment) or [""])[0]

ingest = {
    "lokiBytes": prom(f"{out_dir}/loki.metrics", r'^loki_distributor_bytes_received_total\{.*is_internal_stream="false"'),
    "lokiStructuredMetadataBytes": prom(f"{out_dir}/loki.metrics", r'^loki_distributor_structured_metadata_bytes_received_total\{.*is_internal_stream="false"'),
    "lokiLines": prom(f"{out_dir}/loki.metrics", r'^loki_distributor_lines_received_total\{.*is_internal_stream="false"'),
    "lokiStreams": prom(f"{out_dir}/loki.metrics", r"^loki_ingester_streams_created_total\{"),
    "lokiDiscardedLinesByReason": prom_by(f"{out_dir}/loki.metrics", "loki_discarded_samples_total", "reason"),
    "tempoBytes": prom(f"{out_dir}/tempo.metrics", r"^tempo_distributor_bytes_received_total"),
    "tempoSpans": prom(f"{out_dir}/tempo.metrics", r"^tempo_distributor_spans_received_total"),
    "tempoDiscardedSpansByReason": prom_by(f"{out_dir}/tempo.metrics", "tempo_discarded_spans_total", "reason"),
}

loki_store = disk["loki_chunks"] + disk["loki_index"]
tempo_store = disk["tempo_blocks"]

report = {
    "mode": mode,
    "window": {"start": start, "end": end, "seconds": end - start},
    "k6": k6,
    "ingest": ingest,
    "disk": disk,
    "perRequest": {
        "lokiBytesReceived": round(ingest["lokiBytes"] / requests, 1),
        "tempoBytesReceived": round(ingest["tempoBytes"] / requests, 1),
        "lokiLines": round(ingest["lokiLines"] / requests, 2),
        "tempoSpans": round(ingest["tempoSpans"] / requests, 2),
        "lokiStoredBytes": round(loki_store / requests, 1),
        "tempoStoredBytes": round(tempo_store / requests, 1),
    },
    "resources": resources(),
    "counts": {
        "lokiPaymentErrors": loki_count(f'sum(count_over_time({{service_name="command-api", level="error"}} [{end - start}s]))'),
        "lokiSlowPayments": loki_count(
            f'sum(count_over_time({{service_name="command-api"}} | json | route="/payments" | duration_ms > 1000 [{end - start}s]))'
        ),
        "tempoErrorTraces": tempo_count('{ status = error && kind = server } | count_over_time()'),
        "tempoSlowPayments": tempo_count('{ name = "POST /payments" && duration > 1s } | count_over_time()'),
    },
    "queries": {
        "loki": {
            "errors": loki('{service_name="command-api", level="error"}')[0],
            "slowPayments": loki('{service_name="command-api"} | json | route="/payments" | duration_ms > 1000')[0],
            "hotWalletJson": loki(f'{{service_name=~"command-api|query-api"}} | json | wallet_id="{HOT_WALLET}"', limit=5000)[0],
            "hotWalletLineFilter": loki(f'{{service_name=~"command-api|query-api"}} |= `"wallet_id":{HOT_WALLET},`', limit=5000)[0],
            "byTraceId": loki(
                f'{{service_name=~".+"}} | trace_id="{sample_trace}"' if mode != "label" else f'{{trace_id="{sample_trace}"}}'
            )[0],
        },
        "tempo": {
            "errors": tempo_search("{ status = error }"),
            "slowPayments": tempo_search('{ name = "POST /payments" && duration > 1s }'),
            "slowAntifraud": tempo_search('{ name = "antifraud.check" && duration > 1s }'),
            "hotWallet": tempo_search(f"{{ span.wallet.id = {HOT_WALLET} }}", limit=5000),
        },
        "sampleTraceId": sample_trace,
    },
    "coverage": [
        coverage("errores", '{service_name="command-api", level="error"}'),
        coverage("lentos", '{service_name="command-api"} | json | route="/payments" | duration_ms > 1000'),
        coverage("normales", '{service_name="command-api"} | json | route="/payments" | status="201" | duration_ms < 100'),
        coverage("cliente-777", f'{{service_name=~"command-api|query-api"}} | json | wallet_id="{HOT_WALLET}"'),
    ],
}

json.dump(report, open(f"{out_dir}/report.json", "w"), indent=2)
print(json.dumps({k: report[k] for k in ("mode", "perRequest", "disk", "resources", "coverage")}, indent=2))
