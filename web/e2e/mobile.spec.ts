import { expect, test } from "@playwright/test";

test("phone layout: card list and collapsible filters", async ({ page }) => {
  await page.goto("/explorer");
  // the table is hidden, the card list is shown
  await expect(page.locator("table")).toBeHidden();
  await expect(page.locator("ul li a[href^='/players/']").first()).toBeVisible();
  // advanced filters are collapsed until requested
  await expect(page.getByLabel("Osztály")).toBeHidden();
  await page.getByRole("button", { name: "További szűrők" }).click();
  await expect(page.getByLabel("Osztály")).toBeVisible();
});
