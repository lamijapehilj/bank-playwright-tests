import { test, expect } from "@playwright/test";

const ACCOUNTS_URL = process.env.ACCOUNTS_URL;
const TRANSFERS_URL = process.env.TRANSFERS_URL;

test("transfer between services completes and moves money", async ({
  request,
}) => {
  const loginResponse = await request.post(`${ACCOUNTS_URL}/api/login`, {
    data: {
      username: process.env.LAMIJA_USERNAME,
      password: process.env.LAMIJA_PASSWORD,
    },
  });

  expect(loginResponse.status(), await loginResponse.text()).toBe(200);
  const { token } = await loginResponse.json();

  //open account

  const initialDeposit = 500;
  const amount = 100;
  const initialToDeposit = 0;

  const fromResponse = await request.post(`${ACCOUNTS_URL}/api/accounts`, {
    data: {
      type: "CHECKING",
      initialDeposit: initialDeposit,
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(fromResponse.status(), await fromResponse.text()).toBe(201);
  const from = (await fromResponse.json()).account;

  const toResponse = await request.post(`${ACCOUNTS_URL}/api/accounts`, {
    data: {
      type: "SAVINGS",
      initialDeposit: initialToDeposit,
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(toResponse.status(), await toResponse.text()).toBe(201);
  const to = (await toResponse.json()).account;

  //transfer
  const transferResponse = await request.post(
    `${TRANSFERS_URL}/api/transfers`,
    {
      data: {
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: amount,
        description: `${Date.now()}`,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  expect(transferResponse.status(), await transferResponse.text()).toBe(202);
  const transfer = (await transferResponse.json()).transfer;
  expect(transfer.status).toBe("PENDING");

  await expect
    .poll(
      async () => {
        const response = await request.get(
          `${TRANSFERS_URL}/api/transfers/${transfer.id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        return (await response.json()).transfer.status;
      },
      { timeout: 10000 },
    )
    .toBe("COMPLETED");

  const getFromAccountAfterTransfer = await request.get(
    `${ACCOUNTS_URL}/api/accounts/${from.id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  expect(getFromAccountAfterTransfer.status(), await getFromAccountAfterTransfer.text()).toBe(200);
  const { account: fromAccount } = await getFromAccountAfterTransfer.json();
  expect(fromAccount.balance).toBe(initialDeposit - amount);

  const getToAccountAfterTransfer = await request.get(
    `${ACCOUNTS_URL}/api/accounts/${to.id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  expect(getToAccountAfterTransfer.status(), await getToAccountAfterTransfer.text()).toBe(200);
  const { account: toAccount } = await getToAccountAfterTransfer.json();
  expect(toAccount.balance).toBe(amount);
});

