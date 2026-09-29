import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { trace } from '@opentelemetry/api';
import { log } from 'telemetry/log';
import { AntifraudClient } from './antifraud.client.js';
import { MovementAccepted, PayCommand, TopUpCommand } from './commands.js';
import { WalletRepository } from './wallet.repository.js';

@CommandHandler(PayCommand)
export class PayHandler implements ICommandHandler<PayCommand, MovementAccepted> {
  constructor(
    private readonly wallets: WalletRepository,
    private readonly antifraud: AntifraudClient,
  ) {}

  async execute({ walletId, merchantId, amountCents }: PayCommand) {
    trace.getActiveSpan()?.setAttributes({ 'wallet.id': walletId, 'merchant.id': merchantId, 'payment.amount_cents': amountCents });
    await this.antifraud.check(walletId, merchantId, amountCents);
    const accepted = await this.wallets.applyMovement(walletId, merchantId, 'payment', amountCents);
    log.info({ wallet_id: walletId, merchant_id: merchantId, amount_cents: amountCents, tx_id: accepted.txId }, 'payment accepted');
    return accepted;
  }
}

@CommandHandler(TopUpCommand)
export class TopUpHandler implements ICommandHandler<TopUpCommand, MovementAccepted> {
  constructor(private readonly wallets: WalletRepository) {}

  async execute({ walletId, amountCents }: TopUpCommand) {
    trace.getActiveSpan()?.setAttributes({ 'wallet.id': walletId, 'payment.amount_cents': amountCents });
    const accepted = await this.wallets.applyMovement(walletId, null, 'topup', amountCents);
    log.info({ wallet_id: walletId, amount_cents: amountCents, tx_id: accepted.txId }, 'topup accepted');
    return accepted;
  }
}
