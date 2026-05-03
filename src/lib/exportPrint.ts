// CSV export + printable list helpers for tabular data.

const csvEscape = (v: any) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const exportCsv = (filename: string, columns: string[], rows: (string | number | null | undefined)[][]) => {
  const csv = [columns.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

const esc = (s: any) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface PrintListOptions {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number | null | undefined)[][];
  org?: string;
  meta?: { label: string; value: string }[];
}

export const printList = (o: PrintListOptions) => {
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>${esc(o.title)}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#f3f4f6;color:#0f172a;font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
  .page{width:297mm;min-height:210mm;padding:14mm 14mm;margin:16px auto;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.08)}
  .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:10px}
  .org{font-weight:700;font-size:14px}
  h1{margin:0;font-size:20px;text-transform:uppercase;letter-spacing:.5px}
  .sub{color:#475569;font-size:11px;margin-top:2px}
  .meta{font-size:11px;color:#334155;text-align:right}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:11px;vertical-align:top}
  th{background:#f1f5f9;text-transform:uppercase;font-size:10px;letter-spacing:.4px;color:#475569}
  tr:nth-child(even) td{background:#fafafa}
  .footer{margin-top:14px;color:#94a3b8;font-size:10px;text-align:center}
  .actions{position:sticky;top:0;background:#0f172a;color:#fff;padding:8px 12px;display:flex;justify-content:space-between;align-items:center}
  .actions button{background:#fff;color:#0f172a;border:0;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer}
  .actions button+button{margin-left:8px;background:transparent;color:#fff;border:1px solid #fff}
  @media print{.actions{display:none}body{background:#fff}.page{margin:0;box-shadow:none;width:auto;min-height:auto;padding:10mm}}
  @page{size:A4 landscape;margin:10mm}
</style></head><body>
<div class="actions"><strong>${esc(o.title)}</strong>
  <div><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>
</div>
<div class="page">
  <div class="head">
    <div><div class="org">${esc(o.org ?? "Inventory")}</div><h1>${esc(o.title)}</h1>${o.subtitle ? `<div class="sub">${esc(o.subtitle)}</div>` : ""}</div>
    <div class="meta">${(o.meta ?? []).map((m) => `<div><strong>${esc(m.label)}:</strong> ${esc(m.value)}</div>`).join("")}<div>Generated ${esc(new Date().toLocaleString())}</div><div>${o.rows.length} record(s)</div></div>
  </div>
  <table>
    <thead><tr>${o.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${o.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>
  <div class="footer">${esc(o.title)} — ${o.rows.length} record(s)</div>
</div>
<script>setTimeout(function(){try{window.focus();window.print();}catch(e){}},350);</script>
</body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer,width=1100,height=900");
  if (!w) {
    const blob = new Blob([html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
};
