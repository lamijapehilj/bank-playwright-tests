import { BaseClient } from "./BaseClient";

export class AccountsApi extends BaseClient {
  async create(type: string, initialDeposit: number) {
    const response = await this.request.post("/api/accounts", {
      data: {
        type: type,
        initialDeposit: initialDeposit,
      },
      headers: this.authHeaders(),
    });

    return response;
  }

  async get(accountId: string) {
    const response = await this.request.get(`/api/accounts/${accountId}`, {
      headers: this.authHeaders(),
    });
    return response;
  }
}
