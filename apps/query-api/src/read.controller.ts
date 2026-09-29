import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetMerchantDashboardQuery, GetStatementQuery } from './queries.js';

@Controller()
export class ReadController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('wallets/:id/statement')
  statement(@Param('id', ParseIntPipe) id: number) {
    return this.queryBus.execute(new GetStatementQuery(id));
  }

  @Get('merchants/:id/dashboard')
  dashboard(@Param('id', ParseIntPipe) id: number) {
    return this.queryBus.execute(new GetMerchantDashboardQuery(id));
  }
}
