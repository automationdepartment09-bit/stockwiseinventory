// Generic printable receipt generator. Opens a new window with an A4-styled
// HTML document and triggers print. Falls back to current tab if popup blocked.

export type ReceiptKind =
  | "withdrawal"
  | "return"
  | "request"
  | "movement";

export interface ReceiptField {
  label: string;
  value: string | number | null | undefined;
  full?: boolean; // span full width
}

export interface ReceiptOptions {
  kind: ReceiptKind;
  receiptNo: string;       // e.g. WTH-AB12CD
  title: string;           // "Withdrawal slip"
  subtitle?: string;       // free text under title
  date: string;            // ISO or display
  org?: string;            // header company / app name
  fields: ReceiptField[];  // key/value rows
  lineItems?: { name: string; sku?: string; qty: number; note?: string }[];
  notes?: string;
  signatures?: string[];   // labels for signature lines
  footer?: string;
}

const esc = (s: any) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const buildReceiptHtml = (o: ReceiptOptions) => {
  const dateLabel = (() => {
    const d = new Date(o.date);
    return isNaN(d.getTime()) ? o.date : d.toLocaleString();
  })();
  const fields = o.fields.filter((f) => f.value !== undefined && f.value !== null && f.value !== "");
  const sigs = o.signatures ?? ["Issued by", "Received by"];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(o.title)} — ${esc(o.receiptNo)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f3f4f6; color: #0f172a; font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  .page { width: 210mm; min-height: 297mm; padding: 18mm 16mm; margin: 16px auto; background: #fff; box-shadow: 0 6px 24px rgba(0,0,0,.08); }
  .head { display:flex; align-items:flex-start; justify-content:space-between; gap: 16px; padding-bottom: 12px; border-bottom: 2px solid #0f172a; }
  .org { font-weight: 700; font-size: 18px; letter-spacing: .3px; }
  .doc-title { font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; margin: 0; }
  .doc-sub { color:#475569; font-size: 12px; margin-top: 2px; }
  .meta { text-align: right; font-size: 12px; color:#334155; }
  .meta .num { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; color:#0f172a; font-size: 14px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 18px 0; }
  .row { display:flex; gap: 8px; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; }
  .row.full { grid-column: 1 / -1; }
  .row .k { color:#64748b; min-width: 130px; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
  .row .v { color:#0f172a; font-weight: 500; word-break: break-word; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align:left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
  th { background:#f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color:#475569; }
  td.qty, th.qty { text-align: right; font-variant-numeric: tabular-nums; }
  .notes { margin-top: 16px; padding: 10px 12px; background:#f8fafc; border-left: 3px solid #0f172a; font-size: 12px; white-space: pre-wrap; }
  .signs { display:grid; grid-template-columns: repeat(${sigs.length}, 1fr); gap: 24px; margin-top: 48px; }
  .sig { text-align:center; }
  .sig .line { border-top: 1px solid #0f172a; padding-top: 6px; font-size: 11px; color:#475569; }
  .footer { margin-top: 28px; text-align:center; color:#94a3b8; font-size: 10px; }
  .actions { position: sticky; top: 0; padding: 8px 12px; background:#0f172a; color:#fff; display:flex; justify-content:space-between; align-items:center; }
  .actions button { background:#fff; color:#0f172a; border:0; padding:6px 14px; border-radius:6px; font-weight:600; cursor:pointer; }
  .actions button + button { margin-left: 8px; background: transparent; color:#fff; border:1px solid #fff; }
  @media print {
    .actions { display: none; }
    body { background: #fff; }
    .page { margin: 0; box-shadow: none; width: auto; min-height: auto; padding: 14mm; }
  }
</style>
</head>
<body>
<div class="actions">
  <strong>${esc(o.title)} · ${esc(o.receiptNo)}</strong>
  <div>
    <button onclick="window.print()">Print</button>
    <button onclick="window.close()">Close</button>
  </div>
</div>
<div class="page">
  <div class="head">
    <div>
      <div class="org">${esc(o.org ?? "Inventory")}</div>
      <h1 class="doc-title">${esc(o.title)}</h1>
      ${o.subtitle ? `<div class="doc-sub">${esc(o.subtitle)}</div>` : ""}
    </div>
    <div class="meta">
      <div>Receipt no.</div>
      <div class="num">${esc(o.receiptNo)}</div>
      <div style="margin-top:6px">${esc(dateLabel)}</div>
    </div>
  </div>

  <div class="grid">
    ${fields
      .map(
        (f) => `<div class="row${f.full ? " full" : ""}">
          <div class="k">${esc(f.label)}</div>
          <div class="v">${esc(f.value)}</div>
        </div>`,
      )
      .join("")}
  </div>

  ${
    o.lineItems && o.lineItems.length
      ? `<table>
          <thead><tr><th>Item</th><th>SKU</th><th class="qty">Qty</th><th>Note</th></tr></thead>
          <tbody>
            ${o.lineItems
              .map(
                (l) => `<tr>
                  <td>${esc(l.name)}</td>
                  <td>${esc(l.sku ?? "")}</td>
                  <td class="qty">${esc(l.qty)}</td>
                  <td>${esc(l.note ?? "")}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>`
      : ""
  }

  ${o.notes ? `<div class="notes"><strong>Notes:</strong> ${esc(o.notes)}</div>` : ""}

  <div class="signs">
    ${sigs.map((s) => `<div class="sig"><div class="line">${esc(s)}</div></div>`).join("")}
  </div>

  <div class="footer">${esc(o.footer ?? `Generated ${new Date().toLocaleString()}`)}</div>
</div>
<script>
  // Auto-open print dialog shortly after load
  setTimeout(function(){ try { window.focus(); window.print(); } catch(e){} }, 350);
</script>
</body>
</html>`;
};

export const printReceipt = (o: ReceiptOptions) => {
  const html = buildReceiptHtml(o);
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
  if (!w) {
    // Popup blocked: fall back to a Blob URL in a new tab
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
};

// Short receipt id from a UUID + prefix (e.g. WTH-AB12CD)
export const receiptNo = (prefix: string, id: string) =>
  `${prefix}-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
