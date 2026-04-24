import { useEffect, useMemo, useState } from "react";
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
import { ArrowDown, ArrowRightLeft, ArrowUp, Plus, Sliders, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Move { id: string; movement_type: "in"|"out"|"transfer"|"adjustment"; quantity: number; reason: string|null; reference: string|null; created_at: string; item_id: string; from_warehouse_id: string|null; to_warehouse_id: string|null }

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
  const canDelete = hasRole("admin");
  const [moves, setMoves] = useState<Move[]>([]);
  const [items, setItems] = useState<{id:string;name:string;sku:string}[]>([]);
  const [warehouses, setWarehouses] = useState<{id:string;name:string}[]>([]);
  const [reqStatusByRefId, setReqStatusByRefId] = useState<Record<string, ReqStatus>>({});
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"in"|"out"|"transfer"|"adjustment">("in");
  const [statusFilter, setStatusFilter] = useState<"all" | "manual" | ReqStatus>("all");
  const [toDelete, setToDelete] = useState<Move | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    const [{ data: m }, { data: it }, { data: wh }, { data: rq }] = await Promise.all([
      supabase.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("items").select("id, name, sku").order("name"),
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("stock_requests").select("id, status"),
    ]);
    setMoves((m ?? []) as Move[]);
    setItems(it ?? []);
    setWarehouses(wh ?? []);
    const map: Record<string, ReqStatus> = {};
    (rq ?? []).forEach((r: any) => { map[r.id] = r.status as ReqStatus; });
    setReqStatusByRefId(map);
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const item_id = String(fd.get("item_id") ?? "");
    const quantity = Number(fd.get("quantity") ?? 0);
    const from_warehouse_id = String(fd.get("from_warehouse_id") ?? "") || null;
    const to_warehouse_id = String(fd.get("to_warehouse_id") ?? "") || null;
    const reason = String(fd.get("reason") ?? "").trim() || null;
    const reference = String(fd.get("reference") ?? "").trim() || null;
    if (!item_id || quantity <= 0) return toast.error("Item and positive quantity required");
    if ((type === "in" || type === "adjustment") && !to_warehouse_id) return toast.error("Destination warehouse required");
    if (type === "out" && !from_warehouse_id) return toast.error("Source warehouse required");
    if (type === "transfer" && (!from_warehouse_id || !to_warehouse_id)) return toast.error("Both warehouses required");
    const { error } = await supabase.from("stock_movements").insert({
      item_id, movement_type: type, quantity, from_warehouse_id, to_warehouse_id, reason, reference, created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Stock updated"); setOpen(false); load();
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

  const filtered = useMemo(() => {
    if (statusFilter === "all") return moves;
    return moves.filter((m) => {
      const s = statusFor(m);
      if (statusFilter === "manual") return s.kind === "manual";
      return s.kind === "request" && s.status === statusFilter;
    });
  }, [moves, statusFilter, reqStatusByRefId]);

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
                <div className="space-y-1.5">
                  <Label>Item</Label>
                  <Select name="item_id">
                    <SelectTrigger><SelectValue placeholder="Choose item…" /></SelectTrigger>
                    <SelectContent>{items.map(i=><SelectItem key={i.id} value={i.id}>{i.sku} — {i.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Quantity</Label>
                  <Input name="quantity" type="number" min="1" required />
                </div>
                {(type === "out" || type === "transfer") && (
                  <div className="space-y-1.5">
                    <Label>From warehouse</Label>
                    <Select name="from_warehouse_id">
                      <SelectTrigger><SelectValue placeholder="Source…" /></SelectTrigger>
                      <SelectContent>{warehouses.map(w=><SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {(type === "in" || type === "transfer" || type === "adjustment") && (
                  <div className="space-y-1.5">
                    <Label>To warehouse</Label>
                    <Select name="to_warehouse_id">
                      <SelectTrigger><SelectValue placeholder="Destination…" /></SelectTrigger>
                      <SelectContent>{warehouses.map(w=><SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5"><Label>Reason</Label><Input name="reason" maxLength={200} /></div>
                <div className="space-y-1.5"><Label>Reference</Label><Input name="reference" maxLength={100} placeholder="PO, invoice…" /></div>
                <DialogFooter><Button type="submit">Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />
      <Card className="glass-card">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-end gap-2">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_VALUES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v === "all" ? "All" : v === "manual" ? "Manual (no request)" : STATUS_LABEL[v]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>From → To</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead>{canDelete && <TableHead className="text-right">Actions</TableHead>}</TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => {
                const it = itemMap.get(m.item_id);
                const s = statusFor(m);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline" className="gap-1">{typeIcon(m.movement_type)}{m.movement_type}</Badge></TableCell>
                    <TableCell className="font-medium">{it?.name ?? "—"} <span className="ml-1 font-mono text-xs text-muted-foreground">{it?.sku}</span></TableCell>
                    <TableCell>{m.quantity}</TableCell>
                    <TableCell className="text-xs">{whMap.get(m.from_warehouse_id ?? "")?.name ?? "—"} → {whMap.get(m.to_warehouse_id ?? "")?.name ?? "—"}</TableCell>
                    <TableCell>
                      {s.kind === "manual"
                        ? <Badge variant="outline" className="text-muted-foreground">Manual</Badge>
                        : s.status === "rejected"
                          ? <Badge variant="destructive">Rejected</Badge>
                          : s.status === "pending"
                            ? <Badge variant="outline">Pending</Badge>
                            : <Badge className={statusBadgeClass[s.status]}>{STATUS_LABEL[s.status]}</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.reason ?? ""}{m.reference ? ` (${m.reference})` : ""}</TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No movements match this filter.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
export default Movements;
