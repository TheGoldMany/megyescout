import { expect, test, type Page } from "@playwright/test";

/** Client rule: no rounded corners or edges anywhere. */
async function expectNoRoundedCorners(page: Page) {
  const rounded = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .filter((el) => {
        const cs = getComputedStyle(el);
        return [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].some(
          (r) => r !== "0px",
        );
      })
      .map((el) => el.tagName)
      .slice(0, 5),
  );
  expect(rounded).toEqual([]);
}

test("home: grandstand of market values, clubs, transfers, leagues", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ki mennyit ér");
  const stand = page.getByRole("region", { name: "A legértékesebb játékosok" });
  await expect(stand.locator("li")).toHaveCount(15);
  // values descend through the tiers
  const values = (await stand.locator("li span.text-accent").allInnerTexts()).map((t) =>
    t.includes("M") ? parseFloat(t.replace(",", ".")) * 1e6 : parseFloat(t) * 1e3,
  );
  expect([...values].sort((a, b) => b - a)).toEqual(values);
  await expect(page.getByRole("heading", { name: "A legértékesebb keretek" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Friss átigazolások" })).toBeVisible();
  await expectNoRoundedCorners(page);
});

test("club page: squad by position, pitch, standings with the club highlighted", async ({ page }) => {
  await page.goto("/");
  await page.locator('a[href^="/clubs/"]').first().click();
  await expect(page).toHaveURL(/\/clubs\//);
  await expect(page.getByRole("heading", { name: "Keret" })).toBeVisible();
  await expect(page.getByText("Keretérték")).toBeVisible();
  await expect(page.locator("tr.bg-accent\\/10")).toHaveCount(1);
  await expectNoRoundedCorners(page);
});

test("league page: standings are sorted by points", async ({ page }) => {
  await page.goto("/leagues");
  await page.locator('a[href^="/leagues/"]').first().click();
  await expect(page.getByRole("heading", { name: "Tabella" })).toBeVisible();
  const pts = (await page.locator("table tbody tr td:nth-child(10)").allInnerTexts()).map(Number);
  expect(pts.length).toBeGreaterThan(5);
  expect([...pts].sort((a, b) => b - a)).toEqual(pts);
  await expectNoRoundedCorners(page);
});

test("transfers page and player value history", async ({ page }) => {
  await page.goto("/transfers");
  await expect(page.getByRole("heading", { name: /klubváltás/ })).toBeVisible();
  await page.locator('ul a[href^="/players/"]').first().click();
  await expect(page.getByText("Becsült piaci érték")).toBeVisible();
  await expect(page.getByText("Piaci érték alakulása")).toBeVisible();
  await expectNoRoundedCorners(page);
});
