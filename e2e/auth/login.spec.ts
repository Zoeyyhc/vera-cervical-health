// e2e/auth/login.spec.ts
import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUser } from "../helpers/supabase";

const TEST_EMAIL = "e2e-login@test.local";
const TEST_PASSWORD = "TestPass123!";

test.describe("Login page", () => {
  let userId: string;

  test.beforeAll(async () => {
    userId = await createTestUser(TEST_EMAIL, TEST_PASSWORD);
  });

  test.afterAll(async () => {
    await deleteTestUser(userId);
  });

  test("renders email and password fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("shows field error for invalid email format", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "not-an-email");
    await page.fill('[name="password"]', "anything");
    await page.click('[type="submit"]');
    await expect(page.getByText("Please enter a valid email address")).toBeVisible();
  });

  test("shows server error banner for wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', TEST_EMAIL);
    await page.fill('[name="password"]', "wrongpassword");
    await page.click('[type="submit"]');
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("valid credentials redirect to /chat", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', TEST_EMAIL);
    await page.fill('[name="password"]', TEST_PASSWORD);
    await page.click('[type="submit"]');
    await expect(page).toHaveURL("/chat");
  });
});
