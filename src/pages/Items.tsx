import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowDownToLine, ArrowUpDown, Download, Plus, Search, PackagePlus, Trash2, Pencil, ArrowLeftRight, ClipboardCheck, Undo2, History as HistoryIcon, PackageMinus, Copy, Layers } from "lucide-react";
import { toast } from "sonner";
import { ItemPicker } from "@/components/ItemPicker";
import { MultiLineItems, LineItem, emptyLine, newBatchRef } from "@/components/MultiLineItems";
import { FilterBar, FilterValues, EMPTY_FILTERS, matchesQuery } from "@/components/FilterBar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type SortField = "name" | "sku" | "stock" | "unit_price" | "created_at";
type SortDir = "asc" | "desc";

interface Item {
  id: string; sku: string; name: string; description: string | null;
  category_id: string | null; unit_price: number; cost_price: number; reorder_level: number;
  is_active: boolean; created_at: string; updated_at?: string | null;
  ref_number: string | null; source: string | null; initial_quantity: number | null;
  uom: string | null; coding: string | null; remarks: string | null;
  barcode?: string | null; image_url?: string | null; created_by?: string | null;
}
interface Category { id: string; name: string; sku_prefix: string }
interface Warehouse { id: string; name: string }
interface StockRow { item_id: string; warehouse_id: string; quantity: number }

