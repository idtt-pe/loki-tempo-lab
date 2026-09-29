import http from 'k6/http';
import { check } from 'k6';

const WRITE = __ENV.API_WRITE || 'http://command-api:3000';
const READ = __ENV.API_READ || 'http://query-api:3000';
const ANTIFRAUD = __ENV.ANTIFRAUD || 'http://antifraud:3000';
const MODE = __ENV.MODE || 'full';

const PAY = Number(__ENV.PAY_RATE || 100);
const STATEMENT = Number(__ENV.STATEMENT_RATE || 200);
const DASHBOARD = Number(__ENV.DASH_RATE || 20);
const PHASE = Number(__ENV.PHASE_MIN || 2);
const TOTAL = `${PHASE * 4}m`;

const ERROR_RATE = Number(__ENV.ERROR_RATE || 0.03);
const SLOW_ABOVE = Number(__ENV.SLOW_ABOVE_CENTS || 4500);
const SLOW_MS = Number(__ENV.SLOW_MS || 1200);

const HOT_WALLET = Number(__ENV.HOT_WALLET || 777);
const HOT_SHARE = Number(__ENV.HOT_SHARE || 0.005);

const JSON_HEADERS = { 'content-type': 'application/json' };

const walletId = () => (Math.random() < HOT_SHARE ? HOT_WALLET : 1 + Math.floor(Math.random() * 200000));
const merchantId = () => 1 + Math.floor(5000 * Math.pow(Math.random(), 3));
const amount = () => 500 + Math.floor(Math.random() * 4500);

const rate = (exec, r, vus = 50) => ({
  executor: 'constant-arrival-rate', exec, rate: r, timeUnit: '1s', duration: TOTAL,
  preAllocatedVUs: vus, maxVUs: vus * 8,
});

const once = (exec, minute) => ({ executor: 'shared-iterations', exec, vus: 1, iterations: 1, startTime: `${minute}m`, maxDuration: '10s' });

export const options = {
  discardResponseBodies: true,
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max', 'count'],
  thresholds: {
    'http_req_duration{endpoint:pay}': ['max>=0'],
    'http_req_failed{endpoint:pay}': ['rate>=0'],
    'http_req_duration{endpoint:topup}': ['max>=0'],
    'http_req_duration{endpoint:statement}': ['max>=0'],
    'http_req_duration{endpoint:dashboard}': ['max>=0'],
  },
  scenarios: {
    payments: rate('payments', PAY, 100),
    topups: rate('topups', Math.max(1, Math.round(PAY / 10))),
    statements: rate('statements', STATEMENT, 100),
    dashboards: rate('dashboards', DASHBOARD),
    faultsOff: once('faultsOff', 0),
    errorsOn: once('errorsOn', PHASE),
    slowOn: once('slowOn', PHASE * 2),
    faultsOffAgain: once('faultsOff', PHASE * 3),
  },
};

function setFaults(body) {
  const res = http.put(`${ANTIFRAUD}/faults`, JSON.stringify(body), { headers: JSON_HEADERS, tags: { endpoint: 'faults' } });
  console.log(`faults ${new Date().toISOString()} ${JSON.stringify(body)} -> ${res.status}`);
}

export const faultsOff = () => setFaults({});
export const errorsOn = () => setFaults({ errorRate: ERROR_RATE });
export const slowOn = () => setFaults({ slowAboveCents: SLOW_ABOVE, slowMs: SLOW_MS });

export function payments() {
  const res = http.post(`${WRITE}/payments`, JSON.stringify({ walletId: walletId(), merchantId: merchantId(), amountCents: amount() }), {
    headers: JSON_HEADERS,
    tags: { endpoint: 'pay' },
  });
  check(res, { 'pay 201': (r) => r.status === 201 });
}

export function topups() {
  const res = http.post(`${WRITE}/topups`, JSON.stringify({ walletId: walletId(), amountCents: 10000 + amount() }), {
    headers: JSON_HEADERS,
    tags: { endpoint: 'topup' },
  });
  check(res, { 'topup 201': (r) => r.status === 201 });
}

export function statements() {
  const res = http.get(`${READ}/wallets/${walletId()}/statement`, { tags: { endpoint: 'statement' } });
  check(res, { 'statement 200': (r) => r.status === 200 });
}

export function dashboards() {
  const res = http.get(`${READ}/merchants/${merchantId()}/dashboard`, { tags: { endpoint: 'dashboard' } });
  check(res, { 'dashboard 200': (r) => r.status === 200 });
}

export function handleSummary(data) {
  const pick = (k) => data.metrics[k]?.values ?? null;
  const endpoints = {};
  for (const e of ['pay', 'topup', 'statement', 'dashboard']) {
    const d = pick(`http_req_duration{endpoint:${e}}`);
    if (d) endpoints[e] = { count: d.count, p50: d.med, p95: d['p(95)'], p99: d['p(99)'], max: d.max };
  }
  endpoints.pay.failedRate = pick('http_req_failed{endpoint:pay}')?.rate ?? null;
  const out = {
    mode: MODE,
    config: { PAY, STATEMENT, DASHBOARD, PHASE_MIN: PHASE, ERROR_RATE, SLOW_ABOVE, SLOW_MS, HOT_WALLET, HOT_SHARE },
    requests: pick('http_reqs')?.count ?? null,
    droppedIterations: pick('dropped_iterations')?.count ?? 0,
    endpoints,
  };
  return { [`/results/raw/${MODE}/k6.json`]: JSON.stringify(out, null, 2), stdout: JSON.stringify(out, null, 2) + '\n' };
}
