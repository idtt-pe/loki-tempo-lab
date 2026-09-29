import http from 'node:http';

let lags: number[] = [];
let batches = 0;
const stages: Record<string, number[]> = { relay: [], kafka: [], apply: [] };

export function recordStages(relay: number, kafka: number, apply: number) {
  stages.relay.push(relay);
  stages.kafka.push(kafka);
  stages.apply.push(apply);
}
let applyMs = 0;

export function recordBatch(ms: number) {
  batches++;
  applyMs += ms;
}

export function recordLag(ms: number) {
  lags.push(ms);
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function startStatsServer(outboxPending: () => Promise<number>) {
  http
    .createServer(async (req, res) => {
      if (req.url === '/reset') {
        lags = [];
        batches = 0;
        for (const k of Object.keys(stages)) stages[k] = [];
        applyMs = 0;
        res.end('{"reset":true}');
        return;
      }
      const sorted = [...lags].sort((a, b) => a - b);
      const body = {
        applied: sorted.length,
        batches,
        avgBatchSize: batches ? sorted.length / batches : null,
        avgApplyMs: batches ? applyMs / batches : null,
        lagMs: {
          p50: percentile(sorted, 50),
          p95: percentile(sorted, 95),
          p99: percentile(sorted, 99),
          max: sorted.at(-1) ?? null,
        },
        outboxPending: await outboxPending(),
        stagesP50: Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, percentile([...v].sort((a, b) => a - b), 50)])),
        stagesP99: Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, percentile([...v].sort((a, b) => a - b), 99)])),
      };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    })
    .listen(Number(process.env.STATS_PORT ?? 9100), '0.0.0.0');
}
