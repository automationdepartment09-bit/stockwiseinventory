import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { ItemPicker } from "@/components/ItemPicker";
import { FilterBar, FilterValues, EMPTY_FILTERS, matchesQuery } from "@/components/FilterBar";
import { useNavigate } from "react-router-dom";

type Status = "available" | "reserved" | "on_arrival" | "arrived" | "damaged";

const STATUS_LABEL: Record<Status, string> = {
  available: "Available",
  reserved: "Reserved",
  on_arrival: "On arrival",
  arrived: "Arrived",
  damaged: "Damaged",
};

const statusClass = (s: Status) =>
  s === "available" ? "bg-primary/15 text-primary border-primary/30"
  : s === "reserved" ? "bg-secondary text-secondary-foreground"
  : s === "on_arrival" ? "bg-accent text-accent-foreground"
  : s === "arrived" ? "bg-primary/10 text-primary border-primary/20"
  : "bg-destructive/15 text-destructive border-destructive/30";

interface Row {
  id: string;
  item_id: string;
  warehouse_id: string;
  quantity: number;
  status: Status;
}

const Stock = () => {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const canEdit = hasRole("admin", "manager");
  const [rows, setRows] = useState<Row[]>([]);
  const [items, setItems] = useState<{ id: string; name: string; sku: string; category_id: string | null }[]>([]);
  const [whs, setWhs] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);

  // Add-stock request dialog (requires approval)
  const [addOpen, setAddOpen] = useState(false);
  const [aItem, setAItem] = useState("");
  const [aWh, setAWh] = useState("");
  const [aQty, setAQty] = useState<number>(1);
  const [aReason, setAReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Detail dialog
  const [detail, setDetail] = useState<Row | null>(null);
  const [moves, setMoves] = useState<any[]>([]);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const whMap = useMemo(() => new Map(whs.map((w) => [w.id, w.name])), [whs]);

  const load = async () => {
    const [{ data: lvls }, { data: its }, { data: w }, { data: cats }] = await Promise.all([
      supabase.from("stock_levels").select("id,item_id,warehouse_id,quantity,status"),
      supabase.from("items").select("id,name,sku,category_id").eq("is_active", true).order("name"),
      supabase.from("warehouses").select("id,name").eq("is_active", true).order("name"),
      supabase.from("categories").select("id,name").order("name"),
    ]);
    setRows((lvls ?? []) as Row[]);
    setItems((its ?? []) as any);
    setWhs(w ?? []);
    setCategories(cats ?? []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const it = itemMap.get(r.item_id);
      if (!matchesQuery(filters.q, [it?.name, it?.sku])) return false;
      if (filters.status !== "all" && r.status !== filters.status) return false;
      if (filters.warehouse !== "all" && r.warehouse_id !== filters.warehouse) return false;
      if (filters.category !== "all" && (it as any)?.category_id !== filters.category) return false;
      return true;
    });
  }, [rows, itemMap, filters]);

  const updateStatus = async (id: string, status: Status) => {
    const { error } = await supabase.from("stock_levels").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status updated");
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const openDetail = async (r: Row) => {
    setDetail(r);
    setMoves([]);
    const { data } = await supabase
      .from("stock_movements")
      .select("id,movement_type,quantity,reason,reference,created_at,from_warehouse_id,to_warehouse_id")
      .eq("item_id", r.item_id)
      .or(`from_warehouse_id.eq.${r.warehouse_id},to_warehouse_id.eq.${r.warehouse_id}`)
      .order("created_at", { ascending: false })
      .limit(25);
    setMoves(data ?? []);
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aItem || !aWh || aQty <= 0) return toast.error("Item, warehouse and quantity required");
    setSubmitting(true);
    const { error } = await supabase.from("stock_requests").insert({
      item_id: aItem,
      warehouse_id: aWh,
      quantity: aQty,
      reason: aReason.trim() || "Add stock",
      requested_by: user!.id,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Add-stock request submitted for approval");
    setAddOpen(false);
    setAItem(""); setAWh(""); setAQty(1); setAReason("");
    navigate("/requests");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock"
        description="Per-warehouse stock with status."
        actions={canEdit && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Add stock</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request to add stock</DialogTitle>
                <DialogDescription>Submitted as a stock request — requires manager approval before stock is updated.</DialogDescription>
              </DialogHeader>
              <form onSubmit={submitAdd} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Warehouse *</Label>
                  <Select value={aWh} onValueChange={setAWh}>
                    <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                    <SelectContent>{whs.map((w) => (<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Item *</Label>
                  <ItemPicker value={aItem} onChange={setAItem} warehouseId={aWh || undefined} showWarehouseFilter={false} />
                </div>
                <div className="space-y-1.5">
                  <Label>Quantity *</Label>
                  <Input type="number" min={1} value={aQty} onChange={(e) => setAQty(Number(e.target.value))} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Reason / Reference</Label>
                  <Input value={aReason} onChange={(e) => setAReason(e.target.value)} placeholder="e.g. Restock, PO #, invoice" maxLength={200} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>{submitting ? "Submitting..." : "Submit for approval"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="mb-4">
            <FilterBar
              values={filters}
              onChange={setFilters}
              searchPlaceholder="Search item name or SKU…"
              show={{ q: true, category: true, warehouse: true, status: true }}
              categories={categories.map((c) => ({ value: c.id, label: c.name }))}
              warehouses={whs.map((w) => ({ value: w.id, label: w.name }))}
              statuses={(Object.keys(STATUS_LABEL) as Status[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const it = itemMap.get(r.item_id);
                return (
                  <TableRow key={r.id} onClick={() => openDetail(r)} className="cursor-pointer hover:bg-muted/40">
                    <TableCell className="font-mono text-xs">{it?.sku ?? "—"}</TableCell>
                    <TableCell className="font-medium">{it?.name ?? "Unknown"}</TableCell>
                    <TableCell>{whMap.get(r.warehouse_id) ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.quantity}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v as Status)}>
                          <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className={statusClass(r.status)}>{STATUS_LABEL[r.status]}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No stock rows.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail ? itemMap.get(detail.item_id)?.name ?? "Stock" : "Stock"}</DialogTitle>
            <DialogDescription className="font-mono text-xs">{detail ? itemMap.get(detail.item_id)?.sku : ""}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-3 border-b border-border/60 py-1.5">
                <div className="text-xs text-muted-foreground">Warehouse</div>
                <div className="col-span-2">{whMap.get(detail.warehouse_id) ?? "—"}</div>
              </div>
              <div className="grid grid-cols-3 gap-3 border-b border-border/60 py-1.5">
                <div className="text-xs text-muted-foreground">Quantity</div>
                <div className="col-span-2 font-medium">{detail.quantity}</div>
              </div>
              <div className="grid grid-cols-3 gap-3 border-b border-border/60 py-1.5">
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="col-span-2"><Badge variant="outline" className={statusClass(detail.status)}>{STATUS_LABEL[detail.status]}</Badge></div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Recent movements</div>
                <div className="space-y-1 max-h-60 overflow-auto">
                  {moves.length === 0 && <div className="text-xs text-muted-foreground">No movements for this item & warehouse.</div>}
                  {moves.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs">
                      <div>
                        <Badge variant="outline" className="mr-2">{m.movement_type}</Badge>
                        <span>{m.reason ?? "—"}</span>
                        {m.reference && <span className="ml-1 text-muted-foreground">({m.reference})</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium tabular-nums">{m.quantity}</span>
                        <span className="text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Stock;
