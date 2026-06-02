import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Printer, Trash2, Receipt, UserPlus, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ItemPicker } from "@/components/ItemPicker";
import { printReceipt } from "@/lib/receipt";

interface Customer { id: string; name: string; email: string|null; phone: string|null; address: string|null; notes: string|null; is_active: boolean }
type SaleStatus = "draft" | "confirmed" | "paid" | "cancelled";
interface Sale { id: string; invoice_no: string; customer_id: string|null; warehouse_id: string; sale_date: string; subtotal: number; tax: number; discount: number; total: number; status: SaleStatus; notes: string|null; created_at: string; created_by: string }
interface SaleItem { id: string; sale_id: string; item_id: string; quantity: number; unit_price: number; line_total: number }

const statusBadge = (s: SaleStatus) =>
  s === "paid" ? "bg-success/20 text-success"
  : s === "confirmed" ? "bg-primary/20 text-primary"
  : s === "cancelled" ? "bg-destructive/20 text-destructive"
  : "bg-muted text-muted-foreground";

const newInvoiceNo = () => `INV-${new Date().getFullYear()}${(new Date().getMonth()+1).toString().padStart(2,"0")}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

const Sales = () => {
  const { user, hasRole } = useAuth();
  const canManage = hasRole("admin", "manager", "staff");
  const canDelete = hasRole("admin");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [warehouses, setWarehouses] = useState<{id:string;name:string}[]>([]);
  const [items, setItems] = useState<{id:string;name:string;sku:string;unit_price:number}[]>([]);

  const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const custMap = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);
  const whMap = useMemo(() => new Map(warehouses.map(w => [w.id, w.name])), [warehouses]);
  const lineMap = useMemo(() => {
    const m = new Map<string, SaleItem[]>();
    saleItems.forEach(l => { const arr = m.get(l.sale_id) ?? []; arr.push(l); m.set(l.sale_id, arr); });
    return m;
  }, [saleItems]);

  // Customer form
  const [custOpen, setCustOpen] = useState(false);
  const [cName, setCName] = useState(""); const [cEmail, setCEmail] = useState(""); const [cPhone, setCPhone] = useState(""); const [cAddress, setCAddress] = useState("");

  // Sale form
  const [saleOpen, setSaleOpen] = useState(false);
  const [sCustomer, setSCustomer] = useState<string>("");
  const [sWh, setSWh] = useState<string>("");
  const [sLines, setSLines] = useState<Array<{ item_id: string; quantity: number; unit_price: number }>>([{ item_id: "", quantity: 1, unit_price: 0 }]);
  const [sTax, setSTax] = useState<number>(0);
  const [sDiscount, setSDiscount] = useState<number>(0);
  const [sNotes, setSNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [c, s, si, w, it] = await Promise.all([
      supabase.from("customers").select("*").order("name"),
      supabase.from("sales").select("*").order("created_at", { ascending: false }),
      supabase.from("sale_items").select("*"),
      supabase.from("warehouses").select("id,name").eq("is_active", true),
      supabase.from("items").select("id,name,sku,unit_price").eq("is_active", true).order("name"),
    ]);
    setCustomers((c.data ?? []) as Customer[]);
    setSales((s.data ?? []) as Sale[]);
    setSaleItems((si.data ?? []) as SaleItem[]);
    setWarehouses(w.data ?? []);
    setItems((it.data ?? []) as any);
  };
  useEffect(() => { load(); }, []);

  const subtotal = useMemo(() => sLines.reduce((a, l) => a + (Number(l.quantity)||0) * (Number(l.unit_price)||0), 0), [sLines]);
  const total = useMemo(() => Math.max(0, subtotal + Number(sTax || 0) - Number(sDiscount || 0)), [subtotal, sTax, sDiscount]);

  const submitCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim()) return toast.error("Name required");
    const { error } = await supabase.from("customers").insert({
      name: cName.trim(), email: cEmail.trim() || null, phone: cPhone.trim() || null, address: cAddress.trim() || null, created_by: user!.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Customer added"); setCustOpen(false);
    setCName(""); setCEmail(""); setCPhone(""); setCAddress(""); load();
  };

  const submitSale = async () => {
    if (!sWh) return toast.error("Warehouse required");
    const valid = sLines.filter(l => l.item_id && l.quantity > 0);
    if (valid.length === 0) return toast.error("Add at least one line");
    setSaving(true);
    const invoice_no = newInvoiceNo();
    const { data: sale, error } = await supabase.from("sales").insert({
      invoice_no, customer_id: sCustomer || null, warehouse_id: sWh,
      subtotal, tax: Number(sTax)||0, discount: Number(sDiscount)||0, total,
      status: "draft", notes: sNotes.trim() || null, created_by: user!.id,
    }).select().single();
    if (error || !sale) { setSaving(false); return toast.error(error?.message ?? "Failed"); }
    const lines = valid.map(l => ({
      sale_id: sale.id, item_id: l.item_id, quantity: l.quantity,
      unit_price: l.unit_price, line_total: (l.quantity * l.unit_price),
    }));
    const { error: e2 } = await supabase.from("sale_items").insert(lines);
    setSaving(false);
    if (e2) return toast.error(e2.message);
    toast.success(`Sale ${invoice_no} drafted`);
    setSaleOpen(false);
    setSCustomer(""); setSWh(""); setSLines([{ item_id: "", quantity: 1, unit_price: 0 }]); setSTax(0); setSDiscount(0); setSNotes("");
    load();
  };

  const setStatus = async (s: Sale, status: SaleStatus) => {
    const { error } = await supabase.from("sales").update({ status }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success(`Sale ${s.invoice_no} → ${status}`);
    load();
  };

  const removeSale = async (s: Sale) => {
    if (!confirm(`Delete sale ${s.invoice_no}? Stock movements (if any) are not auto-reversed.`)) return;
    const { error } = await supabase.from("sales").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  };

  const removeCustomer = async (c: Customer) => {
    if (!confirm(`Delete ${c.name}?`)) return;
    const { error } = await supabase.from("customers").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  };

  const printInvoice = (s: Sale) => {
    const lines = lineMap.get(s.id) ?? [];
    const cust = s.customer_id ? custMap.get(s.customer_id) : null;
    printReceipt({
      kind: "movement",
      receiptNo: s.invoice_no,
      title: "Sales invoice",
      subtitle: `Status: ${s.status.toUpperCase()}`,
      date: s.created_at,
      fields: [
        { label: "Customer", value: cust?.name ?? "Walk-in" },
        { label: "Email", value: cust?.email ?? "—" },
        { label: "Phone", value: cust?.phone ?? "—" },
        { label: "Warehouse", value: whMap.get(s.warehouse_id) ?? "—" },
        { label: "Subtotal", value: `₱${Number(s.subtotal).toFixed(2)}` },
        { label: "Tax", value: `₱${Number(s.tax).toFixed(2)}` },
        { label: "Discount", value: `₱${Number(s.discount).toFixed(2)}` },
        { label: "Total", value: `₱${Number(s.total).toFixed(2)}` },
        { label: "Notes", value: s.notes ?? "—", full: true },
      ],
      lineItems: lines.map(l => {
        const it = itemMap.get(l.item_id);
        return { name: it?.name ?? "Item", sku: it?.sku, qty: l.quantity, note: `₱${Number(l.unit_price).toFixed(2)} ea · ₱${Number(l.line_total).toFixed(2)}` };
      }),
      signatures: ["Issued by", "Received by"],
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Sales" description="Customers, invoices, and stock-out automation." />

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales"><Receipt className="mr-1 h-3.5 w-3.5" />Sales ({sales.length})</TabsTrigger>
          <TabsTrigger value="customers"><UserPlus className="mr-1 h-3.5 w-3.5" />Customers ({customers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-3">
          <Card className="glass-card"><CardContent className="space-y-3 p-4">
            <div className="flex justify-end">
              {canManage && (
                <Dialog open={saleOpen} onOpenChange={setSaleOpen}>
                  <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New sale</Button></DialogTrigger>
                  <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>New sale</DialogTitle><DialogDescription>Draft now, confirm to deduct stock.</DialogDescription></DialogHeader>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Customer</Label>
                          <Select value={sCustomer} onValueChange={setSCustomer}>
                            <SelectTrigger><SelectValue placeholder="Walk-in / select…" /></SelectTrigger>
                            <SelectContent>{customers.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Warehouse *</Label>
                          <Select value={sWh} onValueChange={setSWh}>
                            <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                            <SelectContent>{warehouses.map(w => (<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}</SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label>Line items *</Label>
                          <Button type="button" size="sm" variant="outline" onClick={() => setSLines(p => [...p, { item_id:"", quantity:1, unit_price:0 }])}><Plus className="mr-1 h-3.5 w-3.5" />Add line</Button>
                        </div>
                        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                          {sLines.map((l, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 rounded border border-border/60 p-2">
                              <div className="col-span-6">
                                <ItemPicker value={l.item_id} onChange={(id) => {
                                  const it = items.find(x => x.id === id);
                                  setSLines(p => p.map((x,i) => i===idx?{...x, item_id:id, unit_price: it?.unit_price ?? x.unit_price }:x));
                                }} warehouseId={sWh || undefined} />
                              </div>
                              <div className="col-span-2"><Input type="number" min={1} value={l.quantity} onChange={(e) => setSLines(p => p.map((x,i)=>i===idx?{...x,quantity:Math.max(1,Number(e.target.value)||1)}:x))} placeholder="Qty" /></div>
                              <div className="col-span-3"><Input type="number" step="0.01" value={l.unit_price} onChange={(e) => setSLines(p => p.map((x,i)=>i===idx?{...x,unit_price:Number(e.target.value)||0}:x))} placeholder="Unit ₱" /></div>
                              <div className="col-span-1 flex items-start justify-end">
                                <Button type="button" size="icon" variant="ghost" disabled={sLines.length===1} onClick={() => setSLines(p => p.filter((_,i)=>i!==idx))}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5"><Label>Tax ₱</Label><Input type="number" step="0.01" value={sTax} onChange={(e) => setSTax(Number(e.target.value)||0)} /></div>
                        <div className="space-y-1.5"><Label>Discount ₱</Label><Input type="number" step="0.01" value={sDiscount} onChange={(e) => setSDiscount(Number(e.target.value)||0)} /></div>
                        <div className="space-y-1.5"><Label>Total</Label><Input readOnly value={`₱${total.toFixed(2)}`} /></div>
                      </div>
                      <div className="space-y-1.5"><Label>Notes</Label><Input value={sNotes} onChange={(e) => setSNotes(e.target.value)} maxLength={300} /></div>
                      <div className="text-xs text-muted-foreground">Subtotal ₱{subtotal.toFixed(2)} · Total ₱{total.toFixed(2)}</div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setSaleOpen(false)}>Cancel</Button>
                      <Button onClick={submitSale} disabled={saving}>{saving ? "Saving…" : "Save as draft"}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead>
                <TableHead>Warehouse</TableHead><TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {sales.map(s => {
                  const cust = s.customer_id ? custMap.get(s.customer_id) : null;
                  const lines = lineMap.get(s.id) ?? [];
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.invoice_no}</TableCell>
                      <TableCell className="text-xs">{new Date(s.sale_date).toLocaleDateString()}</TableCell>
                      <TableCell>{cust?.name ?? <span className="text-muted-foreground">Walk-in</span>}</TableCell>
                      <TableCell className="text-xs">{whMap.get(s.warehouse_id) ?? "—"}</TableCell>
                      <TableCell className="text-right">{lines.length}</TableCell>
                      <TableCell className="text-right font-medium">₱{Number(s.total).toFixed(2)}</TableCell>
                      <TableCell><Badge className={statusBadge(s.status)}>{s.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canManage && s.status === "draft" && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-success" onClick={() => setStatus(s, "confirmed")} title="Confirm & deduct stock"><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-destructive" onClick={() => setStatus(s, "cancelled")}><XCircle className="h-3.5 w-3.5" /></Button>
                            </>
                          )}
                          {canManage && s.status === "confirmed" && (
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setStatus(s, "paid")}>Mark paid</Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => printInvoice(s)}><Printer className="h-3.5 w-3.5" /></Button>
                          {canDelete && (
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeSale(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {sales.length === 0 && (<TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No sales yet.</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="customers" className="space-y-3">
          <Card className="glass-card"><CardContent className="space-y-3 p-4">
            <div className="flex justify-end">
              {canManage && (
                <Dialog open={custOpen} onOpenChange={setCustOpen}>
                  <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New customer</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
                    <form onSubmit={submitCustomer} className="space-y-3">
                      <div className="space-y-1.5"><Label>Name *</Label><Input value={cName} onChange={(e)=>setCName(e.target.value)} required /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={cEmail} onChange={(e)=>setCEmail(e.target.value)} /></div>
                        <div className="space-y-1.5"><Label>Phone</Label><Input value={cPhone} onChange={(e)=>setCPhone(e.target.value)} /></div>
                      </div>
                      <div className="space-y-1.5"><Label>Address</Label><Input value={cAddress} onChange={(e)=>setCAddress(e.target.value)} /></div>
                      <DialogFooter><Button type="submit">Create</Button></DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Address</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {customers.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-xs">{c.email ?? "—"}</TableCell>
                    <TableCell className="text-xs">{c.phone ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.address ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {canDelete && (<Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeCustomer(c)}><Trash2 className="h-3.5 w-3.5" /></Button>)}
                    </TableCell>
                  </TableRow>
                ))}
                {customers.length === 0 && (<TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No customers yet.</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
export default Sales;
