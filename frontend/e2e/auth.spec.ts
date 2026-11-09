import { expect, test } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

test("forgotten password: email link resets it and logs the traveller in", async ({ page, request }) => {
  const email = `reset.${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByRole("textbox", { name: "Full name" }).fill("Reset Tester");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Password").fill("FirstPassword#1");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((u) => u.pathname === "/account");
  await page.context().clearCookies();

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await page.waitForURL("**/forgot-password");
  await page.waitForLoadState("networkidle"); // let React hydrate before typing
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/we've sent a link/)).toBeVisible();

  // Fetch the reset email from Mailpit and follow its link.
  let link = "";
  await expect(async () => {
    const search = await (await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const message = await (await request.get(`${MAILPIT}/api/v1/message/${search.messages[0].ID}`)).json();
    link = message.HTML.match(/href="([^"]*reset-password\?token=[^"]+)"/)[1];
  }).toPass({ timeout: 15_000 });

  await page.goto(link.replace(/^https?:\/\/[^/]+/, ""), { waitUntil: "networkidle" });
  await page.getByLabel("New password", { exact: true }).fill("SecondPassword#2");
  await page.getByLabel("Confirm new password").fill("SecondPassword#2");
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.waitForURL((u) => u.pathname === "/account");
  await expect(page.getByRole("heading", { name: "My trips" })).toBeVisible();

  // The same link can't be used twice.
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ""), { waitUntil: "networkidle" });
  await page.getByLabel("New password", { exact: true }).fill("ThirdPassword#3");
  await page.getByLabel("Confirm new password").fill("ThirdPassword#3");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText(/invalid or has already been used/)).toBeVisible();
});
