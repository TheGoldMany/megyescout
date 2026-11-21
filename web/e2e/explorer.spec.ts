import { expect, test, type Page } from "@playwright/test";

/** The URL updates before the new rows render, so poll until every visible row satisfies `ok`. */
async function expectRows(page: Page, selector: string, ok: (cells: string[]) => boolean) {
  await expect
    .poll(async () => {
      const cells = await page.locator(selector).allInnerTexts();
      return cells.length > 0 && ok(cells);
    })
    .toBe(true);
}

test.describe("Régiós Scout Kereső", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/explorer");
    await expect(page.getByRole("heading", { name: "Régiós Scout Kereső" })).toBeVisible();
  });

  test("shows KPIs and a populated table", async ({ page }) => {
    await expect(page.getByText("Követett játékosok")).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("position filter keeps only matching players", async ({ page }) => {
    await page.getByRole("button", { name: "Támadó" }).click();
    await expect(page).toHaveURL(/pos=FWD/);
    await expectRows(page, "table tbody tr td:nth-child(3)", (cells) => cells.every((c) => c.includes("TÁM")));
  });

  test("youth-rule toggle restricts birth years to the window", async ({ page }) => {
    await page.getByRole("button", { name: /Fiatalszabály \d{4}–\d{4}/ }).click();
    await expect(page).toHaveURL(/byMin=\d{4}&byMax=\d{4}/);
    await expectRows(page, "table tbody tr td:nth-child(2)", (ages) => ages.every((a) => /\((06|07|08)\)/.test(a)));
  });

  test("distance sort is ascending and respects the default 70 km radius", async ({ page }) => {
    await page.getByRole("link", { name: "Klub · km" }).click();
    await expect(page).toHaveURL(/sort=km/);
    await expectRows(page, "table tbody tr td:nth-child(4) div.font-mono", (cells) => {
      const km = cells.map((t) => parseFloat(t));
      return km.every((v, i) => i === 0 || v >= km[i - 1]) && Math.max(...km) <= 70;
    });
  });

  test("free-text search matches the club town", async ({ page }) => {
    await page.fill("#q", "Tiszakécske");
    await expect(page).toHaveURL(/q=Tiszak/);
    await expectRows(page, "table tbody tr td:nth-child(4)", (clubs) => clubs.every((c) => /Tiszakécske/i.test(c)));
  });
});
