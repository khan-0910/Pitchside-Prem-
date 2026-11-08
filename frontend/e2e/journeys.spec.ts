import { expect, test, type Page } from "@playwright/test";

const noSideScroll = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
};

test("homepage shows real data and reaches the dashboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Most likely score").first()).toBeVisible({ timeout: 15_000 });
  await noSideScroll(page);
  await page.getByRole("link", { name: "Explore Pitchside" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("every dashboard page loads with no side scroll", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const pages: [string, string][] = [
    ["/app", "Overview"], ["/app/matches", "Match Centre"], ["/app/players", "Player Lab"],
    ["/app/transfers", "Transfer Intelligence"], ["/app/what-if", "What-If Lab"],
    ["/app/models", "Model Performance"], ["/app/data", "Data Health"], ["/app/settings", "Settings"],
  ];
  for (const [path, title] of pages) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await noSideScroll(page);
  }
  expect(errors).toEqual([]);
});

test("a person can read a match prediction", async ({ page }) => {
  await page.goto("/app/matches");
  await page.locator("main li button").first().click();
  await expect(page.getByText(/Scoreline chances/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "How the model got here" })).toBeVisible();
  await page.getByRole("button", { name: /^Team strength/ }).click();
  await expect(page.getByRole("rowheader", { name: "Elo rating" })).toBeVisible();
  await expect(page.getByText(/^Step 2 of 7/)).toBeVisible();
});

test("a person can find a player and compare them", async ({ page }) => {
  await page.goto("/app/players");
  await page.getByLabel("Search by name").fill("Saka");
  await page.getByRole("button", { name: /Saka/ }).first().click();
  await expect(page.getByRole("heading", { name: /Saka/, level: 2 })).toBeVisible();
  await page.getByRole("button", { name: /^Compare with/ }).first().click();
  await expect(page.getByText("Main differences")).toBeVisible();
});

test("a person can build a what-if scenario with the keyboard path", async ({ page }) => {
  await page.goto("/app/what-if");
  await page.getByLabel("Club").selectOption("liverpool");
  await page.getByRole("button", { name: /^Replace / }).first().click();
  await page.getByRole("button", { name: /^Bring in / }).first().click();
  await page.getByRole("button", { name: "Apply replacement" }).click();
  await expect(page.getByText(/Hypothetical scenario/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Match predictions, before and after/)).toBeVisible();
});

test("reduced motion keeps all the content", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", baseURL });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("Understand the Premier League beyond the scoreline.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /SEE THE GAME DIFFERENTLY/ })).toBeAttached();
  await expect(page.getByText("THE GAME HAS", { exact: true })).toBeVisible();
  await context.close();
});

test("the hero ball can be kicked and comes home", async ({ page }) => {
  await page.goto("/");
  const ball = page.getByRole("button", { name: "Kick the ball" });
  await expect(ball).toBeVisible();
  await page.waitForTimeout(2200);
  await ball.click();
  await page.waitForTimeout(500);
  const moved = await ball.evaluate((el) => getComputedStyle(el).transform);
  expect(moved).not.toBe("none");
  await noSideScroll(page);
});

test("the homepage ends in a goal", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "same section, covered on desktop");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("heading", { name: /SEE THE GAME DIFFERENTLY/ }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("link", { name: "Open the dashboard" }).last()).toBeVisible({ timeout: 8000 });
});

test("missing routes end somewhere useful", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "Out of play" })).toBeVisible();
});

test("the ball rolls in from the homepage and follows the menu", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "the side menu is desktop only");
  const centre = async (selector: string) => {
    const box = await page.locator(selector).first().boundingBox();
    return box ? box.y + box.height / 2 : NaN;
  };
  const ball = '[data-testid="nav-ball"]';
  await page.goto("/");
  await page.getByRole("link", { name: "Open the dashboard" }).first().click();
  await expect(page.locator(ball)).toBeVisible();
  await expect.poll(async () => Math.abs((await centre(ball)) - (await centre('nav[aria-label="Dashboard"] a[href$="/app"]')))).toBeLessThan(2);
  await page.getByRole("link", { name: "What-If Lab" }).click();
  await expect.poll(async () => Math.abs((await centre(ball)) - (await centre('nav[aria-label="Dashboard"] a[href$="/what-if"]')))).toBeLessThan(2);
});
