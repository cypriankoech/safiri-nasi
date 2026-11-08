import { expect, test } from "@playwright/test";

test("guest books a safari, pays the deposit by M-Pesa and the balance by card", async ({ page }) => {
  await page.goto("/tours/3-day-maasai-mara-budget-safari");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("3-Day Maasai Mara Budget Safari");

  // Pick a departure far enough out that a deposit is allowed.
  const bookLinks = page.locator('a[href*="/book/3-day-maasai-mara-budget-safari?departure="]');
  await bookLinks.nth(5).click();
  await page.waitForURL(/\/book\//);

  await page.getByRole("checkbox", { name: /Maasai village visit/ }).check();
  await page.getByPlaceholder("Promo code").fill("KARIBU10");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/Promo applied/)).toBeVisible();
  await page.getByRole("button", { name: /Continue to details/ }).click();

  await page.getByLabel("Full name").first().fill("Achieng Otieno");
  await page.getByLabel("Email", { exact: true }).fill("achieng.e2e@example.com");
  await page.getByLabel(/Phone/).fill("0712345678");
  await page.getByLabel("Traveller 2 name").fill("Juma Otieno");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Reserve/ }).click();

  await page.waitForURL(/\/booking\/SN-/);
  await expect(page.getByText("Your seats are reserved!")).toBeVisible();

  await page.getByRole("button", { name: /with M-Pesa/ }).click();
  await expect(page.getByText("Check your phone")).toBeVisible();
  await expect(page.getByText("Payment received!")).toBeVisible({ timeout: 40_000 });

  await page.reload();
  await page.getByRole("tab", { name: "Card" }).click();
  await page.getByRole("button", { name: /by card/ }).click();
  await page.waitForURL(/payments\/mock/);
  await page.getByRole("button", { name: "Pay now" }).click();
  await page.waitForURL(/payment\/return/);
  await expect(page.getByText("Payment successful!")).toBeVisible();

  await page.getByRole("link", { name: "View my booking" }).click();
  await expect(page.getByText(/You're all paid up/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Travel voucher" })).toBeVisible();
});

test("M-Pesa refuses an Airtel number", async ({ page, request }) => {
  const res = await request.post("/api/bookings", {
    data: {
      tour_slug: "nairobi-national-park-giraffe-centre",
      travel_date: new Date(Date.now() + 40 * 86400_000).toISOString().slice(0, 10),
      adults: 1,
      contact: { name: "Test Guest", email: "guest.e2e@example.com", phone: "0733123456" },
      accept_terms: true,
    },
  });
  expect(res.ok()).toBeTruthy();
  const { booking, access_token } = await res.json();
  const pay = await request.post(`/api/bookings/${booking.reference}/payments`, {
    headers: { "X-Booking-Token": access_token },
    data: { method: "mpesa", phone: "0733123456" },
  });
  expect(pay.status()).toBe(422);
  expect((await pay.json()).detail).toContain("Airtel");
});
