/**
 * Task 2 — n8n Code Node: Rate Comparator with Static State
 *
 * Paste this entire block into an n8n "Code" node (mode: "Run Once for All Items").
 *
 * Expected input items:
 *   items[0].json.netImposable  — number (monthly net imposable from PDF)
 *   items[0].json.taxGrid       — array from Task 1 scraper
 *                                 [{ min, max, rate }, ...]
 *
 * Workflow static data key: "lastAppliedRate"
 * Persists the last rate applied to impots.gouv.fr so we only trigger
 * the Playwright update when the bracket actually changes.
 */

/* -------------------------------------------------------------------------- */
/*  1. Read inputs                                                             */
/* -------------------------------------------------------------------------- */

const { netImposable, taxGrid } = items[0].json;

if (typeof netImposable !== 'number' || !Array.isArray(taxGrid)) {
  throw new Error(
    `Invalid input. Expected netImposable: number, taxGrid: array. Got: ${JSON.stringify({ netImposable, taxGrid })}`
  );
}

/* -------------------------------------------------------------------------- */
/*  2. Load persisted state                                                    */
/* -------------------------------------------------------------------------- */

/*
 * getWorkflowStaticData('global') persists across workflow executions.
 * It survives workflow re-saves and process restarts (stored in n8n DB).
 * Mutating the returned object automatically persists on node completion.
 */
const staticData = $getWorkflowStaticData('global');

const lastAppliedRate = staticData.lastAppliedRate ?? null;

/* -------------------------------------------------------------------------- */
/*  3. Find the matching bracket                                               */
/* -------------------------------------------------------------------------- */

/**
 * Finds the tax bracket for a given monthly income.
 * Brackets are half-open intervals: [min, max)
 * The last bracket has max === null (open-ended).
 */
function findBracket(income, grid) {
  for (const bracket of grid) {
    const withinMin = income >= bracket.min;
    const withinMax = bracket.max === null || income < bracket.max;

    if (withinMin && withinMax) {
      return bracket;
    }
  }
  return null;
}

const matchedBracket = findBracket(netImposable, taxGrid);

if (!matchedBracket) {
  throw new Error(
    `No bracket found for netImposable=${netImposable}. ` +
    `Grid range: ${taxGrid[0]?.min} – ${taxGrid[taxGrid.length - 1]?.max ?? '∞'}`
  );
}

const currentRate = matchedBracket.rate;

/* -------------------------------------------------------------------------- */
/*  4. Compare and decide                                                      */
/* -------------------------------------------------------------------------- */

const changeDetected = currentRate !== lastAppliedRate;

/* -------------------------------------------------------------------------- */
/*  5. Persist new rate if changed                                             */
/* -------------------------------------------------------------------------- */

if (changeDetected) {
  staticData.lastAppliedRate = currentRate;
}

/* -------------------------------------------------------------------------- */
/*  6. Return result to next node                                              */
/* -------------------------------------------------------------------------- */

/*
 * Downstream routing:
 *   IF node on changeDetected === true  → trigger Playwright script
 *   IF node on changeDetected === false → stop / notify "no change"
 */
return [
  {
    json: {
      changeDetected,
      currentRate,
      currentRatePercent: `${(currentRate * 100).toFixed(1)}%`,
      oldRate: lastAppliedRate,
      oldRatePercent: lastAppliedRate !== null ? `${(lastAppliedRate * 100).toFixed(1)}%` : null,
      netImposable,
      matchedBracket: {
        min: matchedBracket.min,
        max: matchedBracket.max,
        rate: matchedBracket.rate,
      },
      timestamp: new Date().toISOString(),
    },
  },
];
