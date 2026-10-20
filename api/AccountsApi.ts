import { BaseClient } from "./BaseClient";

export class AccountsApi extends BaseClient {
  create(type: string, initialDeposit: number) {
    return this.postRequest("/api/accounts", {
      type: type,
      initialDeposit: initialDeposit,
    });
  }

  get(accountId: string) {
    return this.getRequest(`/api/accounts/${accountId}`);
  }
}
