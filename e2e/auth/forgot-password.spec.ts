// e2e/auth/forgot-password.spec.ts
import { expect, test } from "@playwright/test";

test.describe("Forgot password page", () => {
  test("renders email field and submit button", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send reset link" }),
    ).toBeVisible();
  });

  test("shows field error for invalid email format", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.fill('[name="email"]', "not-an-email");
    await page.click('[type="submit"]');
    await expect(
      page.getByText("Please enter a valid email address"),
    ).toBeVisible();
  });

  test("shows success confirmation after submitting valid email", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.fill('[name="email"]', "anyone@example.com");
    await page.click('[type="submit"]');
    // Supabase returns success even for non-existent emails (prevents enumeration)
    await expect(page.getByRole("status")).toBeVisible();
    // Form is replaced by confirmation — submit button no longer visible
    await expect(
      page.getByRole("button", { name: "Send reset link" }),
    ).not.toBeVisible();
  });
});
