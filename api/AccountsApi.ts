import { APIRequestContext } from "@playwright/test";

export class AccountsApi {
  constructor(
    private request: APIRequestContext,
    private token: string,
  ) {}

  async create(type: string, initialDeposit: number) {
    const createdAccountResponse = await this.request.post("/api/accounts", {
      data: {
        type: type,
        initialDeposit: initialDeposit,
      },
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });
    return createdAccountResponse;
  }

  async get(accountId: string) {
    const response = await this.request.get(`/api/accounts/${accountId}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });
    return response;
  }

  async transfer(
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
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });
    return response;
  }

}
