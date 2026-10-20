import { APIRequestContext } from "@playwright/test";

export class BaseClient {
  constructor(
    protected request: APIRequestContext,
    protected token: string,
  ) {}

  protected authHeaders() {
    return { Authorization: `Bearer ${this.token}` };
  }
}