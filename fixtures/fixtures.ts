import { test as base } from "@playwright/test";
import { getToken } from "../helpers/auth";
import { AccountsApi } from "../api/AccountsApi";
import { TransfersApi } from "../api/TransfersApi";

type MyFixtures = {
  lamijaToken: string;
  lamijaTransfersApi: TransfersApi;
  amarToken: string;
  amarTransfersApi: TransfersApi;
  lamijaAccountsApi: AccountsApi;
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
  lamijaAccountsApi: async ({ request, lamijaToken }, use) => {
    await use(new AccountsApi(request, lamijaToken));
  },

  lamijaTransfersApi: async ({ request, lamijaToken }, use) => {
    await use(new TransfersApi(request, lamijaToken));
  },

  amarToken: async ({ request }, use) => {
    const token = await getToken(
      request,
      process.env.AMAR_USERNAME!,
      process.env.AMAR_PASSWORD!,
    );
    await use(token);
  },

  amarTransfersApi: async ({ request, amarToken }, use) => {
    await use(new TransfersApi(request, amarToken));
  },
});

export { expect } from "@playwright/test";
