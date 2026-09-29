import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { pgProvider } from './db.js';
import { GetMerchantDashboardHandler, GetStatementHandler } from './handlers.js';
import { HealthController } from './health.controller.js';
import { ReadController } from './read.controller.js';

@Module({
  imports: [CqrsModule.forRoot()],
  controllers: [ReadController, HealthController],
  providers: [pgProvider, GetStatementHandler, GetMerchantDashboardHandler],
})
export class AppModule {}
