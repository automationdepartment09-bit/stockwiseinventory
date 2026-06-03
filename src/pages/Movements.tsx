import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowRightLeft, ArrowUp, Plus, Printer, Sliders, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { ItemPicker } from "@/components/ItemPicker";
import { FilterBar, FilterValues, EMPTY_FILTERS, matchesQuery, inDateRange } from "@/components/FilterBar";
import { printReceipt, receiptNo } from "@/lib/receipt";
import { printList } from "@/lib/exportPrint";
import { MultiLineItems, LineItem, emptyLine, newBatchRef } from "@/components/MultiLineItems";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type MoveStatus = "pending" | "approved" | "rejected";
interface Move { id: string; movement_type: "in"|"out"|"transfer"|"adjustment"; quantity: number; reason: string|null; reference: string|null; created_at: string; item_id: string; from_warehouse_id: string|null; to_warehouse_id: string|null; batch_ref: string|null; status: MoveStatus; review_note: string|null; reviewed_by: string|null; reviewed_at: string|null; created_by: string|null }

type ReqStatus = "pending" | "approved" | "rejected" | "on_arrival" | "arrived" | "received";

const STATUS_LABEL: Record<ReqStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  on_arrival: "On arrival",
  arrived: "Arrived",
  received: "Received",
};

const statusBadgeClass: Record<ReqStatus, string> = {
  pending: "",
  approved: "bg-primary/20 text-primary",
  rejected: "",
  on_arrival: "bg-warning/20 text-warning",
  arrived: "bg-accent/30 text-accent-foreground",
  received: "bg-success/20 text-success",
};

const STATUS_FILTER_VALUES: Array<"all" | "manual" | ReqStatus> = [
  "all", "manual", "pending", "approved", "on_arrival", "arrived", "received", "rejected",
];

