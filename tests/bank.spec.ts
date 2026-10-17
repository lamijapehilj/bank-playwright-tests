import { test, expect } from "@playwright/test";
import { getToken } from "../helpers/auth";

test("Login returns a token", async ({ request }) => {
  const loginResponse = await request.post("/api/login", {
    data: {
      username: process.env.LAMIJA_USERNAME,
      password: process.env.LAMIJA_PASSWORD,
    },
  });

  //check status
  expect(loginResponse.status()).toEqual(200);
  const loginResponseJSON = await loginResponse.json();

  const username = loginResponseJSON.user.username;
  expect(username).toBe(process.env.LAMIJA_USERNAME);
  const token = loginResponseJSON.token;
  expect(token).toBeTruthy();
});

test("Get my accounts returns only my accounts", async ({ request }) => {
  const token = await getToken(request, process.env.LAMIJA_USERNAME!, process.env.LAMIJA_PASSWORD!);

  const accountsResponse = await request.get("/api/accounts", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(accountsResponse.status()).toEqual(200);
  const accountsResponseJSON = await accountsResponse.json();

  //check that response has 2 accounts
  const accounts = accountsResponseJSON.accounts;

  //check that response contains ACC-1001 and ACC-1002, and does not contain ACC-2001
  const accountIDs = accounts.map((a: any) => a.id);
  expect(accountIDs).toContain("ACC-1001");
  expect(accountIDs).toContain("ACC-1002");
  expect(accountIDs).not.toContain("ACC-2001");
});

test("Transfer moves money between accounts", async ({ request }) => {
  const token = await getToken(request, process.env.LAMIJA_USERNAME!, process.env.LAMIJA_PASSWORD!);

  const fromInitialDeposit = 500;

  const addedAccountResponse = await request.post("/api/accounts", {
    data: {
      type: "CHECKING",
      initialDeposit: fromInitialDeposit,
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(addedAccountResponse.status()).toEqual(201);
  const addedAccountResponseJSON = await addedAccountResponse.json();
  const fromAccountId = addedAccountResponseJSON.account.id;
  expect(addedAccountResponseJSON.account.balance).toEqual(fromInitialDeposit);
  //
  const toInitialDeposit = 200;
  const addedSavingsAccountResponse = await request.post("/api/accounts", {
    data: {
      type: "SAVINGS",
      initialDeposit: toInitialDeposit,
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(addedSavingsAccountResponse.status()).toEqual(201);
  const addedSavingsAccountResponseJSON =
    await addedSavingsAccountResponse.json();
  const toAccountId = addedSavingsAccountResponseJSON.account.id;
  expect(addedSavingsAccountResponseJSON.account.balance).toEqual(
    toInitialDeposit,
  );

  const amount = 100;

  const transferResponse = await request.post(`/api/transfers`, {
    data: {
      fromAccountId: fromAccountId,
      toAccountId: toAccountId,
      amount: amount,
      description: "Savings",
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  expect(transferResponse.status(), await transferResponse.text()).toEqual(201);
  const transferResponseJSON = await transferResponse.json();

  expect(transferResponseJSON.transfer.amount).toBe(amount);
  expect(transferResponseJSON.transfer.status).toBe("COMPLETED");

  const fromBalanceAfterResponse = await request.get(
    `/api/accounts/${fromAccountId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  expect(fromBalanceAfterResponse.status()).toEqual(200);
  const fromBalanceAfterResponseJSON = await fromBalanceAfterResponse.json();

  const fromBalanceAfter = fromBalanceAfterResponseJSON.account.balance;

  const toBalanceAfterResponse = await request.get(
    `/api/accounts/${toAccountId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  expect(toBalanceAfterResponse.status()).toEqual(200);
  const toBalanceAfterResponseJSON = await toBalanceAfterResponse.json();

  const toBalanceAfter = toBalanceAfterResponseJSON.account.balance;

  expect(fromBalanceAfter).toBe(fromInitialDeposit - amount);
  expect(toBalanceAfter).toBe(toInitialDeposit + amount);
});

test("Transfer with zero amount is rejected", async ({ request }) => {
  const token = await getToken(request, process.env.LAMIJA_USERNAME!, process.env.LAMIJA_PASSWORD!);

  const fromInitialDeposit = 200;
  const fromAccountResponse = await request.post("/api/accounts", {
    data: {
      type: "CHECKING",
      initialDeposit: fromInitialDeposit,
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(fromAccountResponse.status()).toEqual(201);
  const fromAccountResponseJSON = await fromAccountResponse.json();
  const fromAccountId = fromAccountResponseJSON.account.id;
  const fromBalanceBeforeTransfer = fromAccountResponseJSON.account.balance;

  const toInitialDeposit = 500;
  const toAccountResponse = await request.post("/api/accounts", {
    data: {
      type: "SAVINGS",
      initialDeposit: toInitialDeposit,
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(toAccountResponse.status()).toEqual(201);
  const toAccountResponseJSON = await toAccountResponse.json();
  const toAccountId = toAccountResponseJSON.account.id;
  const toBalanceBeforeTransfer = toAccountResponseJSON.account.balance;

  const transferResponse = await request.post("/api/transfers", {
    data: {
      fromAccountId: fromAccountId,
      toAccountId: toAccountId,
      amount: 0,
      description: "Savings",
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  expect(transferResponse.status()).toBe(400);
  const transferResponseJSON = await transferResponse.json();
  expect(transferResponseJSON.error).toBe("amount must be greater than 0");

  const afterTransferResponse = await request.get(
    `/api/accounts/${fromAccountId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  expect(afterTransferResponse.status()).toEqual(200);
  const afterTransferResponseJSON = await afterTransferResponse.json();
  const fromBalanceAfterTransfer = afterTransferResponseJSON.account.balance;

  expect(fromBalanceAfterTransfer).toEqual(fromBalanceBeforeTransfer);

  const toAfterTransferResponse = await request.get(
    `/api/accounts/${toAccountId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  expect(toAfterTransferResponse.status()).toEqual(200);
  const toAfterTransferResponseJSON = await toAfterTransferResponse.json();
  const toBalanceAfterTransfer = toAfterTransferResponseJSON.account.balance;
  expect(toBalanceAfterTransfer).toEqual(toBalanceBeforeTransfer);
});
