import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, X, Plus, Truck, PackageCheck, PackageOpen } from "lucide-react";
import { toast } from "sonner";

type ReqStatus = "pending" | "approved" | "rejected" | "on_arrival" | "arrived" | "received";

interface Req {
  id: string; item_id: string; warehouse_id: string; quantity: number;
  reason: string | null; status: ReqStatus;
  requested_by: string; reviewed_by: string | null; review_note: string | null;
  reviewed_at: string | null; created_at: string;
}

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

// Allowed forward transitions (reviewers/managers only)
const NEXT_STATUSES: Record<ReqStatus, ReqStatus[]> = {
  pending: ["approved", "rejected"],
  approved: ["on_arrival", "rejected"],
  on_arrival: ["arrived"],
  arrived: ["received"],
  received: [],
  rejected: [],
};

const Requests = () => {
  const { user, hasRole } = useAuth();
  const canReview = hasRole("admin", "manager");
  const [rows, setRows] = useState<Req[]>([]);
  const [items, setItems] = useState<Record<string, { name: string; sku: string }>>({});
  const [whs, setWhs] = useState<Record<string, string>>({});
  const [itemList, setItemList] = useState<{ id: string; name: string; sku: string }[]>([]);
  const [whList, setWhList] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState<"pending" | "all" | "mine">("pending");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // New request dialog
  const [openNew, setOpenNew] = useState(false);
  const [reqItem, setReqItem] = useState("");
  const [reqWh, setReqWh] = useState("");
  const [reqQty, setReqQty] = useState("1");
  const [reqReason, setReqReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<Req | null>(null);

  const load = async () => {
    const [{ data: rs }, { data: its }, { data: ws }] = await Promise.all([
      supabase.from("stock_requests").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("items").select("id, name, sku").order("name"),
      supabase.from("warehouses").select("id, name").eq("is_active", true).order("name"),
    ]);
    setRows((rs ?? []) as Req[]);
    const im: Record<string, { name: string; sku: string }> = {};
    (its ?? []).forEach((i: any) => { im[i.id] = { name: i.name, sku: i.sku }; });
    setItems(im);
    setItemList((its ?? []) as any);
    const wm: Record<string, string> = {};
    (ws ?? []).forEach((w: any) => { wm[w.id] = w.name; });
    setWhs(wm);
    setWhList((ws ?? []) as any);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    if (tab === "pending") return r.status !== "received" && r.status !== "rejected";
    if (tab === "mine") return r.requested_by === user?.id;
    return true;
  });

  const review = async (id: string, status: ReqStatus) => {
    const includeReview = status === "approved" || status === "rejected";
    const patch = includeReview
      ? { status, reviewed_by: user?.id ?? null, review_note: note || null, reviewed_at: new Date().toISOString() }
      : { status };
    const { error } = await supabase.from("stock_requests").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked as ${STATUS_LABEL[status].toLowerCase()}`);
    setNoteFor(null); setNote("");
    load();
  };

  const openRequest = () => {
    setReqItem(itemList[0]?.id ?? "");
    setReqWh(whList[0]?.id ?? "");
    setReqQty("1");
    setReqReason("");
    setOpenNew(true);
  };

  const submitRequest = async () => {
    const qty = Number(reqQty);
    if (!reqItem) return toast.error("Select an item");
    if (!reqWh) return toast.error("Select a warehouse");
    if (!qty || qty <= 0) return toast.error("Enter a positive quantity");
    if (!user?.id) return toast.error("Not signed in");
    setSubmitting(true);
    const { error } = await supabase.from("stock_requests").insert({
      item_id: reqItem,
      warehouse_id: reqWh,
      quantity: qty,
      reason: reqReason.trim() || null,
      requested_by: user.id,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Request submitted — pending approval");
    setOpenNew(false);
    load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock requests"
        description="Review and approve incoming stock additions per warehouse."
        actions={
          <Button onClick={openRequest}><Plus className="mr-2 h-4 w-4" />New request</Button>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="pending">Open</TabsTrigger>
          <TabsTrigger value="mine">My requests</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="glass-card">
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const it = items[r.item_id];
                return (
                  <TableRow key={r.id} onClick={() => setDetail(r)} className="cursor-pointer hover:bg-muted/40">
                    <TableCell className="font-medium">
                      {it?.name ?? "—"}
                      {it && <div className="font-mono text-[10px] text-muted-foreground">{it.sku}</div>}
                    </TableCell>
                    <TableCell>{whs[r.warehouse_id] ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.quantity}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{r.reason ?? "—"}</TableCell>
                    <TableCell>
                      {r.status === "rejected"
                        ? <Badge variant="destructive">Rejected</Badge>
                        : r.status === "pending"
                          ? <Badge variant="outline">Pending</Badge>
                          : <Badge className={statusBadgeClass[r.status]}>{STATUS_LABEL[r.status]}</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      {canReview && r.status === "pending" && (
                        noteFor === r.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="h-8 w-40" />
                            <Button size="sm" onClick={() => review(r.id, "approved")}><Check className="mr-1 h-3.5 w-3.5" />Approve</Button>
                            <Button size="sm" variant="destructive" onClick={() => review(r.id, "rejected")}><X className="mr-1 h-3.5 w-3.5" />Reject</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setNoteFor(null); setNote(""); }}>Cancel</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => { setNoteFor(r.id); setNote(""); }}>Review</Button>
                        )
                      )}
                      {canReview && r.status !== "pending" && NEXT_STATUSES[r.status].length > 0 && (
                        <div className="flex items-center justify-end gap-2">
                          {NEXT_STATUSES[r.status].map((next) => {
                            const Icon = next === "on_arrival" ? Truck : next === "arrived" ? PackageOpen : next === "received" ? PackageCheck : next === "rejected" ? X : Check;
                            const variant = next === "rejected" ? "destructive" : next === "received" ? "default" : "outline";
                            return (
                              <Button key={next} size="sm" variant={variant as any} onClick={() => review(r.id, next)}>
                                <Icon className="mr-1 h-3.5 w-3.5" />
                                {STATUS_LABEL[next]}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No requests.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New stock request</DialogTitle>
            <DialogDescription>Requires admin or manager approval before stock is added.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Item</Label>
              <Select value={reqItem} onValueChange={setReqItem}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {itemList.map((it) => (
                    <SelectItem key={it.id} value={it.id}>
                      {it.name} <span className="ml-1 font-mono text-xs text-muted-foreground">({it.sku})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Warehouse</Label>
              <Select value={reqWh} onValueChange={setReqWh}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {whList.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input type="number" min="1" value={reqQty} onChange={(e) => setReqQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Reason / source (optional)</Label>
              <Input value={reqReason} onChange={(e) => setReqReason(e.target.value)} placeholder="Restock, supplier delivery…" maxLength={200} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancel</Button>
            <Button onClick={submitRequest} disabled={submitting}>{submitting ? "Submitting…" : "Submit for approval"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Requests;
