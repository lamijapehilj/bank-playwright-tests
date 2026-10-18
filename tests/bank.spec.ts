import { test, expect } from "@playwright/test";
import { getToken } from "../helpers/auth";
import { AccountsApi } from "../api/AccountsApi";
import { TransfersApi } from "../api/TransfersApi";
import { error } from "node:console";

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
  const token = await getToken(
    request,
    process.env.LAMIJA_USERNAME!,
    process.env.LAMIJA_PASSWORD!,
  );

  const accountsResponse = await request.get("/api/accounts", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(accountsResponse.status()).toEqual(200);
  const accountsResponseJSON = await accountsResponse.json();

  const accounts = accountsResponseJSON.accounts;

  //check that response contains ACC-1001 and ACC-1002, and does not contain ACC-2001
  const accountIDs = accounts.map((a: any) => a.id);
  expect(accountIDs).toContain("ACC-1001");
  expect(accountIDs).toContain("ACC-1002");
  expect(accountIDs).not.toContain("ACC-2001");
});

test("Transfer moves money between accounts", async ({ request }) => {
  const token = await getToken(
    request,
    process.env.LAMIJA_USERNAME!,
    process.env.LAMIJA_PASSWORD!,
  );

  const accountsApi = new AccountsApi(request, token);
  const transfersApi = new TransfersApi(request, token);

  const fromInitialDeposit = 500;

  const addedAccountResponse = await accountsApi.create(
    "CHECKING",
    fromInitialDeposit,
  );

  expect(addedAccountResponse.status()).toEqual(201);
  const addedAccountResponseJSON = await addedAccountResponse.json();
  const fromAccountId = addedAccountResponseJSON.account.id;
  expect(addedAccountResponseJSON.account.balance).toEqual(fromInitialDeposit);

  const toInitialDeposit = 200;
  const addedSavingsAccountResponse = await accountsApi.create(
    "SAVINGS",
    toInitialDeposit,
  );
  expect(addedSavingsAccountResponse.status()).toEqual(201);
  const addedSavingsAccountResponseJSON =
    await addedSavingsAccountResponse.json();
  const toAccountId = addedSavingsAccountResponseJSON.account.id;
  expect(addedSavingsAccountResponseJSON.account.balance).toEqual(
    toInitialDeposit,
  );

  const amount = 100;

  const transferResponse = await transfersApi.create(
    fromAccountId,
    toAccountId,
    amount,
    "Salary transfer",
  );

  expect(transferResponse.status(), await transferResponse.text()).toEqual(201);
  const transferResponseJSON = await transferResponse.json();

  expect(transferResponseJSON.transfer.amount).toBe(amount);
  expect(transferResponseJSON.transfer.status).toBe("COMPLETED");

  const fromBalanceAfterResponse = await accountsApi.get(fromAccountId);

  expect(fromBalanceAfterResponse.status()).toEqual(200);
  const fromBalanceAfterResponseJSON = await fromBalanceAfterResponse.json();

  const fromBalanceAfter = fromBalanceAfterResponseJSON.account.balance;

  const toBalanceAfterResponse = await accountsApi.get(toAccountId);

  expect(toBalanceAfterResponse.status()).toEqual(200);
  const toBalanceAfterResponseJSON = await toBalanceAfterResponse.json();

  const toBalanceAfter = toBalanceAfterResponseJSON.account.balance;

  expect(fromBalanceAfter).toBe(fromInitialDeposit - amount);
  expect(toBalanceAfter).toBe(toInitialDeposit + amount);
});

const rejectedTransfers = [
  { amount: 0, error: "amount must be greater than 0", status: 400 },
  { amount: -50, error: "amount must be greater than 0", status: 400 },
  {
    amount: 10.555,
    error: "amount can have at most 2 decimal places",
    status: 400,
  },
  { amount: 5000, error: "Insufficient funds", status: 422 },
  {
    amount: 15000,
    error: "amount exceeds the transfer limit of 10000.00",
    status: 422,
  },
];

