/**
 * Task 1 — Dynamic Tax Grid Scraper
 *
 * Scrapes the "Taux Neutre" (default withholding rate) grid from BOFIP.
 * Can be run standalone: `node scrape-tax-grid.js`
 * Or imported as a module in an n8n Code Node via HTTP call to a local microservice.
 *
 * Returns: Array<{ min: number, max: number | null, rate: number }>
 * where rate is a decimal (0.05 = 5%)
 */

const https = require('https');
const http = require('http');

/* -------------------------------------------------------------------------- */
/*  French number format cleaner                                               */
/* -------------------------------------------------------------------------- */

/**
 * Parses a French-formatted number string into a JS float.
 * Handles:
 *  - Non-breaking spaces (U+00A0) and regular spaces as thousands separators
 *  - Commas as decimal separators
 * Examples:
 *  "1 620,00" → 1620
 *  "1\u00A0620,00" → 1620
 *  "7 265,00" → 7265
 *  "0 %" → 0
 */
function parseFrenchNumber(raw) {
  if (!raw) return null;

  const cleaned = raw
    .replace(/\u00A0/g, '')   // non-breaking space
    .replace(/\s/g, '')       // regular spaces
    .replace(',', '.')        // decimal comma → dot
    .replace('%', '')         // strip percent sign
    .trim();

  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

/* -------------------------------------------------------------------------- */
/*  Raw HTML fetcher (no external deps, works in n8n Code Node)               */
/* -------------------------------------------------------------------------- */

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHtml(res.headers.location).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  Table parser — no cheerio, pure regex (n8n Code Node safe)                */
/* -------------------------------------------------------------------------- */

/**
 * Extracts all <tr> blocks from the target table.
 * The table is identified by proximity to the heading
 * "Grille des taux par défaut applicables aux contribuables domiciliés en métropole".
 */
function extractTableRows(html) {
  /* Find the section after the "métropole" heading */
  const sectionMarker = /Grille des taux par d.{1,10}faut applicables aux contribuables domicili.{1,5}s en m.{1,5}tropole/i;
  const markerIndex = html.search(sectionMarker);

  if (markerIndex === -1) {
    throw new Error('Target section not found in page. The page structure may have changed.');
  }

  const relevantHtml = html.slice(markerIndex);

  /* Grab the first <table> after the marker */
  const tableMatch = relevantHtml.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) {
    throw new Error('No table found after target section.');
  }

  const tableHtml = tableMatch[0];

  /* Extract all <tr> blocks */
  const rowMatches = [...tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)];
  return rowMatches.map((m) => m[0]);
}

/**
 * Strips all HTML tags from a string and decodes basic entities.
 */
function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, '\u00A0')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses table rows into a structured tax grid.
 * Expected columns (BOFIP format):
 *   Col 0: Monthly income lower bound  (e.g. "0")
 *   Col 1: Monthly income upper bound  (e.g. "1 620,00")
 *   Col 2: Rate                        (e.g. "0 %")
 *
 * The last bracket has no upper bound (max = null).
 */
function parseRows(rows) {
  const grid = [];

  for (const rowHtml of rows) {
    /* Extract <td> cell contents */
    const cellMatches = [...rowHtml.matchAll(/<td[\s\S]*?<\/td>/gi)];
    if (cellMatches.length < 3) continue; // skip header rows / short rows

    const cells = cellMatches.map((m) => stripTags(m[0]));

    const min = parseFrenchNumber(cells[0]);
    const max = parseFrenchNumber(cells[1]);  // may be null for last row
    const rate = parseFrenchNumber(cells[2]);

    /* Skip rows where we couldn't parse a valid min and rate */
    if (min === null || rate === null) continue;

    grid.push({
      min,
      max: max !== null ? max : null,
      rate: rate / 100, // store as decimal: 5% → 0.05
    });
  }

  return grid;
}

/* -------------------------------------------------------------------------- */
/*  Main export                                                                */
/* -------------------------------------------------------------------------- */

const BOFIP_URL =
  'https://bofip.impots.gouv.fr/bofip/11255-PGP.html/identifiant%3DBOI-BAREME-000037-20250410';

async function scrapeTaxGrid(url = BOFIP_URL) {
  const html = await fetchHtml(url);
  const rows = extractTableRows(html);
  const grid = parseRows(rows);

  if (grid.length === 0) {
    throw new Error('Parsed grid is empty — check the table structure on BOFIP.');
  }

  return grid;
}

/* -------------------------------------------------------------------------- */
/*  Standalone runner                                                          */
/* -------------------------------------------------------------------------- */

if (require.main === module) {
  scrapeTaxGrid()
    .then((grid) => {
      console.log(JSON.stringify(grid, null, 2));
      console.log(`\nTotal brackets: ${grid.length}`);
    })
    .catch((err) => {
      console.error('Scrape failed:', err.message);
      process.exit(1);
    });
}

module.exports = { scrapeTaxGrid, parseFrenchNumber };
