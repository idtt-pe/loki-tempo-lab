export class PayCommand {
  constructor(
    readonly walletId: number,
    readonly merchantId: number,
    readonly amountCents: number,
  ) {}
}

export class TopUpCommand {
  constructor(
    readonly walletId: number,
    readonly amountCents: number,
  ) {}
}

export type MovementAccepted = { txId: number; balanceCents: number };