const Movements = () => {
  const { user, hasRole } = useAuth();
  const canCreate = hasRole("admin", "manager", "staff");
  const canReview = hasRole("admin", "manager");
  const canDelete = hasRole("admin");
  const [moves, setMoves] = useState<Move[]>([]);
  const [items, setItems] = useState<{id:string;name:string;sku:string;category_id?:string|null}[]>([]);
  const [warehouses, setWarehouses] = useState<{id:string;name:string}[]>([]);
  const [categories, setCategories] = useState<{id:string;name:string}[]>([]);
  const [reqStatusByRefId, setReqStatusByRefId] = useState<Record<string, ReqStatus>>({});
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"in"|"out"|"transfer"|"adjustment">("in");
  const [fLines, setFLines] = useState<LineItem[]>([emptyLine()]);
  const [fFromWh, setFFromWh] = useState<string>("");
  const [fToWh, setFToWh] = useState<string>("");
  const [fReason, setFReason] = useState<string>("");
  const [fReference, setFReference] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "manual" | ReqStatus>("all");
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [typeFilter, setTypeFilter] = useState<"all"|"in"|"out"|"transfer"|"adjustment">("all");
  const [toDelete, setToDelete] = useState<Move | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSel = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("stock_movements").delete().eq("id", toDelete.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("Movement deleted");
    setToDelete(null);
    load();
  };

  const load = async () => {
    const [{ data: m }, { data: it }, { data: wh }, { data: rq }, { data: cats }] = await Promise.all([
      supabase.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("items").select("id, name, sku, category_id").order("name"),
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("stock_requests").select("id, status"),
      supabase.from("categories").select("id, name").order("name"),
    ]);
    setMoves((m ?? []) as Move[]);
    setItems((it ?? []) as any);
    setWarehouses(wh ?? []);
    setCategories(cats ?? []);
    const map: Record<string, ReqStatus> = {};
    (rq ?? []).forEach((r: any) => { map[r.id] = r.status as ReqStatus; });
    setReqStatusByRefId(map);
  };
  useEffect(() => { load(); }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const itemParam = searchParams.get("item");
    const typeParam = searchParams.get("type");
    if (itemParam || typeParam) {
      if (typeParam === "in" || typeParam === "out" || typeParam === "transfer" || typeParam === "adjustment") {
        setType(typeParam);
      }
      if (itemParam) setFLines([{ item_id: itemParam, quantity: 1 }]);
      setOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("item");
      next.delete("type");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const valid = fLines.filter((l) => l.item_id && l.quantity > 0);
    const from_warehouse_id = fFromWh || null;
    const to_warehouse_id = fToWh || null;
    if (valid.length === 0) return toast.error("Add at least one item with positive quantity");
    if ((type === "in" || type === "adjustment") && !to_warehouse_id) return toast.error("Destination warehouse required");
    if (type === "out" && !from_warehouse_id) return toast.error("Source warehouse required");
    if (type === "transfer" && (!from_warehouse_id || !to_warehouse_id)) return toast.error("Both warehouses required");
    const reason = fReason.trim() || null;
    const reference = fReference.trim() || null;
    const batch_ref = valid.length > 1 ? newBatchRef("MV") : null;
    const payload = valid.map((l) => ({
      item_id: l.item_id, movement_type: type, quantity: l.quantity,
      from_warehouse_id, to_warehouse_id, reason, reference,
      created_by: user?.id, batch_ref,
    }));
    const { error } = await supabase.from("stock_movements").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(`${valid.length} movement(s) submitted — awaiting approval`);
    setOpen(false); setFLines([emptyLine()]); setFFromWh(""); setFToWh(""); setFReason(""); setFReference(""); load();
  };

  const review = async (m: Move, status: "approved" | "rejected", note?: string) => {
    const { error } = await supabase.from("stock_movements")
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_note: note ?? null })
      .eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success(status === "approved" ? "Movement approved & stock updated" : "Movement rejected");
    load();
  };

  const itemMap = new Map(items.map(i=>[i.id,i]));
  const whMap = new Map(warehouses.map(w=>[w.id,w]));

  const typeIcon = (t: string) =>
    t === "in" ? <ArrowDown className="h-3 w-3 text-primary" /> :
    t === "out" ? <ArrowUp className="h-3 w-3 text-destructive" /> :
    t === "transfer" ? <ArrowRightLeft className="h-3 w-3 text-secondary" /> :
    <Sliders className="h-3 w-3 text-warning" />;

  // Derive status for a movement: from linked request or "manual"
  const statusFor = (m: Move): { kind: "request"; status: ReqStatus } | { kind: "manual" } => {
    if (m.reference && m.reference.startsWith("REQ:")) {
      const id = m.reference.slice(4);
      const s = reqStatusByRefId[id];
      if (s) return { kind: "request", status: s };
    }
    return { kind: "manual" };
  };

  const printMove = (m: Move) => {
    const siblings = m.batch_ref ? moves.filter((x) => x.batch_ref === m.batch_ref) : [m];
    const from = whMap.get(m.from_warehouse_id ?? "")?.name;
    const to = whMap.get(m.to_warehouse_id ?? "")?.name;
    const titleByType: Record<Move["movement_type"], string> = {
      in: "Stock receipt voucher",
      out: "Stock issue voucher",
      transfer: "Stock transfer voucher",
      adjustment: "Stock adjustment voucher",
    };
    const s = statusFor(m);
    const totalQty = siblings.reduce((sum, x) => sum + x.quantity, 0);
    printReceipt({
      kind: "movement",
      receiptNo: m.batch_ref ?? receiptNo("MV", m.id),
      title: titleByType[m.movement_type],
      subtitle: `Type: ${m.movement_type.toUpperCase()}${s.kind === "request" ? " · " + STATUS_LABEL[s.status] : ""}${siblings.length > 1 ? ` · ${siblings.length} items · total qty ${totalQty}` : ""}`,
      date: m.created_at,
      fields: [
        { label: "From warehouse", value: from || "—" },
        { label: "To warehouse", value: to || "—" },
        { label: "Reference", value: m.reference || "—" },
        { label: "Batch", value: m.batch_ref || "—" },
        { label: "Reason", value: m.reason || "—", full: true },
      ],
      lineItems: siblings.map((x) => {
        const it = itemMap.get(x.item_id);
        return { name: it?.name ?? "Item", sku: it?.sku, qty: x.quantity };
      }),
      signatures:
        m.movement_type === "transfer"
          ? ["Released by", "Received by", "Verified by"]
          : m.movement_type === "out"
            ? ["Issued by", "Received by"]
            : ["Received by", "Verified by"],
    });
  };

  const filtered = useMemo(() => {
    return moves.filter((m) => {
      if (statusFilter !== "all") {
        const s = statusFor(m);
        if (statusFilter === "manual" && s.kind !== "manual") return false;
        if (statusFilter !== "manual" && (s.kind !== "request" || s.status !== statusFilter)) return false;
      }
      if (typeFilter !== "all" && m.movement_type !== typeFilter) return false;
      if (!inDateRange(m.created_at, filters.from, filters.to)) return false;
      if (filters.warehouse !== "all" && m.from_warehouse_id !== filters.warehouse && m.to_warehouse_id !== filters.warehouse) return false;
      const it = itemMap.get(m.item_id);
      if (filters.category !== "all" && (it as any)?.category_id !== filters.category) return false;
      if (!matchesQuery(filters.q, [it?.name, it?.sku, m.reason, m.reference])) return false;
      return true;
    });
  }, [moves, statusFilter, typeFilter, filters, reqStatusByRefId, itemMap]);

  const printBatch = (ids: string[]) => {
    const list = filtered.filter(m => ids.includes(m.id));
    if (list.length === 0) return toast.error("Nothing to print");
    printList({
      title: "Stock movements batch",
      subtitle: `${list.length} movement(s)`,
      columns: ["When", "Type", "Item", "SKU", "Qty", "From", "To", "Status", "Reason"],
      rows: list.map(m => {
        const it = itemMap.get(m.item_id);
        return [new Date(m.created_at).toLocaleString(), m.movement_type, it?.name ?? "—", it?.sku ?? "—",
          m.quantity, whMap.get(m.from_warehouse_id ?? "")?.name ?? "—", whMap.get(m.to_warehouse_id ?? "")?.name ?? "—",
          m.status, m.reason ?? ""];
      }),
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock movements"
        description="Record stock in, out, transfers, and adjustments."
        actions={canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New movement</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record movement</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">Stock in</SelectItem>
                      <SelectItem value="out">Stock out</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(type === "out" || type === "transfer") && (
                  <div className="space-y-1.5">
                    <Label>From warehouse</Label>
                    <Select value={fFromWh} onValueChange={setFFromWh}>
                      <SelectTrigger><SelectValue placeholder="Source…" /></SelectTrigger>
                      <SelectContent>{warehouses.map(w=><SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {(type === "in" || type === "transfer" || type === "adjustment") && (
                  <div className="space-y-1.5">
                    <Label>To warehouse</Label>
                    <Select value={fToWh} onValueChange={setFToWh}>
                      <SelectTrigger><SelectValue placeholder="Destination…" /></SelectTrigger>
                      <SelectContent>{warehouses.map(w=><SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <MultiLineItems value={fLines} onChange={setFLines} warehouseId={(type === "out" || type === "transfer") ? (fFromWh || undefined) : undefined} />
                <div className="space-y-1.5"><Label>Reason</Label><Input value={fReason} onChange={(e)=>setFReason(e.target.value)} maxLength={200} /></div>
                <div className="space-y-1.5"><Label>Reference</Label><Input value={fReference} onChange={(e)=>setFReference(e.target.value)} maxLength={100} placeholder="PO, invoice…" /></div>
                <DialogFooter><Button type="submit">Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />
      <Card className="glass-card">
        <CardContent className="p-4 space-y-3">
          <FilterBar
            values={filters}
            onChange={setFilters}
            searchPlaceholder="Search item, reason, reference…"
            show={{ q: true, category: true, warehouse: true, from: true, to: true }}
            categories={categories.map((c) => ({ value: c.id, label: c.name }))}
            warehouses={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            rightSlot={
              <>
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
                  <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="in">Stock in</SelectItem>
                    <SelectItem value="out">Stock out</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                  <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTER_VALUES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v === "all" ? "All req. statuses" : v === "manual" ? "Manual (no request)" : STATUS_LABEL[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => printBatch(Array.from(selected))} disabled={selected.size === 0}>
                  <Printer className="mr-1 h-3.5 w-3.5" />Print selected ({selected.size})
                </Button>
              </>
            }
          />
          <Table>
            <TableHeader>
              <TableRow><TableHead className="w-8"><Checkbox checked={filtered.length > 0 && filtered.every(m => selected.has(m.id))} onCheckedChange={(v) => { const n = new Set(selected); filtered.forEach(m => v ? n.add(m.id) : n.delete(m.id)); setSelected(n); }} /></TableHead><TableHead>When (date &amp; time)</TableHead><TableHead>Type</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>From → To</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => {
                const it = itemMap.get(m.item_id);
                const s = statusFor(m);
                const d = new Date(m.created_at);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <div>{d.toLocaleDateString()}</div>
                      <div className="tabular-nums">{d.toLocaleTimeString()}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="gap-1">{typeIcon(m.movement_type)}{m.movement_type}</Badge></TableCell>
                    <TableCell className="font-medium">{it?.name ?? "—"} <span className="ml-1 font-mono text-xs text-muted-foreground">{it?.sku}</span></TableCell>
                    <TableCell>{m.quantity}</TableCell>
                    <TableCell className="text-xs">{whMap.get(m.from_warehouse_id ?? "")?.name ?? "—"} → {whMap.get(m.to_warehouse_id ?? "")?.name ?? "—"}</TableCell>
                    <TableCell>
                      {m.status === "pending" ? <Badge variant="outline" className="bg-warning/20 text-warning">Pending</Badge>
                       : m.status === "rejected" ? <Badge variant="destructive">Rejected</Badge>
                       : <Badge className="bg-success/20 text-success">Approved</Badge>}
                      {s.kind === "request" && s.status !== "pending" && (
                        <Badge variant="outline" className="ml-1 text-[10px]">{STATUS_LABEL[s.status]}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.reason ?? ""}{m.reference ? ` (${m.reference})` : ""}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canReview && m.status === "pending" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-success" onClick={() => review(m, "approved")}>Approve</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-destructive" onClick={() => { const n = window.prompt("Reject reason (optional)?") ?? undefined; review(m, "rejected", n || undefined); }}>Reject</Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => printMove(m)} title="Print receipt">
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        {canDelete && (
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setToDelete(m)} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No movements match this filter.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete movement?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the movement record. Stock levels are not automatically reverted — adjust manually if needed.
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
    </div>
  );
};
export default Movements;
