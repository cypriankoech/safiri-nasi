import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/login?next=/admin");
  await page.getByLabel("Email", { exact: true }).fill("admin@safirinasitourstravel.co.ke");
  await page.getByLabel("Password").fill("SafiriAdmin#2026");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => url.pathname === "/admin");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("staff edit a tour and save its prices", async ({ page }) => {
  await page.goto("/admin/tours");
  await page.getByRole("link", { name: /3-Day Maasai Mara Budget Safari/ }).click();
  await page.getByLabel("Resident · KES adult_price", { exact: true }).fill("33000");
  await page.getByRole("button", { name: "Save tour" }).click();
  await expect(page.getByText("Tour saved")).toBeVisible();
  await page.getByLabel("Resident · KES adult_price", { exact: true }).fill("32500");
  await page.getByRole("button", { name: "Save tour" }).click();
  await expect(page.getByText("Tour saved").first()).toBeVisible();
});

test("staff take a phone booking and record a Paybill payment", async ({ page }) => {
  await page.goto("/admin/bookings/new");
  await page.getByLabel("Tour").selectOption({ label: "Watamu Beach Escape – 3 Nights" });
  await page.getByLabel("Start date").fill(new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10));
  await page.getByRole("textbox", { name: "Full name", exact: true }).fill("Wairimu Njeri");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("wairimu.e2e@example.com");
  await page.getByRole("textbox", { name: "Phone", exact: true }).fill("0722000111");
  await expect(page.getByText("Due first")).toBeVisible();
  await page.getByRole("button", { name: "Create booking" }).click();
  await page.waitForURL(/\/admin\/bookings\/SN-/);

  await page.getByRole("button", { name: "Record payment" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("spinbutton").fill("30000"); // covers the 30% deposit on 2 × KES 38,900
  await dialog.getByLabel(/Receipt/).fill(`TK${Date.now().toString().slice(-8)}`);
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByText("Payment recorded")).toBeVisible();
  await expect(page.getByText("Confirmed").first()).toBeVisible();
});

test("every admin page renders without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of ["/admin/bookings", "/admin/payments", "/admin/tours", "/admin/departures", "/admin/enquiries",
    "/admin/customers", "/admin/reviews", "/admin/destinations", "/admin/promos", "/admin/blog", "/admin/faqs",
    "/admin/reports", "/admin/users", "/admin/settings", "/admin/audit"]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
  }
  expect(errors).toEqual([]);
});
