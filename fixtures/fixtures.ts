import { test as base } from "@playwright/test";
import { getToken } from "../helpers/auth";

type MyFixtures = {
  lamijaToken: string;
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
});

export { expect } from "@playwright/test";