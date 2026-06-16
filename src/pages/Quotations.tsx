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
import { Plus, Trash2, Search, Printer, FileText, Package, Boxes, Eye } from "lucide-react";
import { toast } from "sonner";
import { formatPHP } from "@/lib/currency";

type QStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

interface Quotation {
  id: string; quote_no: string;
  customer_id: string | null; customer_name: string | null;
  customer_email: string | null; customer_phone: string | null;
  issue_date: string; valid_until: string | null;
  status: QStatus;
  subtotal: number; discount: number; tax_rate: number; tax_amount: number;
  others: number; total: number;
  notes: string | null; terms: string | null;
  created_at: string;
}
interface QLine {
  id?: string; quotation_id?: string;
  source: "catalogue" | "inventory" | "custom";
  catalogue_item_id: string | null;
  item_id: string | null;
  name: string; description: string | null; model?: string | null;
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
  name: "", description: "", model: "", quantity: 1, unit_price: 0, line_total: 0, sort_order: sort,
});

// ---------- Print template (stored in localStorage) ----------
interface PrintTemplate {
  company_name: string;
  street_address: string;
  city_zip: string;
  phone: string;
  prepared: string;
  accent_color: string;
  min_rows: number;
  others_label: string;
  contact_footer: string;
  closing: string;
  default_terms: string;
}
const TEMPLATE_KEY = "quote_print_template_v1";
const defaultTemplate: PrintTemplate = {
  company_name: "ZIMMONS INDUSTRIES",
  street_address: "STREET ADDRESS",
  city_zip: "CITY, ST, ZIP",
  phone: "PHONE",
  prepared: "PREPARED",
  accent_color: "#4472C4",
  min_rows: 20,
  others_label: "Others",
  contact_footer: "if you have any questions about this price quote, please contact\nJulios G. Laurente, 099956207983, Julioslaurente09@gmail.com",
  closing: "Thank You For Your Business!",
  default_terms: "1\n2\n3\n4",
};
const loadTemplate = (): PrintTemplate => {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    if (!raw) return defaultTemplate;
    return { ...defaultTemplate, ...JSON.parse(raw) };
  } catch { return defaultTemplate; }
};

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
  const [taxRate, setTaxRate] = useState("12");
  const [others, setOthers] = useState("0");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<QLine[]>([emptyLine(0)]);

  const [template, setTemplate] = useState<PrintTemplate>(loadTemplate());

  const load = async () => {
    const [q, c, ci, it] = await Promise.all([
      supabase.from("quotations").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id,name,email,phone").eq("is_active", true).order("name"),
      supabase.from("catalogue_items").select("id,name,sku,unit_price,description").eq("is_active", true).eq("is_visible", true).order("name"),
      supabase.from("items").select("id,name,sku,unit_price").eq("is_active", true).order("name"),
    ]);
    if (q.data) setQuotes(q.data as any);
    if (c.data) setCustomers(c.data as Customer[]);
    if (ci.data) setCats(ci.data as Cat[]);
    if (it.data) setInvs(it.data as Inv[]);
  };
  useEffect(() => { load(); }, []);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0), [lines]);
  const discNum = Number(discount) || 0;
  const taxBase = Math.max(0, subtotal - discNum);
  const taxAmt = taxBase * ((Number(taxRate) || 0) / 100);
  const othersNum = Number(others) || 0;
  const total = taxBase + taxAmt + othersNum;

  const resetForm = () => {
    setEditId(null); setCustomerId(""); setCustName(""); setCustEmail(""); setCustPhone("");
    setIssueDate(new Date().toISOString().slice(0, 10)); setValidUntil(""); setStatus("draft");
    setDiscount("0"); setTaxRate("12"); setOthers("0");
    setNotes(""); setTerms(template.default_terms);
    setLines([emptyLine(0)]);
  };

  const openNew = () => { resetForm(); setOpen(true); };

  const openEdit = async (q: Quotation) => {
    setEditId(q.id);
    setCustomerId(q.customer_id ?? ""); setCustName(q.customer_name ?? "");
    setCustEmail(q.customer_email ?? ""); setCustPhone(q.customer_phone ?? "");
    setIssueDate(q.issue_date); setValidUntil(q.valid_until ?? ""); setStatus(q.status);
    setDiscount(String(q.discount)); setTaxRate(String(q.tax_rate));
    setOthers(String(q.others ?? 0));
    setNotes(q.notes ?? ""); setTerms(q.terms ?? "");
    const { data } = await supabase.from("quotation_items").select("*").eq("quotation_id", q.id).order("sort_order");
    setLines(((data ?? []) as any[]).map((d, i) => ({
      id: d.id, quotation_id: d.quotation_id,
      source: d.catalogue_item_id ? "catalogue" : d.item_id ? "inventory" : "custom",
      catalogue_item_id: d.catalogue_item_id, item_id: d.item_id,
      name: d.name, description: d.description, model: "",
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
      tax_amount: taxAmt, others: othersNum, total,
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
    const html = buildPrintHTML(q, items, template);
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
    if (!w) { const blob = new Blob([html], { type: "text/html" }); window.open(URL.createObjectURL(blob), "_blank"); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  const previewTemplate = () => {
    const sample: Quotation = {
      id: "preview", quote_no: "Q-PREVIEW",
      customer_id: null, customer_name: "Sample Customer",
      customer_email: "sample@example.com", customer_phone: "0917-000-0000",
      issue_date: new Date().toISOString().slice(0, 10),
      valid_until: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
      status: "draft",
      subtotal: 2000, discount: 0, tax_rate: 12, tax_amount: 240,
      others: 5000, total: 7240,
      notes: null, terms: template.default_terms, created_at: "",
    };
    const sampleItems = [
      { name: "Item 1", description: "", quantity: 1, unit_price: 100, line_total: 100 },
      { name: "Item 2", description: "Sample description", quantity: 2, unit_price: 50, line_total: 100 },
    ];
    const html = buildPrintHTML(sample, sampleItems, template);
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
  };

  const saveTemplate = () => {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(template));
    toast.success("Print template saved");
  };
  const resetTemplate = () => {
    setTemplate(defaultTemplate);
    localStorage.removeItem(TEMPLATE_KEY);
    toast.success("Reset to defaults");
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

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Quotations</TabsTrigger>
          <TabsTrigger value="template">Print template</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4 mt-4">
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
                <DialogContent className="max-w-[1400px] w-[95vw] max-h-[92vh] overflow-y-auto">
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

                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
                      <div className="xl:col-span-3 space-y-2">
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
                              <div className="col-span-4"><Label className="text-xs">Name</Label><Input value={l.name} onChange={e => updateLine(i, { name: e.target.value })} /></div>
                              <div className="col-span-1"><Label className="text-xs">Qty</Label><Input type="number" step="0.01" value={l.quantity} onChange={e => updateLine(i, { quantity: Number(e.target.value) })} /></div>
                              <div className="col-span-2"><Label className="text-xs">Unit price</Label><Input type="number" step="0.01" value={l.unit_price} onChange={e => updateLine(i, { unit_price: Number(e.target.value) })} /></div>
                              <div className="col-span-2"><Label className="text-xs">Total</Label><Input value={formatPHP((Number(l.quantity) || 0) * (Number(l.unit_price) || 0))} readOnly /></div>
                              <div className="col-span-3"><Label className="text-xs">Description</Label><Textarea rows={1} value={l.description ?? ""} onChange={e => updateLine(i, { description: e.target.value })} /></div>
                            </div>
                          </CardContent></Card>
                        ))}
                      </div>

                      <div className="xl:col-span-1">
                        <Card className="xl:sticky xl:top-2"><CardContent className="p-3 space-y-2">
                          <Label>Add item</Label>
                          <ItemSearchPanel
                            cats={cats}
                            invs={invs}
                            onAddCatalogue={(c) => setLines(ls => {
                              const idx = ls.findIndex(x => x.source === "catalogue" && x.catalogue_item_id === c.id);
                              if (idx >= 0) return ls.map((x, k) => k === idx ? { ...x, quantity: (Number(x.quantity) || 0) + 1 } : x);
                              return [...ls, {
                                source: "catalogue", catalogue_item_id: c.id, item_id: null,
                                name: c.name, description: c.description, model: "",
                                quantity: 1, unit_price: Number(c.unit_price) || 0,
                                line_total: Number(c.unit_price) || 0, sort_order: ls.length,
                              }];
                            })}
                            onAddInventory={(it) => setLines(ls => {
                              const idx = ls.findIndex(x => x.source === "inventory" && x.item_id === it.id);
                              if (idx >= 0) return ls.map((x, k) => k === idx ? { ...x, quantity: (Number(x.quantity) || 0) + 1 } : x);
                              return [...ls, {
                                source: "inventory", catalogue_item_id: null, item_id: it.id,
                                name: it.name, description: null, model: "",
                                quantity: 1, unit_price: Number(it.unit_price) || 0,
                                line_total: Number(it.unit_price) || 0, sort_order: ls.length,
                              }];
                            })}
                            onAddCustom={() => setLines(ls => [...ls, emptyLine(ls.length)])}
                          />
                        </CardContent></Card>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
                        <div><Label>Terms &amp; conditions</Label><Textarea rows={3} value={terms} onChange={e => setTerms(e.target.value)} /></div>
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
                        <div className="flex justify-between items-center gap-2"><span>{template.others_label}</span>
                          <Input className="w-32 h-8" type="number" step="0.01" value={others} onChange={e => setOthers(e.target.value)} />
                        </div>
                        <div className="flex justify-between border-t pt-2 font-bold text-base"><span>Grand total</span><span>{formatPHP(total)}</span></div>
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
        </TabsContent>

        <TabsContent value="template" className="mt-4">
          <Card><CardContent className="p-5 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-semibold">Printable quote layout</h3>
                <p className="text-xs text-muted-foreground">These values appear on every printed/exported quotation.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={previewTemplate}><Eye className="h-4 w-4 mr-1" />Preview</Button>
                <Button variant="outline" onClick={resetTemplate}>Reset</Button>
                <Button onClick={saveTemplate}>Save template</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Company name</Label>
                <Input value={template.company_name} onChange={e => setTemplate(t => ({ ...t, company_name: e.target.value }))} /></div>
              <div><Label>Accent color</Label>
                <div className="flex gap-2">
                  <Input type="color" className="w-16 h-10 p-1" value={template.accent_color} onChange={e => setTemplate(t => ({ ...t, accent_color: e.target.value }))} />
                  <Input value={template.accent_color} onChange={e => setTemplate(t => ({ ...t, accent_color: e.target.value }))} />
                </div>
              </div>
              <div><Label>Street address</Label>
                <Input value={template.street_address} onChange={e => setTemplate(t => ({ ...t, street_address: e.target.value }))} /></div>
              <div><Label>City, ST, ZIP</Label>
                <Input value={template.city_zip} onChange={e => setTemplate(t => ({ ...t, city_zip: e.target.value }))} /></div>
              <div><Label>Phone</Label>
                <Input value={template.phone} onChange={e => setTemplate(t => ({ ...t, phone: e.target.value }))} /></div>
              <div><Label>Prepared by</Label>
                <Input value={template.prepared} onChange={e => setTemplate(t => ({ ...t, prepared: e.target.value }))} /></div>
              <div><Label>Minimum item rows</Label>
                <Input type="number" min={1} max={50} value={template.min_rows} onChange={e => setTemplate(t => ({ ...t, min_rows: Number(e.target.value) || 1 }))} /></div>
              <div><Label>"Others" label</Label>
                <Input value={template.others_label} onChange={e => setTemplate(t => ({ ...t, others_label: e.target.value }))} /></div>
              <div className="md:col-span-2"><Label>Default terms &amp; conditions</Label>
                <Textarea rows={4} value={template.default_terms} onChange={e => setTemplate(t => ({ ...t, default_terms: e.target.value }))} /></div>
              <div className="md:col-span-2"><Label>Footer contact line</Label>
                <Textarea rows={2} value={template.contact_footer} onChange={e => setTemplate(t => ({ ...t, contact_footer: e.target.value }))} /></div>
              <div className="md:col-span-2"><Label>Closing line</Label>
                <Input value={template.closing} onChange={e => setTemplate(t => ({ ...t, closing: e.target.value }))} /></div>
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ===== Print HTML builder (matches the Zimmons-style reference) =====
function buildPrintHTML(q: Quotation, items: any[], t: PrintTemplate): string {
  const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const nl2br = (s: string) => esc(s).replace(/\n/g, "<br/>");
  const accent = t.accent_color || "#4472C4";
  const accentSoft = accent + "22";
  const taxRate = Number(q.tax_rate) || 0;
  const others = Number(q.others ?? 0);
  const minRows = Math.max(items.length, t.min_rows || 20);
  const padded: any[] = [...items];
  while (padded.length < minRows) padded.push(null);
  const rowsHtml = padded.map((l, i) => {
    if (!l) return `<tr><td class="num">${i + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
    const lineTax = (Number(l.line_total) || 0) * (taxRate / 100);
    const amount = (Number(l.line_total) || 0) + lineTax;
    return `<tr>
      <td class="num">${i + 1}</td>
      <td>${esc(l.name)}${l.description ? `<div class="sub">${esc(l.description)}</div>` : ""}</td>
      <td>${esc(l.model ?? "")}</td>
      <td class="r">${Number(l.unit_price).toFixed(2)}</td>
      <td class="r">${Number(l.quantity)}</td>
      <td class="r">${taxRate ? Number(taxRate).toFixed(0) : ""}</td>
      <td class="r">${amount.toFixed(2)}</td>
    </tr>`;
  }).join("");

  const termsLines = (q.terms ?? "").split("\n");
  const termsHtml = termsLines.map((line, i) =>
    `<tr><td class="t-num">${i + 1}</td><td>${esc(line)}</td></tr>`
  ).join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Quote ${esc(q.quote_no)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font:11px/1.35 Arial,Helvetica,sans-serif;color:#000;background:#e5e7eb}
  .actions{position:sticky;top:0;background:${accent};color:#fff;padding:8px 14px;display:flex;justify-content:space-between;align-items:center;z-index:10}
  .actions button{background:#fff;color:${accent};border:0;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer}
  .actions button+button{margin-left:8px;background:transparent;color:#fff;border:1px solid #fff}
  .page{width:210mm;min-height:297mm;margin:16px auto;padding:14mm;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.08)}
  .top{display:grid;grid-template-columns:1.4fr 1fr;gap:24px;align-items:start}
  .brand{color:${accent};font-size:22px;font-weight:700;letter-spacing:1px}
  .brandLines div{font-size:11px;color:#222;margin-top:2px}
  .quoteTitle{color:${accent};font-size:34px;font-weight:700;text-align:right;letter-spacing:2px}
  .meta{margin-top:8px;border-collapse:collapse;margin-left:auto}
  .meta td{padding:3px 6px;font-size:11px}
  .meta .lbl{text-align:right;font-weight:700;color:#222}
  .meta .val{border:1px solid #9aa0a6;min-width:110px;background:#fff}
  .custBar{margin-top:14px;background:${accent};color:#fff;padding:5px 8px;font-weight:700;letter-spacing:.5px}
  .custBox{border:1px solid #cfd2d6;border-top:0;padding:6px 8px}
  .custBox div{padding:2px 0;border-bottom:1px dotted #cfd2d6;font-size:11px}
  .custBox div:last-child{border-bottom:0}
  table.items{width:100%;border-collapse:collapse;margin-top:14px;table-layout:fixed}
  table.items th{background:${accentSoft};color:#0b1b3a;border:1px solid #9aa0a6;padding:5px 4px;font-size:11px;text-transform:uppercase;letter-spacing:.3px}
  table.items td{border:1px solid #cfd2d6;padding:4px 6px;font-size:11px;vertical-align:top;height:18px}
  table.items .r{text-align:right}
  table.items .num{text-align:center;width:32px}
  table.items col.c-item{width:32px}
  table.items col.c-desc{width:34%}
  table.items col.c-model{width:18%}
  table.items col.c-price{width:11%}
  table.items col.c-qty{width:8%}
  table.items col.c-tax{width:8%}
  table.items col.c-amt{width:13%}
  .sub{color:#475569;font-size:10px;margin-top:1px}
  .bottom{display:grid;grid-template-columns:1.1fr 1fr;gap:14px;margin-top:8px}
  .terms .tHead{background:${accent};color:#fff;text-align:center;font-weight:700;padding:5px;border:1px solid ${accent}}
  .terms table{width:100%;border-collapse:collapse;border:1px solid #cfd2d6;border-top:0}
  .terms td{padding:4px 6px;border-bottom:1px dotted #cfd2d6;font-size:11px;height:18px}
  .terms .t-num{width:24px;color:${accent};font-weight:700;text-align:center}
  .totals{border-collapse:collapse;width:100%;margin-left:auto}
  .totals td{border:1px solid #9aa0a6;padding:5px 8px;font-size:11px}
  .totals .lbl{background:${accentSoft};font-weight:700;text-align:right;width:55%}
  .totals .val{text-align:right;background:#fff}
  .totals .grand .lbl,.totals .grand .val{font-weight:700;background:${accent};color:#fff}
  .footer{margin-top:18px;text-align:center;color:#7a1f1f;font-size:11px;line-height:1.5}
  .closing{margin-top:6px;font-weight:700;color:#000}
  @media print{.actions{display:none}body{background:#fff}.page{margin:0;box-shadow:none;width:auto;min-height:auto;padding:10mm}}
  @page{size:A4;margin:8mm}
</style></head><body>
<div class="actions"><strong>Quote ${esc(q.quote_no)}</strong><div><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div></div>
<div class="page">
  <div class="top">
    <div>
      <div class="brand">${esc(t.company_name)}</div>
      <div class="brandLines">
        <div>${esc(t.street_address)}</div>
        <div>${esc(t.city_zip)}</div>
        <div>${esc(t.phone)}</div>
        <div>${esc(t.prepared)}</div>
      </div>
    </div>
    <div>
      <div class="quoteTitle">QUOTE</div>
      <table class="meta">
        <tr><td class="lbl">DATE:</td><td class="val">${esc(q.issue_date)}</td></tr>
        <tr><td class="lbl">QUOTE NO:</td><td class="val">${esc(q.quote_no)}</td></tr>
        <tr><td class="lbl">CUSTOMER ID:</td><td class="val">${esc(q.customer_id ?? "")}</td></tr>
        <tr><td class="lbl">VALID UNTIL:</td><td class="val">${esc(q.valid_until ?? "")}</td></tr>
      </table>
    </div>
  </div>

  <div class="custBar">CUSTOMER</div>
  <div class="custBox">
    <div><b>NAME</b> &nbsp; ${esc(q.customer_name ?? "")}</div>
    <div><b>EMAIL</b> &nbsp; ${esc(q.customer_email ?? "")}</div>
    <div><b>PHONE</b> &nbsp; ${esc(q.customer_phone ?? "")}</div>
  </div>

  <table class="items">
    <colgroup>
      <col class="c-item"/><col class="c-desc"/><col class="c-model"/>
      <col class="c-price"/><col class="c-qty"/><col class="c-tax"/><col class="c-amt"/>
    </colgroup>
    <thead><tr>
      <th>ITEM</th><th>DESCRIPTION</th><th>MODEL</th>
      <th>UNIT PRICE</th><th>QTY</th><th>TAX</th><th>AMOUNT</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="bottom">
    <div class="terms">
      <div class="tHead">TERMS AND CONDITION</div>
      <table>${termsHtml || `<tr><td class="t-num">1</td><td></td></tr>`}</table>
    </div>
    <table class="totals">
      <tr><td class="lbl">Subtotal</td><td class="val">${formatPHP(q.subtotal)}</td></tr>
      ${Number(q.discount) ? `<tr><td class="lbl">Discount</td><td class="val">−${formatPHP(q.discount)}</td></tr>` : ""}
      <tr><td class="lbl">Taxable</td><td class="val">${formatPHP(Math.max(0, Number(q.subtotal) - Number(q.discount || 0)))}</td></tr>
      <tr><td class="lbl">Tax rate</td><td class="val">${taxRate}%</td></tr>
      <tr><td class="lbl">Tax due</td><td class="val">${formatPHP(q.tax_amount)}</td></tr>
      ${others ? `<tr><td class="lbl">${esc(t.others_label)}</td><td class="val">${formatPHP(others)}</td></tr>` : ""}
      <tr class="grand"><td class="lbl">Grand Total</td><td class="val">${formatPHP(q.total)}</td></tr>
    </table>
  </div>

  <div class="footer">
    ${nl2br(t.contact_footer)}
    <div class="closing">${esc(t.closing)}</div>
  </div>
</div>
<script>setTimeout(function(){try{window.focus();}catch(e){}},250);</script>
</body></html>`;
}

// Right-side search panel
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

export default Quotations;
