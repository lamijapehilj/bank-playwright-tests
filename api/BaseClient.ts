import { APIRequestContext } from "@playwright/test";

export class BaseClient {
  constructor(
    protected request: APIRequestContext,
    protected token: string,
  ) {}

  protected authHeaders() {
    return { Authorization: `Bearer ${this.token}` };
  }
  protected getRequest(path: string) {
    return this.request.get(path, { headers: this.authHeaders() });
  }

  protected postRequest(path: string, data: object) {
    return this.request.post(path, { headers: this.authHeaders(), data });
  }
}