for (const testCase of rejectedTransfers) {
  test(`Transfer with amount ${testCase.amount} is rejected`, async ({
    request,
  }) => {
    const token = await getToken(
      request,
      process.env.LAMIJA_USERNAME!,
      process.env.LAMIJA_PASSWORD!,
    );

    const accountsApi = new AccountsApi(request, token);
    const transfersApi = new TransfersApi(request, token);

    const fromInitialDeposit = 200;
    const fromAccountResponse = await accountsApi.create(
      "CHECKING",
      fromInitialDeposit,
    );

    expect(fromAccountResponse.status()).toEqual(201);
    const fromAccountResponseJSON = await fromAccountResponse.json();
    const fromAccountId = fromAccountResponseJSON.account.id;
    const fromBalanceBeforeTransfer = fromAccountResponseJSON.account.balance;

    const toInitialDeposit = 500;
    const toAccountResponse = await accountsApi.create(
      "SAVINGS",
      toInitialDeposit,
    );
    expect(toAccountResponse.status()).toEqual(201);
    const toAccountResponseJSON = await toAccountResponse.json();
    const toAccountId = toAccountResponseJSON.account.id;
    const toBalanceBeforeTransfer = toAccountResponseJSON.account.balance;

    const transferResponse = await transfersApi.create(
      fromAccountId,
      toAccountId,
      testCase.amount,
      "any",
    );

    expect(transferResponse.status(), await transferResponse.text()).toBe(
      testCase.status,
    );
    const transferResponseJSON = await transferResponse.json();
    expect(transferResponseJSON.error).toBe(testCase.error);

    const afterTransferResponse = await accountsApi.get(fromAccountId);
    expect(afterTransferResponse.status()).toEqual(200);
    const afterTransferResponseJSON = await afterTransferResponse.json();
    const fromBalanceAfterTransfer = afterTransferResponseJSON.account.balance;

    expect(fromBalanceAfterTransfer).toEqual(fromBalanceBeforeTransfer);

    const toAfterTransferResponse = await accountsApi.get(toAccountId);

    expect(toAfterTransferResponse.status()).toEqual(200);
    const toAfterTransferResponseJSON = await toAfterTransferResponse.json();
    const toBalanceAfterTransfer = toAfterTransferResponseJSON.account.balance;
    expect(toBalanceAfterTransfer).toEqual(toBalanceBeforeTransfer);
  });
}

test("User cannot transfer from another user's account", async ({
  request,
}) => {
  const lamijaToken = await getToken(
    request,
    process.env.LAMIJA_USERNAME!,
    process.env.LAMIJA_PASSWORD!,
  );

  const amarToken = await getToken(
    request,
    process.env.AMAR_USERNAME!,
    process.env.AMAR_PASSWORD!,
  );

  const lamijaAccountApi = new AccountsApi(request, lamijaToken);
  const amarTransfersApi = new TransfersApi(request, amarToken);

  const lamijaAccountsResponse = await lamijaAccountApi.create("CHECKING", 500);
  expect(
    lamijaAccountsResponse.status(),
    await lamijaAccountsResponse.text(),
  ).toEqual(201);
  const lamijaAccountsApiJson = await lamijaAccountsResponse.json();

  const lamijaAccountId = lamijaAccountsApiJson.account.id;
  const lamijaAccountBalance = lamijaAccountsApiJson.account.balance;

  const amarTranferApiResponse = await amarTransfersApi.create(
    lamijaAccountId,
    "ACC-2001",
    100,
    "any",
  );
  expect(
    amarTranferApiResponse.status(),
    await amarTranferApiResponse.text(),
  ).toEqual(403);
  const amarTransferApiResponseJson = await amarTranferApiResponse.json();
  expect(amarTransferApiResponseJson.error).toBe(
    "You do not have access to this account",
  );

  const getLamijaAccountResponse = await lamijaAccountApi.get(lamijaAccountId);
  expect(
    getLamijaAccountResponse.status(),
    await getLamijaAccountResponse.text(),
  ).toEqual(200);
  const getLamijaAccountResponseJson = await getLamijaAccountResponse.json();
  expect(getLamijaAccountResponseJson.account.balance).toBe(
    lamijaAccountBalance,
  );
});
