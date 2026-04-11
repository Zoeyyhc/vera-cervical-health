// e2e/auth/reset-password.spec.ts
import { expect, test } from "@playwright/test";

test.describe("Reset password page", () => {
  test("redirects to /forgot-password when there is no active session", async ({ page }) => {
    // Navigate directly without going through the email link
    await page.goto("/reset-password");
    await expect(page).toHaveURL("/forgot-password");
  });

  test("shows password fields when session is present", async ({ page }) => {
    // Register a temp user to establish a session
    const email = `e2e-reset-${Date.now()}@test.local`;
    const password = "Password123!";

    await page.goto("/register");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', password);
    await page.fill('[name="confirmPassword"]', password);
    await page.click('[type="submit"]');
    await expect(page).toHaveURL("/chat");

    // Now navigate to reset-password — session is active
    await page.goto("/reset-password");
    await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm new password", { exact: true })).toBeVisible();
  });

  test("shows error when passwords do not match", async ({ page }) => {
    const email = `e2e-reset-mismatch-${Date.now()}@test.local`;
    await page.goto("/register");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', "Password123!");
    await page.fill('[name="confirmPassword"]', "Password123!");
    await page.click('[type="submit"]');
    await expect(page).toHaveURL("/chat");

    await page.goto("/reset-password");
    await page.fill('[name="password"]', "NewPass123!");
    await page.fill('[name="confirmPassword"]', "DifferentPass!");
    await page.click('[type="submit"]');
    await expect(page.getByText("Passwords do not match")).toBeVisible();
  });
});
