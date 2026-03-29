# tax-automation

Automates updating the French "Taux Neutre" (PAS withholding rate) on impots.gouv.fr based on monthly net income from a payroll PDF.

## Current Status

| # | Task | Status | File |
| - | ---- | ------ | ---- |
| 1 | Gmail trigger → PDF extraction → NET IMPOSABLE parser | **TODO** | not written yet |
| 2 | BOFIP tax grid scraper | **Done** | `n8n-nodes/task1-scraper-node.js` |
| 3 | Rate comparator + static state | **Done** | `n8n-nodes/task2-rate-comparator.js` |
| 4 | Puppeteer login + form update | **Done** | `scripts/update-tax-rate.ts` |
| — | n8n workflow JSON | **Done (partial)** | `My workflow.json` — importable, but uses a Manual Trigger + hardcoded `netImposable = 3500` as placeholder until Task 1 is wired in |

**What's left:** The workflow only runs when you receive a paystub email. Replace the Manual Trigger + hardcoded Set node with: Gmail Trigger (on new paystub) → Extract PDF → parse NET IMPOSABLE.

---

## How It Works

1. **Receive** a new paystub email in Gmail — this is the trigger for the entire workflow
2. **Extract** `NET IMPOSABLE` (monthly) from the attached PDF
3. **Lookup** the current tax bracket grid from BOFIP — purely informational, used to determine which rate applies to the extracted income
4. **Gate** — if the rate hasn't changed since last run, stop. If it changed, proceed.
5. **Update** impots.gouv.fr automatically via Puppeteer

---

## Stack

- **n8n** — workflow orchestration (nodes 1–4)
- **Puppeteer** — browser automation for login + form submission
- **Bun** — TypeScript runtime for the Puppeteer script (required — script uses top-level await + TypeScript)

---

## File Structure

```text
tax-automation/
├── scripts/
│   └── update-tax-rate.ts        # Task 4: Puppeteer login + form automation (Bun)
├── n8n-nodes/
│   ├── task1-scraper-node.js     # Task 1: paste into n8n Code node
│   └── task2-rate-comparator.js  # Task 2: paste into n8n Code node
├── auth/                         # storageState would go here (not implemented — see Note)
├── My workflow.json              # importable n8n workflow (partial — see Status above)
├── package.json
└── .env.example
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure credentials

Copy `.env.example` to `.env` and fill in:

```env
IMPOTS_LOGIN=<your 13-digit fiscal number (SPI)>
IMPOTS_PASSWORD=<your password>
```

### 3. Start n8n

> The `NODES_EXCLUDE` env var must be set to allow the Execute Command node, which is disabled by default in n8n v2.x for security reasons.

**Windows CMD:**

```cmd
set NODES_EXCLUDE=[] && npx n8n start
```

**Windows PowerShell:**

```powershell
$env:NODES_EXCLUDE="[]"; npx n8n start
```

Then open [http://localhost:5678](http://localhost:5678).

### 4. Disable uBlock Origin (or any ad blocker) for localhost

The Google OAuth popup that n8n opens (`accounts.google.com`) gets silently blocked by uBlock Origin, making the "Sign in with Google" button appear to do nothing. Disable your ad blocker for `localhost:5678` before attempting to connect.

### 5. Import the workflow

In n8n: top-right hamburger menu (top right) → Import from file → select `My workflow.json`.

---

## n8n Workflow (current nodes)

```text
Manual Trigger
  → Tax Web Scraper      (Code — task1-scraper-node.js)
  → Net Imposable        (Set — HARDCODED 3500, replace with PDF parser output)
  → Rate Comparator      (Code — task2-rate-comparator.js)
  → If changeDetected
      true  → Execute Command (runs Puppeteer script)
      false → (nothing — workflow ends silently)
```

**Target workflow (once Task 3 is done):**

```text
Gmail Trigger (new payroll email)
  → Download PDF attachment
  → Extract Text from PDF (n8n built-in)
  → Code node: PDF Regex Parser  ← THIS IS WHAT'S MISSING
  → Tax Web Scraper
  → Rate Comparator
  → If changeDetected
      true  → Execute Command
```

---

## Task 1 — BOFIP Tax Grid Scraper (`task1-scraper-node.js`)

**What it does:** Fetches the BOFIP page and parses the "Grille des taux par défaut applicables aux contribuables domiciliés en métropole" table.

**Uses:** `helpers.httpRequest` (n8n built-in — no npm deps needed in Code node).

**Output shape:**

```json
[
  { "min": 0,    "max": 1620, "rate": 0    },
  { "min": 1620, "max": 1749, "rate": 0.02 },
  { "min": 11877, "max": null, "rate": 0.43 }
]
```

Rate is stored as a decimal (0.02 = 2%).

**Table format note:** The BOFIP table uses text descriptions for ranges (e.g., "Fraction du revenu mensuel inférieure à 1 620 euros"), NOT numeric columns. `parseRangeText()` handles this with regex.

**BOFIP URL:** `https://bofip.impots.gouv.fr/bofip/11255-PGP.html/identifiant%3DBOI-BAREME-000037-20250410`

