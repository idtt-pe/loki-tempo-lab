import { context, propagation, ROOT_CONTEXT, SpanKind, trace } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';

export const tracer = trace.getTracer('wallet-events');

type Carrier = Record<string, string>;

export function startChildSpan(name: string, carrier: Carrier | undefined, kind: SpanKind, attributes: Record<string, string | number>, startTime?: number): Span {
  const parent = propagation.extract(ROOT_CONTEXT, carrier ?? {});
  return tracer.startSpan(name, { kind, attributes, startTime }, parent);
}

export function injectFrom(span: Span): Carrier {
  const carrier: Carrier = {};
  propagation.inject(trace.setSpan(context.active(), span), carrier);
  return carrier;
}
