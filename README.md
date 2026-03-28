# tax-automation

Automates updating the French "Taux Neutre" (PAS withholding rate) on impots.gouv.fr based on your net income.

## How it works

1. **Scrape** the current tax bracket grid from BOFIP (impots.gouv.fr official tax tables)
2. **Compare** your monthly net income against the grid to find your applicable rate
3. **Detect** if the rate has changed since the last run
4. **Update** impots.gouv.fr automatically via Puppeteer if a change is detected

## Stack

- **n8n** — workflow orchestration (tasks 1–2)
- **Puppeteer** — browser automation for login + form submission (task 3)
- **Bun** — TypeScript runtime for the Puppeteer script

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure credentials

Copy `.env.example` to `.env` and fill in:

```
IMPOTS_LOGIN=<your 13-digit fiscal number>
IMPOTS_PASSWORD=<your password>
```

### 3. Start n8n

> ⚠️ The `NODES_EXCLUDE="[]"` flag is required to enable the Execute Command node (disabled by default in n8n v2.x).

```bash
NODES_EXCLUDE="[]" npm run start:n8n
```

Then open [http://localhost:5678](http://localhost:5678).

## n8n Workflow

Build the following nodes in order:

| # | Node | Type | Notes |
|---|------|------|-------|
| 1 | Manual Trigger | Trigger | Kick off manually (or set a schedule) |
| 2 | Tax Web Scraper | Code | Paste `n8n-nodes/task1-scraper-node.js` |
| 3 | Net Imposable | Edit Fields | Add `netImposable` (monthly net, number) + enable "Include Other Input Fields" |
| 4 | Rate Comparator | Code | Paste `n8n-nodes/task2-rate-comparator.js` |
| 5 | If | IF | Condition: `{{ $json.changeDetected }}` is true |
| 6 | Execute Command | Execute Command | True branch only — runs the Puppeteer script |

### Execute Command node

Set `SCRIPT_PATH` in your `.env` to the absolute path of `update-tax-rate.ts`, then use:

```
bun "%SCRIPT_PATH%" {{ $json.netImposable * 12 }}
```

> The script expects **annual** revenue. Task 2 outputs monthly (`netImposable`), so multiply by 12.

## Puppeteer Script

```bash
bun scripts/update-tax-rate.ts <annualRevenue>
# e.g.
bun scripts/update-tax-rate.ts 42000
```

The script:
1. Navigates to `cfspart.impots.gouv.fr` (auto-redirects to OAuth login)
2. Fills fiscal number + password
3. Waits for manual 2FA code entry (browser stays open)
4. Navigates to `saisie-revenus.html`
5. Clicks "Actualiser suite à une hausse ou une baisse de vos revenus"
6. Clicks "Continuer" on the family situation step
7. Enters the annual revenue in `#code1AJ`
8. Clicks "Valider ma saisie"

## Scripts

| Command | Description |
|---------|-------------|
| `npm run test:scraper` | Run the tax grid scraper standalone |
| `npm run start:n8n` | Start n8n (without Execute Command node) |
| `NODES_EXCLUDE="[]" npm run start:n8n` | Start n8n with Execute Command node enabled |
