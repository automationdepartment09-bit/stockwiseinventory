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
  const canEdit = hasRole("admin", "manager");
  const [rows, setRows] = useState<Row[]>([]);
  const [items, setItems] = useState<{ id: string; name: string; sku: string }[]>([]);
  const [whs, setWhs] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Add-stock dialog
  const [addOpen, setAddOpen] = useState(false);
  const [aItem, setAItem] = useState("");
  const [aWh, setAWh] = useState("");
  const [aQty, setAQty] = useState<number>(1);
  const [aReason, setAReason] = useState("");
  const [aRef, setARef] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Detail dialog
  const [detail, setDetail] = useState<Row | null>(null);
  const [moves, setMoves] = useState<any[]>([]);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const whMap = useMemo(() => new Map(whs.map((w) => [w.id, w.name])), [whs]);

  const load = async () => {
    const [{ data: lvls }, { data: its }, { data: w }] = await Promise.all([
      supabase.from("stock_levels").select("id,item_id,warehouse_id,quantity,status"),
      supabase.from("items").select("id,name,sku").eq("is_active", true).order("name"),
      supabase.from("warehouses").select("id,name").eq("is_active", true).order("name"),
    ]);
    setRows((lvls ?? []) as Row[]);
    setItems(its ?? []);
    setWhs(w ?? []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const it = itemMap.get(r.item_id);
      const matchQ = !q || it?.name.toLowerCase().includes(q) || it?.sku.toLowerCase().includes(q);
      const matchS = statusFilter === "all" || r.status === statusFilter;
      return matchQ && matchS;
    });
  }, [rows, itemMap, search, statusFilter]);

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
    const { error } = await supabase.from("stock_movements").insert({
      item_id: aItem,
      to_warehouse_id: aWh,
      movement_type: "in",
      quantity: aQty,
      reason: aReason.trim() || "Stock added",
      reference: aRef.trim() || null,
      created_by: user!.id,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Stock added");
    setAddOpen(false);
    setAItem(""); setAWh(""); setAQty(1); setAReason(""); setARef("");
    load();
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
              <DialogHeader><DialogTitle>Add stock</DialogTitle></DialogHeader>
              <form onSubmit={submitAdd} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Item *</Label>
                  <Select value={aItem} onValueChange={setAItem}>
                    <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                    <SelectContent>{items.map((i) => (<SelectItem key={i.id} value={i.id}>{i.sku} · {i.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Warehouse *</Label>
                  <Select value={aWh} onValueChange={setAWh}>
                    <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                    <SelectContent>{whs.map((w) => (<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Quantity *</Label>
                  <Input type="number" min={1} value={aQty} onChange={(e) => setAQty(Number(e.target.value))} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Reason</Label>
                  <Input value={aReason} onChange={(e) => setAReason(e.target.value)} placeholder="e.g. Initial stock, restock" maxLength={200} />
                </div>
                <div className="space-y-1.5">
                  <Label>Reference</Label>
                  <Input value={aRef} onChange={(e) => setARef(e.target.value)} placeholder="PO #, invoice, etc." maxLength={120} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>{submitting ? "Adding..." : "Add stock"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search item name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
