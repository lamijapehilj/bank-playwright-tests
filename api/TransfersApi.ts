import { BaseClient } from "./BaseClient";

export class TransfersApi extends BaseClient {
  create(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    description: string,
  ) {
return this.postRequest('/api/transfers', {
  "fromAccountId": fromAccountId,
  "toAccountId": toAccountId,
  "amount": amount,
  "description": description,
})
}}
