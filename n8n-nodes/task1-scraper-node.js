/**
 * Task 1 — n8n Code Node: Tax Grid Scraper
 *
 * Paste this into an n8n "Code" node (mode: "Run Once for All Items").
 * No external npm packages needed — uses only Node built-ins.
 *
 * Output:
 *   items[0].json.taxGrid — Array<{ min, max, rate }>
 *
 * https://docs.n8n.io
 */

/* -------------------------------------------------------------------------- */
/*  Helpers (copied from scrape-tax-grid.js for self-contained n8n use)       */
/* -------------------------------------------------------------------------- */

async function fetchHtml(url) {
  return helpers.httpRequest({
    method: "GET",
    url,
    headers: { "User-Agent": "Mozilla/5.0" },
    returnFullResponse: false,
  });
}

function parseFrenchNumber(raw) {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\u00A0/g, "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace("%", "")
    .trim();
  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, "\u00A0")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTableRows(html) {
  const sectionMarker =
    /Grille des taux par d.{1,10}faut applicables aux contribuables domicili.{1,5}s en m.{1,5}tropole/i;
  const markerIndex = html.search(sectionMarker);
  if (markerIndex === -1)
    throw new Error(
      "Target section not found — page structure may have changed.",
    );
  const relevantHtml = html.slice(markerIndex);
  const tableMatch = relevantHtml.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) throw new Error("No table found after target section.");
  return [...tableMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
}

function parseRangeText(text) {
  const parseAmt = (s) => parseFloat(s.replace(/[\s\u00A0]/g, '').replace(',', '.'));
  const supMatch = text.match(/sup.{1,10}rieure\s+ou\s+.{1,5}gale\s+[àa]\s+([\d\s\u00A0]+)\s*euros/i);
  const infMatch = text.match(/inf.{1,5}rieure\s+[àa]\s+([\d\s\u00A0]+)\s*euros/i);
  return {
    min: supMatch ? parseAmt(supMatch[1]) : 0,
    max: infMatch ? parseAmt(infMatch[1]) : null,
  };
}

function parseRows(rows) {
  const grid = [];
  for (const rowHtml of rows) {
    const cellMatches = [...rowHtml.matchAll(/<t[dh][\s\S]*?<\/t[dh]>/gi)];
    if (cellMatches.length < 2) continue;
    const cells = cellMatches.map((m) => stripTags(m[0]));
    const rate = parseFrenchNumber(cells[1]);
    if (rate === null) continue;
    const { min, max } = parseRangeText(cells[0]);
    grid.push({ min, max, rate: rate / 100 });
  }
  return grid;
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                       */
/* -------------------------------------------------------------------------- */

const BOFIP_URL =
  "https://bofip.impots.gouv.fr/bofip/11255-PGP.html/identifiant%3DBOI-BAREME-000037-20250410";

const html = await fetchHtml(BOFIP_URL);
const rows = extractTableRows(html);
const taxGrid = parseRows(rows);

if (taxGrid.length === 0) {
  throw new Error("Parsed tax grid is empty — check BOFIP page structure.");
}

const netImposable = items[0].json.netImposable ?? null;
return [{ json: { taxGrid, scrapedAt: new Date().toISOString(), netImposable } }];
