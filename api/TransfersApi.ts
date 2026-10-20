import { BaseClient } from "./BaseClient";

export class TransfersApi extends BaseClient {
  async create(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    description: string,
  ) {
    const response = await this.request.post("/api/transfers", {
      data: {
        fromAccountId: fromAccountId,
        toAccountId: toAccountId,
        amount: amount,
        description: description,
      },
      headers: this.authHeaders(),
    });
    return response;
  }
}
