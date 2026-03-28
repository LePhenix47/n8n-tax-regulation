/**
 * Task 3 — Puppeteer script: Login + Update Taux Neutre
 *
 * Run: bun scripts/update-tax-rate.ts <newRate>
 * e.g. bun scripts/update-tax-rate.ts 0.099
 *
 * Reads credentials from .env:
 *   IMPOTS_LOGIN=<13-digit fiscal number>
 *   IMPOTS_PASSWORD=<password>
 *
 *
 * bun "C:\fakePath\tax-automation\scripts\update-tax-rate.ts" {{ $json.currentRate }}
 */

import puppeteer, { type Page } from "puppeteer";

const LOGIN = process.env.IMPOTS_LOGIN;
const PASSWORD = process.env.IMPOTS_PASSWORD;
const TARGET_URL = "https://cfspart.impots.gouv.fr/tremisu/saisie-revenus.html";
const LOGIN_URL = "https://cfspart.impots.gouv.fr/";

const newRate = parseFloat(process.argv[2]);

if (!LOGIN || !PASSWORD) {
  throw new Error("Missing IMPOTS_LOGIN or IMPOTS_PASSWORD in .env");
}
if (isNaN(newRate)) {
  throw new Error("Usage: bun update-tax-rate.ts <rate> (e.g. 0.099)");
}

async function login(page: Page): Promise<void> {
  await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

  // TODO: click login button on homepage if needed to reach the OAuth page
  // await page.click('TODO_LOGIN_BUTTON_SELECTOR');

  // Wait for the fiscal number field
  await page.waitForSelector("TODO_FISCAL_NUMBER_INPUT_SELECTOR");
  await page.type("TODO_FISCAL_NUMBER_INPUT_SELECTOR", LOGIN!);

  // TODO: click "Continuer" if it's a first step before password appears
  // await page.click('TODO_CONTINUER_BUTTON_SELECTOR');
  // await page.waitForSelector('TODO_PASSWORD_INPUT_SELECTOR');

  await page.type("TODO_PASSWORD_INPUT_SELECTOR", PASSWORD!);
  await page.click("TODO_SE_CONNECTER_BUTTON_SELECTOR");

  await page.waitForNavigation({ waitUntil: "networkidle2" });
  console.log("Logged in. Current URL:", page.url());
}

async function updateRate(page: Page, _rate: number): Promise<void> {
  await page.goto(TARGET_URL, { waitUntil: "networkidle2" });
  console.log("On target page:", page.url());

  // TODO: click the button under "Votre taux personnalisé est actuellement de"
  // await page.click('TODO_MODIFY_RATE_BUTTON_SELECTOR');

  // TODO: fill in the form fields (income, etc.)
  // await page.type('TODO_INCOME_FIELD_SELECTOR', String(/* income */));

  // TODO: submit
  // await page.click('TODO_SUBMIT_BUTTON_SELECTOR');

  console.log("Rate update submitted.");
}

const browser = await puppeteer.launch({ headless: false });
const page = await browser.newPage();

try {
  await login(page);
  await updateRate(page, newRate);
} catch (err) {
  console.error("Error:", (err as Error).message);
} finally {
  await browser.close();
}
