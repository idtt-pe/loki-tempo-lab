import { Kafka, logLevel } from 'kafkajs';

export const TOPIC = process.env.TOPIC ?? 'wallet-events';

export const kafka = new Kafka({
  brokers: (process.env.KAFKA_BROKERS ?? 'redpanda:9092').split(','),
  clientId: 'wallet-projector',
  logLevel: logLevel.WARN,
});
