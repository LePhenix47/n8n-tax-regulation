/**
 * Task 0b — n8n Code Node: Parse NET IMPOSABLE from PDF text
 *
 * Paste into a Code node (mode: "Run Once for All Items") after the Extract from File node.
 *
 * Input:  items[0].json.text — raw text extracted from the payslip PDF
 * Output: { netImposable: number }
 *
 * ⚠️ The regex may need tuning depending on the exact PDF format.
 *    Check the log output on first run to see the raw text.
 */

const text = items[0].json.text ?? '';

// Log a snippet to help debug if regex fails
console.log('PDF text (first 1000 chars):', text.slice(0, 1000));

// Target: "Impôt sur le revenu prélevé à la source <BASE> <taux> <montant>"
// The base (first number after the label) is the monthly net imposable for PAS
const match = text.match(/Imp.{1,5}t sur le revenu pr.{1,10}lev.{1,5}\s+[àa]\s+la source\s+([\d\s\u00A0]+[,]\d+)/i);

if (!match) {
  throw new Error('PAS base (Impôt sur le revenu prélevé à la source) not found in PDF. Check console log above for raw text.');
}

const raw = match[1].replace(/[\s\u00A0]/g, '').replace(',', '.');
const netImposable = parseFloat(raw);

if (isNaN(netImposable)) {
  throw new Error(`Failed to parse net imposable value from: "${match[1]}"`);
}

console.log('Parsed netImposable:', netImposable);

return [{ json: { netImposable } }];
