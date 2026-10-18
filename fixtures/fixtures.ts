import { test as base } from "@playwright/test";
import { getToken } from "../helpers/auth";
import { AccountsApi } from "../api/AccountsApi";
import { TransfersApi } from "../api/TransfersApi";

type MyFixtures = {
  lamijaToken: string;
  accountsApi: AccountsApi;
  transfersApi: TransfersApi;
};

export const test = base.extend<MyFixtures>({
  lamijaToken: async ({ request }, use) => {
    const token = await getToken(
      request,
      process.env.LAMIJA_USERNAME!,
      process.env.LAMIJA_PASSWORD!,
    );
    await use(token);
  },
  accountsApi: async ({request, lamijaToken}, use) => {
    await use(new AccountsApi(request, lamijaToken));
  },

  transfersApi: async({request, lamijaToken}, use) => {
    await use(new TransfersApi(request, lamijaToken));
  },
});

export { expect } from "@playwright/test";