const Items = () => {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const canEdit = hasRole("admin", "manager");
  const canWithdraw = hasRole("admin", "manager", "staff");
  const canDelete = hasRole("admin");
  const [params, setParams] = useSearchParams();
  const [itemHistory, setItemHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [stockByWh, setStockByWh] = useState<Map<string, StockRow[]>>(new Map());
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState<FilterValues>({ ...EMPTY_FILTERS, q: params.get("q") ?? "" });
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicateFrom, setDuplicateFrom] = useState<Item | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchCat, setBatchCat] = useState<string>("");
  const [batchRows, setBatchRows] = useState<Array<{ name: string; ref_number: string; uom: string; unit_price: number; cost_price: number; initial_quantity: number; reorder_level: number }>>([
    { name: "", ref_number: "", uom: "", unit_price: 0, cost_price: 0, initial_quantity: 0, reorder_level: 0 },
  ]);
  const [batchSaving, setBatchSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addLines, setAddLines] = useState<LineItem[]>([emptyLine()]);
  const [addWh, setAddWh] = useState<string>("");
  const [addReason, setAddReason] = useState<string>("");
  const [requesting, setRequesting] = useState(false);
  const [toDelete, setToDelete] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [editing, setEditing] = useState(false);
  const [detail, setDetail] = useState<Item | null>(null);
  const [createCat, setCreateCat] = useState<string>("");
  const [catComboOpen, setCatComboOpen] = useState(false);
  const [createWh, setCreateWh] = useState<string>("");

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("items").delete().eq("id", toDelete.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${toDelete.name}`);
    setToDelete(null);
    load();
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editItem) return;
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || null,
      category_id: String(fd.get("category_id") ?? "") || null,
      unit_price: Number(fd.get("unit_price") ?? 0),
      cost_price: Number(fd.get("cost_price") ?? 0),
      reorder_level: Number(fd.get("reorder_level") ?? 0),
      is_active: String(fd.get("is_active") ?? "true") === "true",
      ref_number: String(fd.get("ref_number") ?? "").trim() || null,
      source: String(fd.get("source") ?? "").trim() || null,
      initial_quantity: fd.get("initial_quantity") ? Number(fd.get("initial_quantity")) : null,
      uom: String(fd.get("uom") ?? "").trim() || null,
      coding: String(fd.get("coding") ?? "").trim() || null,
      remarks: String(fd.get("remarks") ?? "").trim() || null,
    };
    if (!payload.name) return toast.error("Name required");
    setEditing(true);
    const { error } = await supabase.from("items").update(payload).eq("id", editItem.id);
    setEditing(false);
    if (error) return toast.error(error.message);
    toast.success("Item updated");
    setEditItem(null);
    load();
  };

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
  useEffect(() => { setFilters((f) => ({ ...f, q: params.get("q") ?? "" })); }, [params]);

  useEffect(() => {
    const id = detail?.id;
    if (!id) { setItemHistory([]); return; }
    (async () => {
      setLoadingHistory(true);
      const [mv, wd, rq, rt] = await Promise.all([
        supabase.from("stock_movements").select("*").eq("item_id", id).order("created_at", { ascending: false }).limit(100),
        supabase.from("withdrawals").select("*").eq("item_id", id).order("created_at", { ascending: false }).limit(100),
        supabase.from("stock_requests").select("*").eq("item_id", id).order("created_at", { ascending: false }).limit(100),
        supabase.from("returns").select("*").eq("item_id", id).order("created_at", { ascending: false }).limit(100),
      ]);
      const list: any[] = [];
      (mv.data ?? []).forEach((x: any) => list.push({ kind: x.movement_type === "transfer" ? "transfer" : (x.movement_type === "in" ? "stock_in" : "stock_out"), date: x.created_at, qty: x.quantity, note: x.reason, ref: x.reference, raw: x }));
      (wd.data ?? []).forEach((x: any) => list.push({ kind: "withdrawal", date: x.created_at, qty: x.quantity, note: x.purpose, status: x.status, raw: x }));
      (rq.data ?? []).forEach((x: any) => list.push({ kind: "request", date: x.created_at, qty: x.quantity, note: x.reason, status: x.status, raw: x }));
      (rt.data ?? []).forEach((x: any) => list.push({ kind: "return", date: x.created_at, qty: x.quantity, note: x.notes, status: x.status, raw: x }));
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setItemHistory(list);
      setLoadingHistory(false);
    })();
  }, [detail?.id]);

  const stockFor = (itemId: string) => {
    if (filters.warehouse === "all") return stockMap.get(itemId) ?? 0;
    return (stockByWh.get(itemId) ?? []).find((r) => r.warehouse_id === filters.warehouse)?.quantity ?? 0;
  };

  const filtered = useMemo(() => {
    let list = items.filter((it) => {
      if (!matchesQuery(filters.q, [it.name, it.sku, it.ref_number, it.coding, (it as any).barcode])) return false;
      if (filters.category !== "all" && it.category_id !== filters.category) return false;
      if (filters.status === "active" && !it.is_active) return false;
      if (filters.status === "inactive" && it.is_active) return false;
      if (filters.status === "low") {
        const overall = stockMap.get(it.id) ?? 0;
        if (!(it.reorder_level > 0 && overall <= it.reorder_level)) return false;
      }
      if (filters.status === "zero") {
        const here = filters.warehouse !== "all"
          ? ((stockByWh.get(it.id) ?? []).find((r) => r.warehouse_id === filters.warehouse)?.quantity ?? 0)
          : (stockMap.get(it.id) ?? 0);
        if (here !== 0) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      let av: any = a[sortField as keyof Item]; let bv: any = b[sortField as keyof Item];
      if (sortField === "stock") { av = stockFor(a.id); bv = stockFor(b.id); }
      if (typeof av === "string") { av = av.toLowerCase(); bv = (bv as string).toLowerCase(); }
      if (av == null) av = "";
      if (bv == null) bv = "";
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [items, filters, sortField, sortDir, stockMap, stockByWh]);

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("asc"); }
  };

  const exportCsv = () => {
    const headers = [
      "SKU", "Name", "Category", "Status", "Ref number", "Coding", "Barcode",
      "Source", "UOM", "Initial qty", "Unit price", "Cost price", "Reorder level",
      "Total stock", "Total value", "Description", "Remarks", "Created", "Updated",
      ...warehouses.map((w) => `Stock @ ${w.name}`),
    ];
    const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "";
    const rows = filtered.map((it) => {
      const total = stockMap.get(it.id) ?? 0;
      const perWh = warehouses.map((w) =>
        (stockByWh.get(it.id) ?? []).find((r) => r.warehouse_id === w.id)?.quantity ?? 0
      );
      return [
        it.sku, it.name, catName(it.category_id), it.is_active ? "Active" : "Inactive",
        it.ref_number ?? "", it.coding ?? "", (it as any).barcode ?? "",
        it.source ?? "", it.uom ?? "", it.initial_quantity ?? "",
        it.unit_price, it.cost_price, it.reorder_level,
        total, (Number(it.unit_price) * total).toFixed(2),
        (it.description ?? "").replace(/\n/g, " "), (it.remarks ?? "").replace(/\n/g, " "),
        new Date(it.created_at).toLocaleString(),
        it.updated_at ? new Date(it.updated_at).toLocaleString() : "",
        ...perWh,
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "items.csv"; a.click();
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const initialQty = fd.get("initial_quantity") ? Number(fd.get("initial_quantity")) : null;
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || null,
      category_id: createCat || null,
      unit_price: Number(fd.get("unit_price") ?? 0),
      cost_price: Number(fd.get("cost_price") ?? 0),
      reorder_level: Number(fd.get("reorder_level") ?? 0),
      barcode: String(fd.get("barcode") ?? "").trim() || null,
      ref_number: String(fd.get("ref_number") ?? "").trim() || null,
      source: String(fd.get("source") ?? "").trim() || null,
      initial_quantity: initialQty,
      uom: String(fd.get("uom") ?? "").trim() || null,
      coding: String(fd.get("coding") ?? "").trim() || null,
      remarks: String(fd.get("remarks") ?? "").trim() || null,
      created_by: user?.id,
    };
    if (!payload.name) return toast.error("Name required");
    if (initialQty && initialQty > 0 && !createWh) return toast.error("Pick a warehouse for the initial quantity");
    setSaving(true);
    const { data: created, error } = await supabase.from("items").insert(payload as any).select().single();
    if (error || !created) { setSaving(false); return toast.error(error?.message ?? "Failed"); }
    if (initialQty && initialQty > 0 && createWh && user?.id) {
      const { error: mErr } = await supabase.from("stock_movements").insert({
        item_id: created.id, movement_type: "in", quantity: initialQty,
        to_warehouse_id: createWh, reason: "Initial quantity",
        reference: `ITEM-INIT:${created.id}`, created_by: user.id,
        status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString(),
      } as any);
      if (mErr) toast.error(`Item created but initial stock failed: ${mErr.message}`);
    }
    setSaving(false);
    toast.success(`Item created${initialQty && initialQty > 0 ? ` with ${initialQty} units in stock` : ""} — SKU auto-generated`);
    setCreateCat(""); setCreateWh("");
    setOpen(false); load();
  };

  const openAdd = (it?: Item) => {
    setAddLines([{ ...emptyLine(), item_id: it?.id ?? "" }]);
    setAddWh(warehouses[0]?.id ?? "");
    setAddReason("");
    setAddOpen(true);
  };

  const submitAdd = async () => {
    if (!addWh) return toast.error("Select a warehouse");
    if (!user?.id) return toast.error("Not signed in");
    const valid = addLines.filter((l) => l.item_id && l.quantity > 0);
    if (valid.length === 0) return toast.error("Add at least one item");
    setRequesting(true);
    const batch_ref = valid.length > 1 ? newBatchRef("REQ") : null;
    const payload = valid.map((l) => ({
      item_id: l.item_id,
      warehouse_id: addWh,
      quantity: l.quantity,
      reason: (l.note?.trim() || addReason.trim() || null) as string | null,
      requested_by: user.id,
      batch_ref,
    }));
    const { error } = await supabase.from("stock_requests").insert(payload);
    setRequesting(false);
    if (error) return toast.error(error.message);
    toast.success(`Submitted ${valid.length} request(s) — pending approval`);
    setAddOpen(false);
  };

  const submitBatch = async () => {
    const valid = batchRows.filter((r) => r.name.trim());
    if (valid.length === 0) return toast.error("Add at least one item with a name");
    setBatchSaving(true);
    const payload = valid.map((r) => ({
      name: r.name.trim(),
      category_id: batchCat || null,
      ref_number: r.ref_number.trim() || null,
      uom: r.uom.trim() || null,
      unit_price: Number(r.unit_price) || 0,
      cost_price: Number(r.cost_price) || 0,
      initial_quantity: Number(r.initial_quantity) || null,
      reorder_level: Number(r.reorder_level) || 0,
      created_by: user?.id,
    }));
    const { error } = await supabase.from("items").insert(payload as any);
    setBatchSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Created ${valid.length} item(s)`);
    setBatchOpen(false);
    setBatchRows([{ name: "", ref_number: "", uom: "", unit_price: 0, cost_price: 0, initial_quantity: 0, reorder_level: 0 }]);
    setBatchCat("");
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
              <Button variant="outline" onClick={() => setBatchOpen(true)}>
                <Layers className="mr-2 h-4 w-4" />Batch new
              </Button>
            )}
            {canEdit && (
              <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDuplicateFrom(null); }}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" />New item</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create item</DialogTitle>
                    <DialogDescription>
                      SKU auto-generated from category prefix.
                      {duplicateFrom && <> Prefilled from <span className="font-medium">{duplicateFrom.name}</span>.</>}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="mb-2 rounded-md border border-dashed border-border/60 p-2">
                    <Label className="text-xs text-muted-foreground">Duplicate from existing item</Label>
                    <Popover open={dupOpen} onOpenChange={setDupOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" role="combobox" className="mt-1 w-full justify-between">
                          <span className="flex items-center gap-2 truncate">
                            <Copy className="h-3.5 w-3.5" />
                            {duplicateFrom ? `${duplicateFrom.name} (${duplicateFrom.sku})` : "Search existing item to copy fields…"}
                          </span>
                          <Search className="h-3.5 w-3.5 opacity-60" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[420px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search by name, SKU, ref…" />
                          <CommandList>
                            <CommandEmpty>No items found.</CommandEmpty>
                            <CommandGroup>
                              {items.slice(0, 200).map((it) => (
                                <CommandItem
                                  key={it.id}
                                  value={`${it.name} ${it.sku} ${it.ref_number ?? ""}`}
                                  onSelect={() => { setDuplicateFrom(it); setDupOpen(false); }}
                                >
                                  <div className="flex w-full items-center justify-between gap-2">
                                    <span className="truncate">{it.name}</span>
                                    <span className="font-mono text-[10px] text-muted-foreground">{it.sku}</span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {duplicateFrom && (
                      <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 text-xs" onClick={() => setDuplicateFrom(null)}>Clear</Button>
                    )}
                  </div>

                  <form key={duplicateFrom?.id ?? "new"} onSubmit={handleCreate} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Name</Label>
                      <Input name="name" required maxLength={200} defaultValue={duplicateFrom ? `${duplicateFrom.name} (copy)` : ""} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <Select name="category_id" defaultValue={duplicateFrom?.category_id ?? undefined}>
                        <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.sku_prefix})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1.5">
                        <Label>Unit price</Label>
                        <Input name="unit_price" type="number" step="0.01" defaultValue={duplicateFrom?.unit_price ?? 0} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Cost</Label>
                        <Input name="cost_price" type="number" step="0.01" defaultValue={duplicateFrom?.cost_price ?? 0} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Reorder at</Label>
                        <Input name="reorder_level" type="number" defaultValue={duplicateFrom?.reorder_level ?? 0} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5"><Label>Ref number</Label><Input name="ref_number" maxLength={100} defaultValue={duplicateFrom?.ref_number ?? ""} /></div>
                      <div className="space-y-1.5"><Label>Source</Label><Input name="source" maxLength={200} placeholder="Supplier, donation…" defaultValue={duplicateFrom?.source ?? ""} /></div>
                      <div className="space-y-1.5"><Label>Initial quantity</Label><Input name="initial_quantity" type="number" min="0" defaultValue={duplicateFrom?.initial_quantity ?? ""} /></div>
                      <div className="space-y-1.5"><Label>UOM</Label><Input name="uom" maxLength={20} placeholder="pcs, kg, box…" defaultValue={duplicateFrom?.uom ?? ""} /></div>
                      <div className="space-y-1.5"><Label>Coding</Label><Input name="coding" maxLength={100} defaultValue={duplicateFrom?.coding ?? ""} /></div>
                      <div className="space-y-1.5"><Label>Barcode</Label><Input name="barcode" maxLength={100} defaultValue={(duplicateFrom as any)?.barcode ?? ""} /></div>
                    </div>
                    <div className="space-y-1.5"><Label>Description</Label><Textarea name="description" maxLength={1000} defaultValue={duplicateFrom?.description ?? ""} /></div>
                    <div className="space-y-1.5"><Label>Remarks</Label><Textarea name="remarks" maxLength={1000} defaultValue={duplicateFrom?.remarks ?? ""} /></div>
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
          <div className="mb-4">
            <FilterBar
              values={filters}
              onChange={(next) => {
                setFilters(next);
                if (next.q) setParams({ q: next.q }); else setParams({});
              }}
              searchPlaceholder="Search name, SKU, ref, barcode…"
              show={{ q: true, category: true, warehouse: true, status: true }}
              categories={categories.map((c) => ({ value: c.id, label: c.name }))}
              warehouses={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              statuses={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "low", label: "Low stock" },
                { value: "zero", label: "Zero stock" },
              ]}
              rightSlot={
                <div className="flex items-center gap-1">
                  <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
                    <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Sort by" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="sku">SKU</SelectItem>
                      <SelectItem value="stock">Stock</SelectItem>
                      <SelectItem value="unit_price">Price</SelectItem>
                      <SelectItem value="created_at">Created</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="h-9" onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")} title={sortDir === "asc" ? "Ascending" : "Descending"}>
                    <ArrowUpDown className="mr-1 h-3.5 w-3.5" />{sortDir === "asc" ? "Asc" : "Desc"}
                  </Button>
                </div>
              }
            />
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
                const stock = stockFor(it.id);
                const overall = stockMap.get(it.id) ?? 0;
                const low = it.reorder_level > 0 && overall <= it.reorder_level;
                const cat = categories.find((c) => c.id === it.category_id);
                return (
                  <TableRow key={it.id} onClick={() => setDetail(it)} className="cursor-pointer hover:bg-muted/40">
                    <TableCell className="font-mono text-xs">{it.sku}</TableCell>
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell>{cat ? <Badge variant="outline">{cat.name}</Badge> : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium">{stock}</div>
                      {filters.warehouse !== "all" && (
                        <div className="text-[10px] text-muted-foreground">overall: {overall}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">₱{Number(it.unit_price).toFixed(2)}</TableCell>
                    <TableCell>
                      {low ? <Badge variant="destructive">Low</Badge> : <Badge variant="outline" className="border-primary/50 text-primary">OK</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {canWithdraw && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={stock <= 0}
                            onClick={() => navigate(`/withdrawals?item=${it.id}`)}
                          >
                            <ArrowDownToLine className="mr-1 h-3.5 w-3.5" />Withdraw
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditItem(it)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />Edit
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setToDelete(it)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />Delete
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

      {/* Batch new items dialog */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Batch new items</DialogTitle>
            <DialogDescription>Create many items in one category at once. SKUs auto-generate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={batchCat} onValueChange={setBatchCat}>
                <SelectTrigger><SelectValue placeholder="Choose category…" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.sku_prefix})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[26%]">Name *</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead className="w-[70px]">UOM</TableHead>
                    <TableHead className="w-[90px]">Unit ₱</TableHead>
                    <TableHead className="w-[90px]">Cost ₱</TableHead>
                    <TableHead className="w-[80px]">Init qty</TableHead>
                    <TableHead className="w-[80px]">Reorder</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchRows.map((r, idx) => (
                    <TableRow key={idx}>
                      <TableCell><Input value={r.name} onChange={(e) => setBatchRows(p => p.map((x,i) => i===idx?{...x,name:e.target.value}:x))} placeholder="Item name" /></TableCell>
                      <TableCell><Input value={r.ref_number} onChange={(e) => setBatchRows(p => p.map((x,i) => i===idx?{...x,ref_number:e.target.value}:x))} /></TableCell>
                      <TableCell><Input value={r.uom} onChange={(e) => setBatchRows(p => p.map((x,i) => i===idx?{...x,uom:e.target.value}:x))} /></TableCell>
                      <TableCell><Input type="number" step="0.01" value={r.unit_price} onChange={(e) => setBatchRows(p => p.map((x,i) => i===idx?{...x,unit_price:Number(e.target.value)}:x))} /></TableCell>
                      <TableCell><Input type="number" step="0.01" value={r.cost_price} onChange={(e) => setBatchRows(p => p.map((x,i) => i===idx?{...x,cost_price:Number(e.target.value)}:x))} /></TableCell>
                      <TableCell><Input type="number" min="0" value={r.initial_quantity} onChange={(e) => setBatchRows(p => p.map((x,i) => i===idx?{...x,initial_quantity:Number(e.target.value)}:x))} /></TableCell>
                      <TableCell><Input type="number" min="0" value={r.reorder_level} onChange={(e) => setBatchRows(p => p.map((x,i) => i===idx?{...x,reorder_level:Number(e.target.value)}:x))} /></TableCell>
                      <TableCell>
                        <Button type="button" size="icon" variant="ghost" disabled={batchRows.length===1} onClick={() => setBatchRows(p => p.filter((_,i)=>i!==idx))}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setBatchRows(p => [...p, { name:"", ref_number:"", uom:"", unit_price:0, cost_price:0, initial_quantity:0, reorder_level:0 }])}>
              <Plus className="mr-1 h-3.5 w-3.5" />Add row
            </Button>
            <p className="text-xs text-muted-foreground">{batchRows.filter(r=>r.name.trim()).length} item(s) ready</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>Cancel</Button>
            <Button onClick={submitBatch} disabled={batchSaving}>{batchSaving ? "Creating…" : "Create all"}</Button>
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
              <Label>Warehouse</Label>
              <Select value={addWh} onValueChange={setAddWh}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <MultiLineItems
              value={addLines}
              onChange={setAddLines}
              warehouseId={addWh || undefined}
              showNote
              notePlaceholder="Reason"
              hidePickerWarehouseFilter
            />
            <div className="space-y-1.5">
              <Label>Default reason / source (optional)</Label>
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

      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
            <DialogDescription>
              {editItem ? <>SKU: <span className="font-mono text-xs">{editItem.sku}</span></> : null}
            </DialogDescription>
          </DialogHeader>
          {editItem && (
            <form onSubmit={handleEdit} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input name="name" required maxLength={200} defaultValue={editItem.name} />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select name="category_id" defaultValue={editItem.category_id ?? undefined}>
                  <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.sku_prefix})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label>Unit price</Label>
                  <Input name="unit_price" type="number" step="0.01" defaultValue={editItem.unit_price} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cost</Label>
                  <Input name="cost_price" type="number" step="0.01" defaultValue={editItem.cost_price} />
                </div>
                <div className="space-y-1.5">
                  <Label>Reorder at</Label>
                  <Input name="reorder_level" type="number" defaultValue={editItem.reorder_level} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select name="is_active" defaultValue={editItem.is_active ? "true" : "false"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Ref number</Label>
                  <Input name="ref_number" maxLength={100} defaultValue={editItem.ref_number ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label>Source</Label>
                  <Input name="source" maxLength={200} defaultValue={editItem.source ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label>Initial quantity</Label>
                  <Input name="initial_quantity" type="number" min="0" defaultValue={editItem.initial_quantity ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label>UOM</Label>
                  <Input name="uom" maxLength={20} defaultValue={editItem.uom ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label>Coding</Label>
                  <Input name="coding" maxLength={100} defaultValue={editItem.coding ?? ""} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea name="description" maxLength={1000} defaultValue={editItem.description ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label>Remarks</Label>
                <Textarea name="remarks" maxLength={1000} defaultValue={editItem.remarks ?? ""} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
                <Button type="submit" disabled={editing}>{editing ? "Saving…" : "Save changes"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? <>This permanently deletes <span className="font-medium">{toDelete.name}</span> ({toDelete.sku}). This action cannot be undone.</> : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
            <DialogDescription className="font-mono text-xs">{detail?.sku}</DialogDescription>
          </DialogHeader>
          {detail && (
            <Tabs defaultValue="details">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="actions">Actions</TabsTrigger>
                <TabsTrigger value="history">History ({itemHistory.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-3 text-sm">
                {detail.image_url && (
                  <div className="flex justify-center">
                    <img src={detail.image_url} alt={detail.name} className="max-h-48 rounded border border-border object-contain" />
                  </div>
                )}
                <DRow label="SKU"><span className="font-mono text-xs">{detail.sku}</span></DRow>
                <DRow label="Name">{detail.name}</DRow>
                <DRow label="Category">{categories.find((c) => c.id === detail.category_id)?.name ?? "—"}</DRow>
                <DRow label="Status">{detail.is_active ? <Badge variant="outline" className="border-primary/50 text-primary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</DRow>
                <DRow label="Ref number">{detail.ref_number || "—"}</DRow>
                <DRow label="Coding">{detail.coding || "—"}</DRow>
                <DRow label="Barcode">{detail.barcode || "—"}</DRow>
                <DRow label="Source">{detail.source || "—"}</DRow>
                <DRow label="UOM">{detail.uom || "—"}</DRow>
                <DRow label="Initial quantity">{detail.initial_quantity ?? "—"}</DRow>
                <DRow label="Unit price">₱{Number(detail.unit_price).toFixed(2)}</DRow>
                <DRow label="Cost price">₱{Number(detail.cost_price).toFixed(2)}</DRow>
                <DRow label="Total value">₱{(Number(detail.unit_price) * (stockMap.get(detail.id) ?? 0)).toFixed(2)}</DRow>
                <DRow label="Reorder level">{detail.reorder_level}</DRow>
                <DRow label="Total stock">
                  <span className="font-medium">{stockMap.get(detail.id) ?? 0}</span>
                  {detail.reorder_level > 0 && (stockMap.get(detail.id) ?? 0) <= detail.reorder_level && (
                    <Badge variant="destructive" className="ml-2">Low</Badge>
                  )}
                </DRow>
                <DRow label="Description"><span className="whitespace-pre-wrap">{detail.description || "—"}</span></DRow>
                <DRow label="Remarks"><span className="whitespace-pre-wrap">{detail.remarks || "—"}</span></DRow>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Stock per warehouse</div>
                  <div className="space-y-1">
                    {(stockByWh.get(detail.id) ?? []).length === 0 && <div className="text-xs text-muted-foreground">No stock anywhere.</div>}
                    {(stockByWh.get(detail.id) ?? []).map((r) => (
                      <div key={r.warehouse_id} className="flex items-center justify-between rounded border border-border px-2 py-1">
                        <span>{warehouses.find((w) => w.id === r.warehouse_id)?.name ?? "—"}</span>
                        <span className="font-medium tabular-nums">{r.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <DRow label="Item ID"><span className="font-mono text-[10px] break-all">{detail.id}</span></DRow>
                <DRow label="Created">{new Date(detail.created_at).toLocaleString()}</DRow>
                {detail.updated_at && <DRow label="Updated">{new Date(detail.updated_at).toLocaleString()}</DRow>}
              </TabsContent>

              <TabsContent value="actions">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Button variant="outline" className="justify-start" onClick={() => { const it = detail; setDetail(null); openAdd(it); }}>
                    <PackagePlus className="mr-2 h-4 w-4" />Add stock
                  </Button>
                  {canEdit && (
                    <Button variant="outline" className="justify-start" onClick={() => { const it = detail; setDetail(null); setEditItem(it); }}>
                      <Pencil className="mr-2 h-4 w-4" />Edit
                    </Button>
                  )}
                  <Button variant="outline" className="justify-start" onClick={() => navigate(`/movements?item=${detail.id}&type=transfer`)}>
                    <ArrowLeftRight className="mr-2 h-4 w-4" />Transfer
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => navigate(`/movements?item=${detail.id}`)}>
                    <ArrowUpDown className="mr-2 h-4 w-4" />Movement
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => navigate(`/requests?item=${detail.id}`)}>
                    <ClipboardCheck className="mr-2 h-4 w-4" />Request
                  </Button>
                  {canWithdraw && (
                    <Button
                      variant="outline"
                      className="justify-start"
                      disabled={(stockMap.get(detail.id) ?? 0) <= 0}
                      onClick={() => navigate(`/withdrawals?item=${detail.id}`)}
                    >
                      <ArrowDownToLine className="mr-2 h-4 w-4" />Withdraw
                    </Button>
                  )}
                  <Button variant="outline" className="justify-start" onClick={() => navigate(`/withdrawals?item=${detail.id}&borrow=1`)}>
                    <PackageMinus className="mr-2 h-4 w-4" />Borrow
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => navigate(`/returns?item=${detail.id}`)}>
                    <Undo2 className="mr-2 h-4 w-4" />Return
                  </Button>
                  {canDelete && (
                    <Button variant="outline" className="justify-start text-destructive hover:text-destructive" onClick={() => { const it = detail; setDetail(null); setToDelete(it); }}>
                      <Trash2 className="mr-2 h-4 w-4" />Delete
                    </Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="history">
                <div className="max-h-[420px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>When</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingHistory && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
                      {!loadingHistory && itemHistory.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground"><HistoryIcon className="mx-auto mb-2 h-5 w-5 opacity-50" />No history yet.</TableCell></TableRow>
                      )}
                      {itemHistory.map((h, i) => (
                        <TableRow key={i}>
                          <TableCell><Badge variant="outline" className="capitalize">{h.kind.replace("_"," ")}</Badge></TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{new Date(h.date).toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{h.qty ?? "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs">{h.note ?? "—"}</TableCell>
                          <TableCell>{h.status ? <Badge variant="outline">{h.status}</Badge> : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          )}
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

const DRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-3 border-b border-border/60 py-1.5 last:border-0">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="col-span-2">{children}</div>
  </div>
);

export default Items;
