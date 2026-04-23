import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDownToLine, ArrowUpDown, Download, Plus, Search, PackagePlus } from "lucide-react";
import { toast } from "sonner";

type SortField = "name" | "sku" | "stock" | "unit_price" | "created_at";
type SortDir = "asc" | "desc";

interface Item {
  id: string; sku: string; name: string; description: string | null;
  category_id: string | null; unit_price: number; cost_price: number; reorder_level: number;
  is_active: boolean; created_at: string;
}
interface Category { id: string; name: string; sku_prefix: string }
interface Warehouse { id: string; name: string }
interface StockRow { item_id: string; warehouse_id: string; quantity: number }

const Items = () => {
  const { user, hasRole } = useAuth();
  const canEdit = hasRole("admin", "manager");
  const canWithdraw = hasRole("admin", "manager", "staff");
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Item[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [stockByWh, setStockByWh] = useState<Map<string, StockRow[]>>(new Map());
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [withdrawItem, setWithdrawItem] = useState<Item | null>(null);
  const [withdrawWh, setWithdrawWh] = useState<string>("");
  const [withdrawQty, setWithdrawQty] = useState<string>("1");
  const [withdrawReason, setWithdrawReason] = useState<string>("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addItemId, setAddItemId] = useState<string>("");
  const [addWh, setAddWh] = useState<string>("");
  const [addQty, setAddQty] = useState<string>("1");
  const [addReason, setAddReason] = useState<string>("");
  const [requesting, setRequesting] = useState(false);

  const load = async () => {
    const [{ data: its }, { data: lvls }, { data: cats }, { data: whs }] = await Promise.all([
      supabase.from("items").select("*"),
      supabase.from("stock_levels").select("item_id, warehouse_id, quantity"),
      supabase.from("categories").select("id, name, sku_prefix"),
      supabase.from("warehouses").select("id, name").eq("is_active", true).order("name"),
    ]);
    setItems((its ?? []) as Item[]);
    const m = new Map<string, number>();
    const byWh = new Map<string, StockRow[]>();
    (lvls ?? []).forEach((l: any) => {
      m.set(l.item_id, (m.get(l.item_id) ?? 0) + l.quantity);
      const arr = byWh.get(l.item_id) ?? [];
      arr.push(l as StockRow);
      byWh.set(l.item_id, arr);
    });
    setStockMap(m);
    setStockByWh(byWh);
    setCategories((cats ?? []) as Category[]);
    setWarehouses((whs ?? []) as Warehouse[]);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setSearch(params.get("q") ?? ""); }, [params]);

  const stockFor = (itemId: string) => {
    if (warehouseFilter === "all") return stockMap.get(itemId) ?? 0;
    return (stockByWh.get(itemId) ?? []).find((r) => r.warehouse_id === warehouseFilter)?.quantity ?? 0;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items.filter((it) => {
      const matchQ = !q || it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q);
      const matchCat = categoryFilter === "all" || it.category_id === categoryFilter;
      return matchQ && matchCat;
    });
    list = [...list].sort((a, b) => {
      let av: any = a[sortField as keyof Item]; let bv: any = b[sortField as keyof Item];
      if (sortField === "stock") { av = stockFor(a.id); bv = stockFor(b.id); }
      if (typeof av === "string") { av = av.toLowerCase(); bv = (bv as string).toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [items, search, categoryFilter, warehouseFilter, sortField, sortDir, stockMap, stockByWh]);

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("asc"); }
  };

  const exportCsv = () => {
    const headers = ["SKU", "Name", "Category", "Stock", "Unit price", "Cost price", "Reorder level"];
    const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "";
    const rows = filtered.map((it) => [
      it.sku, it.name, catName(it.category_id), stockMap.get(it.id) ?? 0, it.unit_price, it.cost_price, it.reorder_level,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "items.csv"; a.click();
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || null,
      category_id: String(fd.get("category_id") ?? "") || null,
      unit_price: Number(fd.get("unit_price") ?? 0),
      cost_price: Number(fd.get("cost_price") ?? 0),
      reorder_level: Number(fd.get("reorder_level") ?? 0),
      barcode: String(fd.get("barcode") ?? "").trim() || null,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    };
    if (!payload.name) return toast.error("Name required");
    setSaving(true);
    const { error } = await supabase.from("items").insert(payload as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Item created — SKU auto-generated");
    setOpen(false); load();
  };

  const openAdd = (it?: Item) => {
    setAddItemId(it?.id ?? "");
    setAddWh(warehouses[0]?.id ?? "");
    setAddQty("1");
    setAddReason("");
    setAddOpen(true);
  };

  const submitAdd = async () => {
    if (!addItemId) return toast.error("Select an item");
    const qty = Number(addQty);
    if (!addWh) return toast.error("Select a warehouse");
    if (!qty || qty <= 0) return toast.error("Enter a positive quantity");
    if (!user?.id) return toast.error("Not signed in");
    setRequesting(true);
    const { error } = await supabase.from("stock_requests").insert({
      item_id: addItemId,
      warehouse_id: addWh,
      quantity: qty,
      reason: addReason.trim() || null,
      requested_by: user.id,
    });
    setRequesting(false);
    if (error) return toast.error(error.message);
    toast.success("Request submitted — pending approval");
    setAddOpen(false);
  };

  const openWithdraw = (it: Item) => {
    setWithdrawItem(it);
    const rows = stockByWh.get(it.id) ?? [];
    const firstWithStock = rows.find((r) => r.quantity > 0);
    setWithdrawWh(firstWithStock?.warehouse_id ?? rows[0]?.warehouse_id ?? "");
    setWithdrawQty("1");
    setWithdrawReason("");
  };

  const submitWithdraw = async () => {
    if (!withdrawItem) return;
    const qty = Number(withdrawQty);
    if (!withdrawWh) return toast.error("Select a warehouse");
    if (!qty || qty <= 0) return toast.error("Enter a positive quantity");
    const available = (stockByWh.get(withdrawItem.id) ?? []).find((r) => r.warehouse_id === withdrawWh)?.quantity ?? 0;
    if (qty > available) return toast.error(`Only ${available} available in this warehouse`);
    setWithdrawing(true);
    const { error } = await supabase.from("stock_movements").insert({
      item_id: withdrawItem.id,
      movement_type: "out",
      quantity: qty,
      from_warehouse_id: withdrawWh,
      to_warehouse_id: null,
      reason: withdrawReason.trim() || "Withdrawal",
      reference: null,
      created_by: user?.id,
    });
    setWithdrawing(false);
    if (error) return toast.error(error.message);
    toast.success(`Withdrew ${qty} × ${withdrawItem.name}`);
    setWithdrawItem(null);
    load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Items"
        description="Manage your inventory catalog. SKUs are generated automatically."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export</Button>
            <Button variant="outline" onClick={() => openAdd()}><PackagePlus className="mr-2 h-4 w-4" />Add stock</Button>
            {canEdit && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" />New item</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create item</DialogTitle>
                    <DialogDescription>SKU auto-generated from category prefix.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreate} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Name</Label>
                      <Input name="name" required maxLength={200} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <Select name="category_id">
                        <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.sku_prefix})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1.5">
                        <Label>Unit price</Label>
                        <Input name="unit_price" type="number" step="0.01" defaultValue="0" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Cost</Label>
                        <Input name="cost_price" type="number" step="0.01" defaultValue="0" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Reorder at</Label>
                        <Input name="reorder_level" type="number" defaultValue="0" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Barcode (optional)</Label>
                      <Input name="barcode" maxLength={100} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description</Label>
                      <Textarea name="description" maxLength={1000} />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </>
        }
      />

      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name or SKU…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); if (e.target.value) setParams({ q: e.target.value }); else setParams({}); }}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All warehouses (overall)</SelectItem>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortBtn label="SKU" field="sku" current={sortField} dir={sortDir} onClick={toggleSort} /></TableHead>
                <TableHead><SortBtn label="Name" field="name" current={sortField} dir={sortDir} onClick={toggleSort} /></TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right"><SortBtn label="Stock" field="stock" current={sortField} dir={sortDir} onClick={toggleSort} /></TableHead>
                <TableHead className="text-right"><SortBtn label="Price" field="unit_price" current={sortField} dir={sortDir} onClick={toggleSort} /></TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((it) => {
                const stock = stockMap.get(it.id) ?? 0;
                const low = it.reorder_level > 0 && stock <= it.reorder_level;
                const cat = categories.find((c) => c.id === it.category_id);
                return (
                  <TableRow key={it.id}>
                    <TableCell className="font-mono text-xs">{it.sku}</TableCell>
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell>{cat ? <Badge variant="outline">{cat.name}</Badge> : "—"}</TableCell>
                    <TableCell className="text-right">{stock}</TableCell>
                    <TableCell className="text-right">₱{Number(it.unit_price).toFixed(2)}</TableCell>
                    <TableCell>
                      {low ? <Badge variant="destructive">Low</Badge> : <Badge variant="outline" className="border-primary/50 text-primary">OK</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canWithdraw && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={stock <= 0}
                            onClick={() => openWithdraw(it)}
                          >
                            <ArrowDownToLine className="mr-1 h-3.5 w-3.5" />Withdraw
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No items found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!withdrawItem} onOpenChange={(o) => !o && setWithdrawItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw stock</DialogTitle>
            <DialogDescription>
              {withdrawItem ? <>Item: <span className="font-medium">{withdrawItem.name}</span> <span className="font-mono text-xs text-muted-foreground">({withdrawItem.sku})</span></> : null}
            </DialogDescription>
          </DialogHeader>
          {withdrawItem && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>From warehouse</Label>
                <Select value={withdrawWh} onValueChange={setWithdrawWh}>
                  <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => {
                      const q = (stockByWh.get(withdrawItem.id) ?? []).find((r) => r.warehouse_id === w.id)?.quantity ?? 0;
                      return <SelectItem key={w.id} value={w.id} disabled={q <= 0}>{w.name} — {q} on hand</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" min="1" value={withdrawQty} onChange={(e) => setWithdrawQty(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Reason (optional)</Label>
                <Input value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)} placeholder="Sale, damage, internal use…" maxLength={200} />
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                Estimated value: <span className="font-medium text-foreground">₱{(Number(withdrawItem.unit_price) * (Number(withdrawQty) || 0)).toFixed(2)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawItem(null)}>Cancel</Button>
            <Button onClick={submitWithdraw} disabled={withdrawing}>
              {withdrawing ? "Withdrawing…" : "Confirm withdrawal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request stock addition</DialogTitle>
            <DialogDescription>
              Requires admin or manager approval before stock is added.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Item</Label>
              <Select value={addItemId} onValueChange={setAddItemId}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {items.map((it) => (
                    <SelectItem key={it.id} value={it.id}>
                      {it.name} <span className="ml-1 font-mono text-xs text-muted-foreground">({it.sku})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Warehouse</Label>
              <Select value={addWh} onValueChange={setAddWh}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => {
                    const q = addItemId ? ((stockByWh.get(addItemId) ?? []).find((r) => r.warehouse_id === w.id)?.quantity ?? 0) : 0;
                    return <SelectItem key={w.id} value={w.id}>{w.name}{addItemId ? ` — ${q} on hand` : ""}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity to add</Label>
              <Input type="number" min="1" value={addQty} onChange={(e) => setAddQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Reason / source (optional)</Label>
              <Input value={addReason} onChange={(e) => setAddReason(e.target.value)} placeholder="Restock, supplier delivery…" maxLength={200} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitAdd} disabled={requesting}>
              {requesting ? "Submitting…" : "Submit for approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SortBtn = ({ label, field, current, dir, onClick }: { label: string; field: SortField; current: SortField; dir: SortDir; onClick: (f: SortField) => void }) => (
  <button className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground" onClick={() => onClick(field)}>
    {label}
    <ArrowUpDown className={`h-3 w-3 ${current === field ? "text-primary" : ""}`} />
    {current === field && <span className="text-[10px]">{dir === "asc" ? "↑" : "↓"}</span>}
  </button>
);

export default Items;
