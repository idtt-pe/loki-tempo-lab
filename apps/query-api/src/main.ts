import 'reflect-metadata';
import cluster from 'node:cluster';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { accessLog } from './access-log.js';

const workers = Number(process.env.WORKERS ?? 1);

if (cluster.isPrimary && workers > 1) {
  for (let i = 0; i < workers; i++) cluster.fork();
} else {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: ['error', 'warn'],
  });
  accessLog(app);
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}
