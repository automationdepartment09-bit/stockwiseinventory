import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Trash2, Search, Printer, FileText, Package, Boxes } from "lucide-react";
import { toast } from "sonner";
import { formatPHP } from "@/lib/currency";

type QStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

interface Quotation {
  id: string; quote_no: string;
  customer_id: string | null; customer_name: string | null;
  customer_email: string | null; customer_phone: string | null;
  issue_date: string; valid_until: string | null;
  status: QStatus;
  subtotal: number; discount: number; tax_rate: number; tax_amount: number; total: number;
  notes: string | null; terms: string | null;
  created_at: string;
}
interface QLine {
  id?: string; quotation_id?: string;
  source: "catalogue" | "inventory" | "custom";
  catalogue_item_id: string | null;
  item_id: string | null;
  name: string; description: string | null;
  quantity: number; unit_price: number; line_total: number;
  sort_order: number;
}
interface Customer { id: string; name: string; email: string | null; phone: string | null }
interface Cat { id: string; name: string; sku: string | null; unit_price: number; description: string | null }
interface Inv { id: string; name: string; sku: string; unit_price: number | null }

const statusColor: Record<QStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/20 text-primary",
  accepted: "bg-success/20 text-success",
  rejected: "bg-destructive/20 text-destructive",
  expired: "bg-warning/20 text-warning-foreground",
};

const emptyLine = (sort: number): QLine => ({
  source: "custom", catalogue_item_id: null, item_id: null,
  name: "", description: "", quantity: 1, unit_price: 0, line_total: 0, sort_order: sort,
});

