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
  console.log('Login page:', page.url());

  await page.waitForSelector('#spi_tmp');
  await page.type('#spi_tmp', LOGIN!);
  console.log('Typed login, looking for Continuer button...');

  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent?.trim(),
      id: b.id,
      type: b.type,
      disabled: b.disabled,
    }))
  );
  console.log('Buttons found:', JSON.stringify(buttons, null, 2));

  await page.click('#btnAction');
  console.log('Clicked Continuer');

  await page.waitForSelector('#pwd_tmp', { visible: true });
  console.log('Password field visible');
  await page.type('#pwd_tmp', PASSWORD!);
  await page.click('#btnAction');
  console.log('Clicked Se connecter');

  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  console.log('Logged in. Current URL:', page.url());
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
page.on('console', msg => console.log('[browser]', msg.text()));

try {
  await login(page);
  await updateRate(page, newRate);
} catch (err) {
  console.error("Error:", (err as Error).message);
} finally {
  await browser.close();
}
