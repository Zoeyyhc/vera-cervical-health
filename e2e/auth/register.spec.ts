// e2e/auth/register.spec.ts
import { expect, test } from "@playwright/test";

test.describe("Register page", () => {
  const uniqueEmail = () => `e2e-register-${Date.now()}@test.local`;

  test("renders email, password, and confirm password fields", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
  });

  test("shows field error when passwords do not match", async ({ page }) => {
    await page.goto("/register");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "Password123!");
    await page.fill('[name="confirmPassword"]', "DifferentPass123!");
    await page.click('[type="submit"]');
    await expect(page.getByText("Passwords do not match")).toBeVisible();
  });

  test("shows field error for invalid email format", async ({ page }) => {
    await page.goto("/register");
    await page.fill('[name="email"]', "bad-email");
    await page.fill('[name="password"]', "Password123!");
    await page.fill('[name="confirmPassword"]', "Password123!");
    await page.click('[type="submit"]');
    await expect(page.getByText("Please enter a valid email address")).toBeVisible();
  });

  test("valid registration redirects to /chat", async ({ page }) => {
    const email = uniqueEmail();
    await page.goto("/register");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', "Password123!");
    await page.fill('[name="confirmPassword"]', "Password123!");
    await page.click('[type="submit"]');
    await expect(page).toHaveURL("/chat");
  });

  test("already-registered email shows server error", async ({ page }) => {
    const email = uniqueEmail();
    // First registration
    await page.goto("/register");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', "Password123!");
    await page.fill('[name="confirmPassword"]', "Password123!");
    await page.click('[type="submit"]');
    await expect(page).toHaveURL("/chat");

    // Second registration with same email
    await page.goto("/register");
    await page.fill('[name="email"]', email);
    await page.fill('[name="password"]', "Password123!");
    await page.fill('[name="confirmPassword"]', "Password123!");
    await page.click('[type="submit"]');
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
