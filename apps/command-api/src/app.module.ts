import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AntifraudClient } from './antifraud.client.js';
import { pgProvider } from './db.js';
import { PayHandler, TopUpHandler } from './handlers.js';
import { HealthController } from './health.controller.js';
import { WalletController } from './wallet.controller.js';
import { WalletRepository } from './wallet.repository.js';

@Module({
  imports: [CqrsModule.forRoot()],
  controllers: [WalletController, HealthController],
  providers: [pgProvider, AntifraudClient, WalletRepository, PayHandler, TopUpHandler],
})
export class AppModule {}
