#!/usr/bin/env python3
import json
import sys
import urllib.request

trace_id = sys.argv[1]
with urllib.request.urlopen(f"http://localhost:3200/api/v2/traces/{trace_id}", timeout=30) as res:
    body = json.load(res)


def attr(span, key):
    for a in span.get("attributes", []):
        if a["key"] == key:
            return next(iter(a["value"].values()))
    return None


spans = {}
for rs in body["trace"]["resourceSpans"]:
    service = next(a["value"]["stringValue"] for a in rs["resource"]["attributes"] if a["key"] == "service.name")
    for ss in rs["scopeSpans"]:
        for s in ss["spans"]:
            name = s["name"]
            server = attr(s, "server.address")
            if s.get("kind") == "SPAN_KIND_CLIENT" and server:
                name = f"{name} → {server}"
            spans[s["spanId"]] = {
                "start": int(s["startTimeUnixNano"]),
                "end": int(s["endTimeUnixNano"]),
                "service": service,
                "name": name,
                "error": s.get("status", {}).get("code") == "STATUS_CODE_ERROR",
                "parent": s.get("parentSpanId", ""),
                "children": [],
            }

roots = []
for sid, s in spans.items():
    (spans[s["parent"]]["children"] if s["parent"] in spans else roots).append(sid)

ordered = []


def walk(sid, depth):
    ordered.append((depth, spans[sid]))
    for child in sorted(spans[sid]["children"], key=lambda c: (spans[c]["start"], spans[c]["end"])):
        walk(child, depth + 1)


for root in sorted(roots, key=lambda r: spans[r]["start"]):
    walk(root, 0)

t0 = min(s["start"] for s in spans.values())
total = max(s["end"] for s in spans.values()) - t0
width = 40
print(f"trace {trace_id} · {len(spans)} spans · {total / 1e6:,.1f} ms")
print(f"{'inicio':>8} {'duración':>10}  {'servicio':<12} {'span':<36} barra")
for depth, s in ordered:
    a = int((s["start"] - t0) / total * width)
    b = max(a + 1, int((s["end"] - t0) / total * width))
    bar = " " * a + ("x" if s["error"] else "█") * (b - a)
    label = ("  " * depth + s["name"])[:36]
    print(f"{(s['start'] - t0) / 1e6:8.1f} {(s['end'] - s['start']) / 1e6:9.1f}ms  {s['service']:<12} {label:<36} {bar}")
