import { APIRequestContext } from "playwright-core";    

export class TransfersApi {
    constructor (private request: APIRequestContext,
        private token: string
    ) {}

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