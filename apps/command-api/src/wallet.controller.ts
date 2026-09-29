import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { MovementAccepted, PayCommand, TopUpCommand } from './commands.js';

type MovementBody = { walletId?: number; merchantId?: number; amountCents?: number };

function positiveInt(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new BadRequestException(`${field} must be a positive integer`);
  return value as number;
}

@Controller()
export class WalletController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('payments')
  @HttpCode(201)
  pay(@Body() body: MovementBody): Promise<MovementAccepted> {
    return this.commandBus.execute(
      new PayCommand(
        positiveInt(body.walletId, 'walletId'),
        positiveInt(body.merchantId, 'merchantId'),
        positiveInt(body.amountCents, 'amountCents'),
      ),
    );
  }

  @Post('topups')
  @HttpCode(201)
  topUp(@Body() body: MovementBody): Promise<MovementAccepted> {
    return this.commandBus.execute(
      new TopUpCommand(positiveInt(body.walletId, 'walletId'), positiveInt(body.amountCents, 'amountCents')),
    );
  }
}
