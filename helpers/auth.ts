import { APIRequestContext, expect } from "@playwright/test";

export async function getToken(
  request: APIRequestContext,
  username: string,
  password: string,
) {

  const loginResponse = await request.post("/api/login", {
    data: {
      username: username,
      password: password,
    },
  });
  expect(loginResponse.status(), await loginResponse.text()).toEqual(200);
  const loginResponseJSON = await loginResponse.json();
  const token = loginResponseJSON.token
  expect(token).toBeTruthy();

  return token;
}
