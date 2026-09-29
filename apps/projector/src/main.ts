import { startProjection } from './projection.js';
import { outboxPending, startRelay } from './relay.js';
import { startStatsServer } from './stats.js';

startStatsServer(outboxPending);
await startProjection();
await startRelay();
