/**
 * Task 0 — n8n Code Node: Validate & Select PDF Attachment
 *
 * Paste into a Code node (mode: "Run Once for All Items") right after the Gmail Trigger.
 *
 * Input:  items[0].json — Gmail message (from Gmail Trigger)
 * Output:
 *   { hasPdf: true,  attachmentId, emailId, subject } — last PDF selected
 *   { hasPdf: false, emailId, subject }               — no PDF found
 */

const msg = items[0].json;

const emailId = msg.id;
const subject = msg.subject ?? msg.headers?.subject ?? '(no subject)';

const attachments = msg.attachments ?? [];
const pdfs = attachments.filter(a => a.mimeType === 'application/pdf');

if (pdfs.length === 0) {
  return [{ json: { hasPdf: false, emailId, subject } }];
}

// Pick the last PDF — assumes attachments are ordered chronologically
const selected = pdfs[pdfs.length - 1];

return [{
  json: {
    hasPdf: true,
    attachmentId: selected.id,
    emailId,
    subject,
  }
}];
