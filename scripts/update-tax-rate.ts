/**
 * Task 3 — Puppeteer script: Login + Update Revenus
 *
 * Run: bun scripts/update-tax-rate.ts <annualRevenue>
 * e.g. bun scripts/update-tax-rate.ts 42000
 *
 * Reads credentials from .env:
 *   IMPOTS_LOGIN=<13-digit fiscal number>
 *   IMPOTS_PASSWORD=<password>
 *
 * n8n Execute Command node:
 * bun "C:\fakePath\tax-automation\scripts\update-tax-rate.ts" {{ $json.annualRevenue }}
 */

import puppeteer, { type Page } from "puppeteer";

const LOGIN = process.env.IMPOTS_LOGIN;
const PASSWORD = process.env.IMPOTS_PASSWORD;

const TARGET_URL = "https://cfspart.impots.gouv.fr/tremisu/saisie-revenus.html";
const LOGIN_URL = "https://cfspart.impots.gouv.fr/";

const annualRevenue = parseInt(process.argv[2], 10);

if (!LOGIN || !PASSWORD) {
  throw new Error("Missing IMPOTS_LOGIN or IMPOTS_PASSWORD in .env");
}

if (isNaN(annualRevenue)) {
  throw new Error("Usage: bun update-tax-rate.ts <annualRevenue> (e.g. 42000)");
}

async function login(page: Page): Promise<void> {
  await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });
  console.log("Login page:", page.url());

  await page.waitForSelector("#spi_tmp");
  await page.type("#spi_tmp", LOGIN!);
  console.log("Typed login, looking for Continuer button...");

  await page.click("#btnAction");
  console.log("Clicked Continuer");

  await page.waitForSelector("#pwd_tmp", { visible: true });
  console.log("Password field visible");
  await page.type("#pwd_tmp", PASSWORD!);
  await page.click("#btnAction");
  console.log("Clicked Se connecter");

  // Wait for manual 2FA code entry — no timeout
  console.log("Waiting for 2FA / security code to be entered manually...");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 0 });
  console.log("Logged in. Current URL:", page.url());
}

async function updateRate(page: Page, revenue: number): Promise<void> {
  await page.goto(TARGET_URL, { waitUntil: "networkidle2" });
  console.log("On target page:", page.url());

  await page.waitForSelector('#menu-taux-btn', { visible: true });
  await page.click('#menu-taux-btn');

  await page.waitForSelector('#submit-btn-saisiesitfam', { visible: true });
  await page.click('#submit-btn-saisiesitfam');

  await page.waitForSelector('#code1AJ', { visible: true });
  await page.type('#code1AJ', String(revenue));

  await page.click('#validerDeclarationBoutton');
  console.log('Submitted revenue:', revenue);
}

const browser = await puppeteer.launch({ headless: false });
const page = await browser.newPage();
page.on("console", (msg) => console.log("[browser]", msg.text()));

try {
  await login(page);
  await updateRate(page, annualRevenue);
} catch (err) {
  console.error("Error:", (err as Error).message);
} finally {
  // await browser.close();
}