If the government updates the page for a new year, update this URL.

---

## Task 2 — Rate Comparator (`task2-rate-comparator.js`)

**What it does:** Finds the bracket matching `netImposable` (monthly), compares to the last applied rate, and gates the workflow.

**Input (from previous node):**

```json
{ "netImposable": 3500, "taxGrid": [] }
```

**State persistence:** Uses `$getWorkflowStaticData('global')` — stores `lastAppliedRate` in n8n's database. Survives restarts and re-deploys. No external DB needed.

**Output:**

```json
{
  "changeDetected": true,
  "currentRate": 0.07,
  "currentRatePercent": "7.0%",
  "oldRate": 0.05,
  "oldRatePercent": "5.0%",
  "netImposable": 3500,
  "matchedBracket": { "min": 3084, "max": 3363, "rate": 0.07 },
  "timestamp": "2026-03-29T..."
}
```

**Bracket logic:** Half-open intervals `[min, max)`. Last bracket has `max: null` (open-ended, catches all income above the highest threshold).

---

## Task 4 — Puppeteer Script (`scripts/update-tax-rate.ts`)

**Runtime:** Bun (not Node — uses top-level await and TypeScript directly).

**Usage:**

```bash
bun scripts/update-tax-rate.ts <annualRevenue>
# e.g.
bun scripts/update-tax-rate.ts 42000
```

The n8n Execute Command node passes `{{ $json.netImposable * 12 }}` (monthly × 12 = annual) as the argument.

**Login flow:**

1. Navigates to `https://cfspart.impots.gouv.fr/` (auto-redirects to OAuth login)
2. Fills `#spi_tmp` (fiscal number) → clicks `#btnAction` (Continuer)
3. Fills `#pwd_tmp` (password) → clicks `#btnAction` (Se connecter)
4. **Waits indefinitely** for manual 2FA entry (`timeout: 0`) — browser stays open (`headless: false`)
5. After 2FA, navigates to `https://cfspart.impots.gouv.fr/tremisu/saisie-revenus.html`

**Form update flow:**

1. Clicks `#menu-taux-btn` ("Actualiser suite à une hausse ou une baisse de vos revenus")
2. Clicks `#submit-btn-saisiesitfam` ("Continuer" on family situation step)
3. Types annual revenue into `#code1AJ`
4. Clicks `#validerDeclarationBoutton` ("Valider ma saisie")

**Browser is left open** after the script runs (`browser.close()` is commented out intentionally).

**Note on 2FA:** There is no session persistence / storageState implemented yet. Every run will trigger 2FA. To fix this in the future, add `browser.saveStorageState()` after login and `BrowserContext.storageState` on launch.

---

## Task 3 — TODO: Gmail + PDF Parser

**What needs to be built in n8n:**

1. **Gmail Trigger node** — trigger on new emails from the payroll sender, with attachment filter
2. **n8n built-in: Extract from File** (or "Read Binary File") — extracts raw text from the PDF attachment
3. **Code node: PDF Regex Parser** — extracts the `NET IMPOSABLE` value

**The regex to extract NET IMPOSABLE from raw PDF text:**

```js
function extractNetImposable(rawText) {
  /* Handles:
   *   "NET IMPOSABLE         2 150,00"
   *   "NET IMPOSABLE 2150.00 €"
   *   "NET IMPOSABLE: 2 150,00 €"
   *   With non-breaking spaces as thousands separators
   */
  const match = rawText.match(
    /NET\s+IMPOSABLE\s*:?\s*([\d\s\u00A0]+[.,]\d{2})\s*€?/i
  );

  if (!match) return null;

  const cleaned = match[1]
    .replace(/[\s\u00A0]/g, '')
    .replace(',', '.');

  return parseFloat(cleaned);
}
```

**Code node output should be:**

```json
{ "netImposable": 2150.00 }
```

This feeds directly into the Rate Comparator node which already expects `netImposable` as a monthly number.

**Then merge `taxGrid` from Task 1 into the same item** using a Merge node (or run the scraper after the PDF parser and pass both through).

---

## Workflow Data Flow (full target)

```text
Gmail Trigger
  ↓ binary attachment
Extract from File (PDF → text)
  ↓ raw text string
Code: PDF Regex Parser
  ↓ { netImposable: 2150 }
Code: Tax Web Scraper           ← already merges taxGrid into output
  ↓ { netImposable: 2150, taxGrid: [...] }
Code: Rate Comparator
  ↓ { changeDetected: true/false, currentRate, ... }
IF changeDetected === true
  ↓ true branch
Execute Command: bun update-tax-rate.ts (annualRevenue)
```
