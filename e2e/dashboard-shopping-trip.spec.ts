import { expect, test, type Page } from "@playwright/test";

type Category = {
  id: string;
  name: string;
};

type Store = {
  id: string;
  name: string;
};

type TripFixture = {
  milkName: string;
  breadName: string;
  applesName: string;
  costcoName: string;
  traderJoesName: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function postJson<T>(page: Page, url: string, payload: unknown): Promise<T> {
  const result = await page.evaluate(
    async ({ targetUrl, body }) => {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      return {
        ok: response.ok,
        status: response.status,
        json: await response.json().catch(() => null),
      };
    },
    { targetUrl: url, body: payload }
  );

  expect(result.ok, `${url} returned ${result.status}`).toBeTruthy();
  return result.json as T;
}

async function getJson<T>(page: Page, url: string): Promise<T> {
  const result = await page.evaluate(async (targetUrl) => {
    const response = await fetch(targetUrl);
    return {
      ok: response.ok,
      status: response.status,
      json: await response.json().catch(() => null),
    };
  }, url);

  expect(result.ok, `${url} returned ${result.status}`).toBeTruthy();
  return result.json as T;
}

async function createTripFixture(page: Page, uniqueSuffix: string): Promise<TripFixture> {
  const householdName = `Shopping Trip ${uniqueSuffix}`;

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);

  await postJson(page, "/api/households", {
    name: householdName,
    slug: slugify(householdName),
  });

  const categories = await getJson<Category[]>(page, "/api/categories");

  const dairy = categories.find((category) => /dairy/i.test(category.name));
  const pantry = categories.find((category) => /pantry/i.test(category.name));
  const produce = categories.find((category) => /produce/i.test(category.name));

  expect(dairy).toBeDefined();
  expect(pantry).toBeDefined();
  expect(produce).toBeDefined();

  const costcoName = `Costco ${uniqueSuffix}`;
  const traderJoesName = `Trader Joe's ${uniqueSuffix}`;
  const milkName = `Milk ${uniqueSuffix}`;
  const breadName = `Bread ${uniqueSuffix}`;
  const applesName = `Apples ${uniqueSuffix}`;

  const costco = await postJson<Store>(page, "/api/stores", { name: costcoName });
  const traderJoes = await postJson<Store>(page, "/api/stores", { name: traderJoesName });

  await postJson(page, "/api/items", {
    name: milkName,
    categoryId: dairy?.id,
    quantity: "1 gallon",
    storeIds: [costco.id],
  });
  await postJson(page, "/api/items", {
    name: breadName,
    categoryId: pantry?.id,
    quantity: "1 loaf",
  });
  await postJson(page, "/api/items", {
    name: applesName,
    categoryId: produce?.id,
    quantity: "6",
    storeIds: [traderJoes.id],
  });

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);

  return {
    milkName,
    breadName,
    applesName,
    costcoName,
    traderJoesName,
  };
}

test.describe("dashboard shopping trip", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);

  let tripFixture: TripFixture;

  test.beforeEach(async ({ page }, testInfo) => {
    const uniqueSuffix = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");

    tripFixture = await createTripFixture(page, uniqueSuffix);
  });

  test("can check and uncheck an item from the dashboard", async ({ page }) => {
    const row = page.getByRole("button", { name: tripFixture.milkName, exact: true });

    await row.click();
    const completedSection = page.getByRole("heading", { name: /Completed \(1\)/i });
    await expect(completedSection).toBeVisible();

    const completedRow = page.getByRole("button", { name: tripFixture.milkName, exact: true });
    await expect(completedRow).toBeVisible();

    await completedRow.click();
    await expect(page.getByRole("button", { name: tripFixture.milkName, exact: true })).toBeVisible();
  });

  test("can archive a completed item and re-add it from history", async ({ page }) => {
    const row = page.getByRole("button", { name: tripFixture.milkName, exact: true });
    const checkedResponse = page.waitForResponse(
      (response) => response.url().includes("/api/items/") && response.request().method() === "PATCH"
    );
    await row.click();
    await checkedResponse;
    await expect(page.getByRole("heading", { name: /Completed \(1\)/i })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /clear completed/i }).click();

    await expect(page.getByRole("button", { name: tripFixture.milkName, exact: true })).toHaveCount(0);
    await Promise.all([
      page.waitForURL(/\/history$/),
      page.getByRole("link", { name: /item history/i }).click(),
    ]);
    await expect(page.getByRole("heading", { name: /item history/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(tripFixture.milkName, { exact: false })).toBeVisible();
    await expect(page.getByText(tripFixture.costcoName, { exact: false })).toBeVisible();
    await expect(page.getByText(/Dairy/i, { exact: false })).toBeVisible();
    await expect(page.getByText(/1 gallon/i, { exact: false })).toBeVisible();
    await page.getByRole("button", { name: /re-add/i }).click();
    await expect(page.getByText(tripFixture.milkName, { exact: false })).toHaveCount(0);
    await Promise.all([
      page.waitForURL(/\/dashboard$/),
      page.getByRole("link", { name: /back to shopping list/i }).click(),
    ]);
    await expect(page.getByRole("button", { name: tripFixture.milkName, exact: true })).toBeVisible();
  });

  test("can filter by store while still showing untagged items", async ({ page }) => {
    await page.getByRole("button", { name: tripFixture.costcoName, exact: true }).click();

    await expect(page.getByRole("button", { name: tripFixture.breadName, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: tripFixture.milkName, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "All stores", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: tripFixture.applesName, exact: true })).toHaveCount(0);
  });

  test("can switch between category, alphabetical, and store organization", async ({ page }) => {
    await page.getByRole("button", { name: /alphabetical/i }).click();
    await expect(page.getByRole("button", { name: tripFixture.applesName, exact: true })).toBeVisible();

    await page.getByRole("button", { name: /^store$/i }).click();
    await expect(
      page.getByRole("heading", {
        name: new RegExp(`^${escapeRegExp(tripFixture.costcoName)} \\(1\\)$`, "i"),
      })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /Untagged \(\d+\)/i })).toBeVisible();

    await page.getByRole("button", { name: /category/i }).click();
    await expect(page.getByRole("heading", { name: /Produce \(\d+\)/i })).toBeVisible();
    await expect(page.getByRole("button", { name: tripFixture.milkName, exact: true })).toBeVisible();
  });
});
