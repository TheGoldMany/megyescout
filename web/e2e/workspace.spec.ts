import { expect, test } from "@playwright/test";

test("save a private note, see it on the board, compare, export, delete", async ({ page }) => {
  // the lowest-index player is never part of the seeded notes
  await page.goto("/explorer?km=150&sort=index&dir=asc");
  const href = await page.locator("table tbody tr a").first().getAttribute("href");
  expect(href).toMatch(/^\/players\//);
  await page.goto(href!);

  await expect(page.getByText("Játékkép – 6 tengelyes radar")).toBeVisible();
  await expect(page.locator(".recharts-radar").first()).toBeVisible();

  const marker = `E2E jegyzet ${Date.now()}`;
  await page.getByRole("button", { name: "Shortlist", exact: true }).click();
  await page.getByRole("radio", { name: "4 csillag" }).click();
  await page.fill("#notes", marker);
  await page.fill("#videoUrl", "https://youtu.be/abc?t=120");
  await page.getByRole("button", { name: "Mentés", exact: true }).click();
  await expect(page.getByText("Mentve a klub-széfbe.")).toBeVisible();

  await page.goto("/shortlist");
  await expect(page.getByText(marker)).toBeVisible();
  await expect(page.getByText("Friss forma – a kiszemeltek legutóbbi meccse")).toBeVisible();

  // CSV export contains the note, with a BOM for Excel
  const csv = await page.request.get("/shortlist/export");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body.charCodeAt(0)).toBe(0xfeff);
  expect(body).toContain(marker);

  // compare two players
  const boxes = page.locator('input[type="checkbox"]');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.getByRole("link", { name: "Összehasonlítás" }).click();
  await expect(page).toHaveURL(/\/compare\?ids=/);
  await expect(page.locator(".recharts-radar")).toHaveCount(2);

  // clean up: delete the note from the player page
  await page.goto(href!);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Törlés a klub-széfből" }).click();
  await page.goto("/shortlist");
  await expect(page.getByText(marker)).toHaveCount(0);
});

test("data health page lists sync runs and coverage", async ({ page }) => {
  await page.goto("/data");
  await expect(page.getByRole("heading", { name: "Adatállapot" })).toBeVisible();
  await expect(page.getByText("Szinkronizálási napló")).toBeVisible();
  await expect(page.getByText("Bajnokságok lefedettsége")).toBeVisible();
});
