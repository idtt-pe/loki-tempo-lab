import http from 'node:http';

type Faults = { errorRate: number; slowAboveCents: number; slowMs: number };

let faults: Faults = { errorRate: 0, slowAboveCents: 0, slowMs: 0 };
let checks = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

http
  .createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { status: 'ok' });
    if (req.method === 'GET' && req.url === '/faults') return send(res, 200, { ...faults, checks });
    if (req.method === 'PUT' && req.url === '/faults') {
      faults = { errorRate: 0, slowAboveCents: 0, slowMs: 0, ...(await readJson(req)) } as Faults;
      return send(res, 200, faults);
    }
    if (req.method === 'POST' && req.url === '/check') {
      checks++;
      const { amountCents } = (await readJson(req)) as { amountCents?: number };
      if (faults.slowMs && faults.slowAboveCents && (amountCents ?? 0) >= faults.slowAboveCents) await sleep(faults.slowMs);
      else await sleep(2);
      if (Math.random() < faults.errorRate) return send(res, 503, { error: 'provider unavailable' });
      return send(res, 200, { decision: 'approve' });
    }
    send(res, 404, { error: 'not found' });
  })
  .listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
