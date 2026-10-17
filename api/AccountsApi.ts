import { APIRequestContext } from "@playwright/test";

export class AccountsApi {
  constructor(
    private request: APIRequestContext,
    private token: string,
  ) {}

  async create(type: string, initialDeposit: number) {
    const response = await this.request.post("/api/accounts", {
      data: {
        type: type,
        initialDeposit: initialDeposit,
      },
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });
    return response;
  }

  async get(accountId: string) {
    const response = await this.request.get(`/api/accounts/${accountId}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });
    return response;
  }
}
