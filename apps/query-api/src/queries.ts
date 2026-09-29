export class GetStatementQuery {
  constructor(readonly walletId: number) {}
}

export class GetMerchantDashboardQuery {
  constructor(readonly merchantId: number) {}
}