const Quotations = () => {
  const { user, hasRole } = useAuth();
  const canManage = hasRole("admin", "manager", "staff");

  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [invs, setInvs] = useState<Inv[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [custName, setCustName] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [status, setStatus] = useState<QStatus>("draft");
  const [discount, setDiscount] = useState("0");
  const [taxRate, setTaxRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<QLine[]>([emptyLine(0)]);

  const load = async () => {
    const [q, c, ci, it] = await Promise.all([
      supabase.from("quotations").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id,name,email,phone").eq("is_active", true).order("name"),
      supabase.from("catalogue_items").select("id,name,sku,unit_price,description").eq("is_active", true).eq("is_visible", true).order("name"),
      supabase.from("items").select("id,name,sku,unit_price").eq("is_active", true).order("name"),
    ]);
    if (q.data) setQuotes(q.data as Quotation[]);
    if (c.data) setCustomers(c.data as Customer[]);
    if (ci.data) setCats(ci.data as Cat[]);
    if (it.data) setInvs(it.data as Inv[]);
  };
  useEffect(() => { load(); }, []);

  // Computed totals
  const subtotal = useMemo(() => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0), [lines]);
  const discNum = Number(discount) || 0;
  const taxBase = Math.max(0, subtotal - discNum);
  const taxAmt = taxBase * ((Number(taxRate) || 0) / 100);
  const total = taxBase + taxAmt;

  const resetForm = () => {
    setEditId(null); setCustomerId(""); setCustName(""); setCustEmail(""); setCustPhone("");
    setIssueDate(new Date().toISOString().slice(0, 10)); setValidUntil(""); setStatus("draft");
    setDiscount("0"); setTaxRate("0"); setNotes(""); setTerms("");
    setLines([emptyLine(0)]);
  };

  const openNew = () => { resetForm(); setOpen(true); };

  const openEdit = async (q: Quotation) => {
    setEditId(q.id);
    setCustomerId(q.customer_id ?? ""); setCustName(q.customer_name ?? "");
    setCustEmail(q.customer_email ?? ""); setCustPhone(q.customer_phone ?? "");
    setIssueDate(q.issue_date); setValidUntil(q.valid_until ?? ""); setStatus(q.status);
    setDiscount(String(q.discount)); setTaxRate(String(q.tax_rate));
    setNotes(q.notes ?? ""); setTerms(q.terms ?? "");
    const { data } = await supabase.from("quotation_items").select("*").eq("quotation_id", q.id).order("sort_order");
    setLines(((data ?? []) as any[]).map((d, i) => ({
      id: d.id, quotation_id: d.quotation_id,
      source: d.catalogue_item_id ? "catalogue" : d.item_id ? "inventory" : "custom",
      catalogue_item_id: d.catalogue_item_id, item_id: d.item_id,
      name: d.name, description: d.description,
      quantity: Number(d.quantity), unit_price: Number(d.unit_price), line_total: Number(d.line_total),
      sort_order: d.sort_order ?? i,
    })));
    setOpen(true);
  };

  const pickCustomer = (id: string) => {
    setCustomerId(id);
    const c = customers.find(x => x.id === id);
    if (c) { setCustName(c.name); setCustEmail(c.email ?? ""); setCustPhone(c.phone ?? ""); }
  };

  const addLine = () => setLines(ls => [...ls, emptyLine(ls.length)]);
  const removeLine = (i: number) => setLines(ls => ls.filter((_, idx) => idx !== i));
  const updateLine = (i: number, patch: Partial<QLine>) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch, line_total: (Number(patch.quantity ?? l.quantity) || 0) * (Number(patch.unit_price ?? l.unit_price) || 0) } : l));

  const pickFromCatalogue = (i: number, id: string) => {
    const c = cats.find(x => x.id === id); if (!c) return;
    updateLine(i, { source: "catalogue", catalogue_item_id: id, item_id: null, name: c.name, description: c.description, unit_price: Number(c.unit_price) || 0 });
  };
  const pickFromInventory = (i: number, id: string) => {
    const it = invs.find(x => x.id === id); if (!it) return;
    updateLine(i, { source: "inventory", item_id: id, catalogue_item_id: null, name: it.name, description: null, unit_price: Number(it.unit_price) || 0 });
  };

  const save = async () => {
    const valid = lines.filter(l => l.name.trim() && Number(l.quantity) > 0);
    if (valid.length === 0) { toast.error("Add at least one line item"); return; }
    const payload: any = {
      customer_id: customerId || null,
      customer_name: custName || null,
      customer_email: custEmail || null,
      customer_phone: custPhone || null,
      issue_date: issueDate,
      valid_until: validUntil || null,
      status,
      subtotal, discount: discNum, tax_rate: Number(taxRate) || 0,
      tax_amount: taxAmt, total,
      notes: notes || null, terms: terms || null,
      created_by: user?.id,
    };

    let qid = editId;
    if (editId) {
      const r = await supabase.from("quotations").update(payload).eq("id", editId);
      if (r.error) { toast.error(r.error.message); return; }
      await supabase.from("quotation_items").delete().eq("quotation_id", editId);
    } else {
      const r = await supabase.from("quotations").insert(payload).select("id").single();
      if (r.error) { toast.error(r.error.message); return; }
      qid = r.data!.id;
    }

    const linesPayload = valid.map((l, i) => ({
      quotation_id: qid,
      catalogue_item_id: l.catalogue_item_id, item_id: l.item_id,
      name: l.name, description: l.description,
      quantity: Number(l.quantity), unit_price: Number(l.unit_price),
      line_total: (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
      sort_order: i,
    }));
    const r2 = await supabase.from("quotation_items").insert(linesPayload);
    if (r2.error) { toast.error(r2.error.message); return; }
    toast.success(editId ? "Quotation updated" : "Quotation created");
    setOpen(false); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this quotation?")) return;
    const r = await supabase.from("quotations").delete().eq("id", id);
    if (r.error) { toast.error(r.error.message); return; }
    toast.success("Deleted"); load();
  };

  const printQuote = async (q: Quotation) => {
    const { data } = await supabase.from("quotation_items").select("*").eq("quotation_id", q.id).order("sort_order");
    const items = (data ?? []) as any[];
    const esc = (s: any) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const rowsHtml = items.map(l => `<tr>
      <td>${esc(l.name)}${l.description ? `<div style="color:#64748b;font-size:10px">${esc(l.description)}</div>` : ""}</td>
      <td style="text-align:right">${Number(l.quantity)}</td>
      <td style="text-align:right">${formatPHP(l.unit_price)}</td>
      <td style="text-align:right">${formatPHP(l.line_total)}</td>
    </tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Quotation ${esc(q.quote_no)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a;background:#f3f4f6}
  .page{width:210mm;min-height:297mm;margin:16px auto;padding:18mm;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.08)}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f172a;padding-bottom:14px}
  h1{margin:0;font-size:28px;letter-spacing:1px;text-transform:uppercase}
  .meta{text-align:right;font-size:11px;color:#475569}
  .meta strong{color:#0f172a}
  .row{display:flex;justify-content:space-between;margin-top:16px;gap:24px}
  .col{flex:1}
  .label{text-transform:uppercase;font-size:10px;color:#64748b;letter-spacing:.5px;margin-bottom:4px}
  table{width:100%;border-collapse:collapse;margin-top:18px}
  th,td{padding:8px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:11px;vertical-align:top}
  th{background:#0f172a;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
  .totals{margin-top:10px;margin-left:auto;width:280px;font-size:12px}
  .totals div{display:flex;justify-content:space-between;padding:4px 0}
  .totals .grand{border-top:2px solid #0f172a;font-weight:700;font-size:14px;padding-top:6px;margin-top:6px}
  .notes{margin-top:22px;font-size:11px;color:#475569;white-space:pre-wrap}
  .actions{position:sticky;top:0;background:#0f172a;color:#fff;padding:8px 12px;display:flex;justify-content:space-between;align-items:center}
  .actions button{background:#fff;color:#0f172a;border:0;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer}
  .actions button+button{margin-left:8px;background:transparent;color:#fff;border:1px solid #fff}
  @media print{.actions{display:none}body{background:#fff}.page{margin:0;box-shadow:none;width:auto;min-height:auto;padding:14mm}}
  @page{size:A4;margin:10mm}
</style></head><body>
<div class="actions"><strong>Quotation ${esc(q.quote_no)}</strong><div><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div></div>
<div class="page">
  <div class="head">
    <div><h1>Quotation</h1><div style="color:#64748b;margin-top:4px">${esc(q.quote_no)}</div></div>
    <div class="meta">
      <div><strong>Issue date:</strong> ${esc(q.issue_date)}</div>
      ${q.valid_until ? `<div><strong>Valid until:</strong> ${esc(q.valid_until)}</div>` : ""}
      <div><strong>Status:</strong> ${esc(q.status.toUpperCase())}</div>
    </div>
  </div>
  <div class="row">
    <div class="col">
      <div class="label">Bill to</div>
      <div style="font-weight:600">${esc(q.customer_name ?? "—")}</div>
      ${q.customer_email ? `<div>${esc(q.customer_email)}</div>` : ""}
      ${q.customer_phone ? `<div>${esc(q.customer_phone)}</div>` : ""}
    </div>
  </div>
  <table>
    <thead><tr><th>Item / Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit price</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rowsHtml || `<tr><td colspan="4" style="text-align:center;color:#94a3b8">No items</td></tr>`}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${formatPHP(q.subtotal)}</span></div>
    ${Number(q.discount) ? `<div><span>Discount</span><span>−${formatPHP(q.discount)}</span></div>` : ""}
    ${Number(q.tax_rate) ? `<div><span>Tax (${Number(q.tax_rate)}%)</span><span>${formatPHP(q.tax_amount)}</span></div>` : ""}
    <div class="grand"><span>Total</span><span>${formatPHP(q.total)}</span></div>
  </div>
  ${q.notes ? `<div class="notes"><div class="label">Notes</div>${esc(q.notes)}</div>` : ""}
  ${q.terms ? `<div class="notes"><div class="label">Terms &amp; conditions</div>${esc(q.terms)}</div>` : ""}
</div>
<script>setTimeout(function(){try{window.focus();window.print();}catch(e){}},350);</script>
</body></html>`;
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
    if (!w) { const blob = new Blob([html], { type: "text/html" }); window.open(URL.createObjectURL(blob), "_blank"); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter(x => {
      if (statusFilter !== "__all__" && x.status !== statusFilter) return false;
      if (!q) return true;
      return [x.quote_no, x.customer_name, x.customer_email, x.notes].some(v => (v ?? "").toLowerCase().includes(q));
    });
  }, [quotes, search, statusFilter]);

  return (
    <div className="space-y-4">
      <PageHeader title="Quotations" description="Build quotes from catalogue or inventory, set tax & discount, and print." />

      <Card><CardContent className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search quote #, customer…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />New quote</Button></DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editId ? "Edit quotation" : "New quotation"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label>Customer</Label>
                    <Select value={customerId || "__none__"} onValueChange={v => v === "__none__" ? setCustomerId("") : pickCustomer(v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— None / manual —</SelectItem>
                        {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Customer name</Label><Input value={custName} onChange={e => setCustName(e.target.value)} /></div>
                  <div><Label>Status</Label>
                    <Select value={status} onValueChange={v => setStatus(v as QStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="accepted">Accepted</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Email</Label><Input value={custEmail} onChange={e => setCustEmail(e.target.value)} /></div>
                  <div><Label>Phone</Label><Input value={custPhone} onChange={e => setCustPhone(e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Issue date</Label><Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></div>
                    <div><Label>Valid until</Label><Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} /></div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {/* LEFT: Added items list */}
                  <div className="lg:col-span-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Line items ({lines.filter(l => l.name.trim()).length})</Label>
                      <Button type="button" size="sm" variant="outline" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" />Blank row</Button>
                    </div>
                    {lines.length === 0 ? (
                      <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
                        Search items on the right to add them here.
                      </CardContent></Card>
                    ) : lines.map((l, i) => (
                      <Card key={i}><CardContent className="p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {l.source === "catalogue" ? <><Boxes className="h-3 w-3 mr-1" />Catalogue</> :
                             l.source === "inventory" ? <><Package className="h-3 w-3 mr-1" />Inventory</> :
                             <><FileText className="h-3 w-3 mr-1" />Custom</>}
                          </Badge>
                          <div className="flex-1 text-xs text-muted-foreground truncate">#{i + 1}</div>
                          <Button type="button" size="icon" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-6"><Label className="text-xs">Name</Label><Input value={l.name} onChange={e => updateLine(i, { name: e.target.value })} /></div>
                          <div className="col-span-2"><Label className="text-xs">Qty</Label><Input type="number" step="0.01" value={l.quantity} onChange={e => updateLine(i, { quantity: Number(e.target.value) })} /></div>
                          <div className="col-span-2"><Label className="text-xs">Unit price</Label><Input type="number" step="0.01" value={l.unit_price} onChange={e => updateLine(i, { unit_price: Number(e.target.value) })} /></div>
                          <div className="col-span-2"><Label className="text-xs">Total</Label><Input value={formatPHP((Number(l.quantity) || 0) * (Number(l.unit_price) || 0))} readOnly /></div>
                          <div className="col-span-12"><Label className="text-xs">Description</Label><Textarea rows={1} value={l.description ?? ""} onChange={e => updateLine(i, { description: e.target.value })} /></div>
                        </div>
                      </CardContent></Card>
                    ))}
                  </div>

                  {/* RIGHT: Search panel */}
                  <div className="lg:col-span-1">
                    <Card className="lg:sticky lg:top-2"><CardContent className="p-3 space-y-2">
                      <Label>Add item</Label>
                      <ItemSearchPanel
                        cats={cats}
                        invs={invs}
                        onAddCatalogue={(c) => setLines(ls => [...ls, {
                          source: "catalogue", catalogue_item_id: c.id, item_id: null,
                          name: c.name, description: c.description,
                          quantity: 1, unit_price: Number(c.unit_price) || 0,
                          line_total: Number(c.unit_price) || 0, sort_order: ls.length,
                        }])}
                        onAddInventory={(it) => setLines(ls => [...ls, {
                          source: "inventory", catalogue_item_id: null, item_id: it.id,
                          name: it.name, description: null,
                          quantity: 1, unit_price: Number(it.unit_price) || 0,
                          line_total: Number(it.unit_price) || 0, sort_order: ls.length,
                        }])}
                        onAddCustom={() => setLines(ls => [...ls, emptyLine(ls.length)])}
                      />
                    </CardContent></Card>
                  </div>
                </div>


                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
                    <div><Label>Terms &amp; conditions</Label><Textarea rows={2} value={terms} onChange={e => setTerms(e.target.value)} /></div>
                  </div>
                  <Card><CardContent className="p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span>Subtotal</span><span>{formatPHP(subtotal)}</span></div>
                    <div className="flex justify-between items-center gap-2"><span>Discount</span>
                      <Input className="w-32 h-8" type="number" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} />
                    </div>
                    <div className="flex justify-between items-center gap-2"><span>Tax rate (%)</span>
                      <Input className="w-32 h-8" type="number" step="0.01" value={taxRate} onChange={e => setTaxRate(e.target.value)} />
                    </div>
                    <div className="flex justify-between"><span>Tax amount</span><span>{formatPHP(taxAmt)}</span></div>
                    <div className="flex justify-between border-t pt-2 font-bold text-base"><span>Total</span><span>{formatPHP(total)}</span></div>
                  </CardContent></Card>
                </div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save quotation</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Quote #</TableHead><TableHead>Customer</TableHead>
            <TableHead>Issue</TableHead><TableHead>Valid until</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No quotations.</TableCell></TableRow>
            ) : filtered.map(q => (
              <TableRow key={q.id}>
                <TableCell className="font-mono text-xs">{q.quote_no}</TableCell>
                <TableCell>{q.customer_name ?? "—"}</TableCell>
                <TableCell className="text-xs">{q.issue_date}</TableCell>
                <TableCell className="text-xs">{q.valid_until ?? "—"}</TableCell>
                <TableCell className="text-right font-medium">{formatPHP(q.total)}</TableCell>
                <TableCell><Badge className={statusColor[q.status]}>{q.status}</Badge></TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button size="icon" variant="ghost" onClick={() => printQuote(q)}><Printer className="h-4 w-4" /></Button>
                  {canManage && <>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(q)}>Edit</Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(q.id)}><Trash2 className="h-4 w-4" /></Button>
                  </>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
};

// Right-side search panel: pick from catalogue / inventory, or add custom
const ItemSearchPanel = ({ cats, invs, onAddCatalogue, onAddInventory, onAddCustom }: {
  cats: Cat[]; invs: Inv[];
  onAddCatalogue: (c: Cat) => void;
  onAddInventory: (it: Inv) => void;
  onAddCustom: () => void;
}) => {
  const [tab, setTab] = useState<"catalogue" | "inventory">("catalogue");
  const [q, setQ] = useState("");
  const filteredCats = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cats;
    return cats.filter(c => [c.name, c.sku, c.description].some(v => (v ?? "").toLowerCase().includes(s)));
  }, [cats, q]);
  const filteredInvs = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return invs;
    return invs.filter(i => [i.name, i.sku].some(v => (v ?? "").toLowerCase().includes(s)));
  }, [invs, q]);

  return (
    <div className="space-y-2">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="w-full h-8">
          <TabsTrigger value="catalogue" className="flex-1 h-7 text-xs"><Boxes className="h-3 w-3 mr-1" />Catalogue</TabsTrigger>
          <TabsTrigger value="inventory" className="flex-1 h-7 text-xs"><Package className="h-3 w-3 mr-1" />Inventory</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8 h-9" placeholder={`Search ${tab}…`} value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="max-h-[420px] overflow-y-auto border rounded-md divide-y">
        {tab === "catalogue" ? (
          filteredCats.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">No catalogue items.</div>
          ) : filteredCats.map(c => (
            <button key={c.id} type="button" onClick={() => onAddCatalogue(c)}
              className="w-full text-left p-2 hover:bg-accent transition flex items-start gap-2">
              <Plus className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground truncate">{c.sku ?? "—"} · {formatPHP(c.unit_price)}</div>
              </div>
            </button>
          ))
        ) : (
          filteredInvs.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">No inventory items.</div>
          ) : filteredInvs.map(it => (
            <button key={it.id} type="button" onClick={() => onAddInventory(it)}
              className="w-full text-left p-2 hover:bg-accent transition flex items-start gap-2">
              <Plus className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{it.name}</div>
                <div className="text-xs text-muted-foreground truncate">{it.sku} · {formatPHP(it.unit_price ?? 0)}</div>
              </div>
            </button>
          ))
        )}
      </div>
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={onAddCustom}>
        <FileText className="h-3.5 w-3.5 mr-1" />Add custom line
      </Button>
    </div>
  );
};

// Local searchable picker
const SourcePicker = ({ placeholder, options, value, onChange }: {
  placeholder: string;
  options: { id: string; label: string; sub?: string }[];
  value: string;
  onChange: (id: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const sel = options.find(o => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal h-9">
          {sel ? <span className="truncate">{sel.label}</span> : <span className="text-muted-foreground flex items-center gap-2"><Search className="h-3.5 w-3.5" />{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map(o => (
                <CommandItem key={o.id} value={`${o.label} ${o.sub ?? ""}`} onSelect={() => { onChange(o.id); setOpen(false); }}>
                  <div className="flex flex-col">
                    <span>{o.label}</span>
                    {o.sub && <span className="text-xs text-muted-foreground">{o.sub}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default Quotations;
