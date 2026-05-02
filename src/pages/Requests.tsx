import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { Check, X, Plus, Truck, PackageCheck, PackageOpen, Printer } from "lucide-react";
import { toast } from "sonner";
import { ItemPicker } from "@/components/ItemPicker";
import { FilterBar, FilterValues, EMPTY_FILTERS, matchesQuery, inDateRange } from "@/components/FilterBar";
import { printReceipt, receiptNo } from "@/lib/receipt";

type ReqStatus = "pending" | "approved" | "rejected" | "on_arrival" | "arrived" | "received";

interface Req {
  id: string; item_id: string; warehouse_id: string; quantity: number;
  reason: string | null; status: ReqStatus;
  requested_by: string; reviewed_by: string | null; review_note: string | null;
  reviewed_at: string | null; created_at: string;
  project_id: string | null;
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
  const [items, setItems] = useState<Record<string, { name: string; sku: string; category_id: string | null }>>({});
  const [whs, setWhs] = useState<Record<string, string>>({});
  const [itemList, setItemList] = useState<{ id: string; name: string; sku: string }[]>([]);
  const [whList, setWhList] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [projectMap, setProjectMap] = useState<Record<string, { name: string; code: string | null }>>({});
  const [profileMap, setProfileMap] = useState<Record<string, { full_name: string | null; email: string | null }>>({});
  const [tab, setTab] = useState<"pending" | "all" | "mine">("pending");
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // New request dialog
  const [openNew, setOpenNew] = useState(false);
  const [reqItem, setReqItem] = useState("");
  const [reqWh, setReqWh] = useState("");
  const [reqQty, setReqQty] = useState("1");
  const [reqReason, setReqReason] = useState("");
  const [reqProject, setReqProject] = useState<string>("__none__");
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<Req | null>(null);

  const load = async () => {
    const [{ data: rs }, { data: its }, { data: ws }, { data: pj }, { data: pf }, { data: cats }] = await Promise.all([
      supabase.from("stock_requests").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("items").select("id, name, sku, category_id").order("name"),
      supabase.from("warehouses").select("id, name").eq("is_active", true).order("name"),
      supabase.from("projects").select("id,name,code").eq("is_active", true).order("name"),
      supabase.from("profiles").select("id,full_name,email"),
      supabase.from("categories").select("id,name").order("name"),
    ]);
    setRows((rs ?? []) as Req[]);
    const im: Record<string, { name: string; sku: string; category_id: string | null }> = {};
    (its ?? []).forEach((i: any) => { im[i.id] = { name: i.name, sku: i.sku, category_id: i.category_id ?? null }; });
    setItems(im);
    setItemList((its ?? []) as any);
    const wm: Record<string, string> = {};
    (ws ?? []).forEach((w: any) => { wm[w.id] = w.name; });
    setWhs(wm);
    setWhList((ws ?? []) as any);
    setProjects((pj ?? []) as any);
    setCategories((cats ?? []) as any);
    const pm: Record<string, { name: string; code: string | null }> = {};
    (pj ?? []).forEach((p: any) => { pm[p.id] = { name: p.name, code: p.code }; });
    setProjectMap(pm);
    const um: Record<string, { full_name: string | null; email: string | null }> = {};
    (pf ?? []).forEach((u: any) => { um[u.id] = { full_name: u.full_name, email: u.email }; });
    setProfileMap(um);
  };
  useEffect(() => { load(); }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const itemParam = searchParams.get("item");
    if (itemParam) {
      setReqItem(itemParam);
      setReqWh(whList[0]?.id ?? "");
      setReqQty("1");
      setReqReason("");
      setReqProject("__none__");
      setOpenNew(true);
      const next = new URLSearchParams(searchParams);
      next.delete("item");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, whList, setSearchParams]);

  const filtered = rows.filter((r) => {
    if (tab === "pending" && (r.status === "received" || r.status === "rejected")) return false;
    if (tab === "mine" && r.requested_by !== user?.id) return false;
    const it = items[r.item_id];
    if (!matchesQuery(filters.q, [it?.name, it?.sku, r.reason, whs[r.warehouse_id]])) return false;
    if (filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.warehouse !== "all" && r.warehouse_id !== filters.warehouse) return false;
    if (filters.category !== "all" && it?.category_id !== filters.category) return false;
    if (filters.project !== "all") {
      if (filters.project === "__none__" ? r.project_id !== null : r.project_id !== filters.project) return false;
    }
    if (filters.requester !== "all" && r.requested_by !== filters.requester) return false;
    if (!inDateRange(r.created_at, filters.from, filters.to)) return false;
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
    setReqProject("__none__");
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
      project_id: reqProject === "__none__" ? null : reqProject,
    } as any);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Request submitted — pending approval");
    setOpenNew(false);
    load();
  };

  const requesterLabel = (id: string) => {
    const p = profileMap[id];
    return p?.full_name || p?.email || (id === user?.id ? "You" : "—");
  };
  const projectLabel = (id: string | null) => {
    if (!id) return "—";
    const p = projectMap[id];
    if (!p) return "—";
    return `${p.code ? p.code + " · " : ""}${p.name}`;
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
        <CardContent className="p-4 space-y-3">
          <FilterBar
            values={filters}
            onChange={setFilters}
            searchPlaceholder="Search item, reason, warehouse…"
            show={{ q: true, category: true, warehouse: true, status: true, project: true, requester: true, from: true, to: true }}
            categories={categories.map((c) => ({ value: c.id, label: c.name }))}
            warehouses={whList.map((w) => ({ value: w.id, label: w.name }))}
            statuses={(Object.keys(STATUS_LABEL) as ReqStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            projects={projects.map((p) => ({ value: p.id, label: p.code ? `${p.code} · ${p.name}` : p.name }))}
            requesters={Object.entries(profileMap).map(([id, p]) => ({ value: id, label: p.full_name || p.email || id.slice(0,6) }))}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted (date & time)</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const it = items[r.item_id];
                const d = new Date(r.created_at);
                return (
                  <TableRow key={r.id} onClick={() => setDetail(r)} className="cursor-pointer hover:bg-muted/40">
                    <TableCell className="font-medium">
                      {it?.name ?? "—"}
                      {it && <div className="font-mono text-[10px] text-muted-foreground">{it.sku}</div>}
                    </TableCell>
                    <TableCell>{whs[r.warehouse_id] ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.quantity}</TableCell>
                    <TableCell className="text-sm">{requesterLabel(r.requested_by)}</TableCell>
                    <TableCell className="text-xs">{projectLabel(r.project_id)}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{r.reason ?? "—"}</TableCell>
                    <TableCell>
                      {r.status === "rejected"
                        ? <Badge variant="destructive">Rejected</Badge>
                        : r.status === "pending"
                          ? <Badge variant="outline">Pending</Badge>
                          : <Badge className={statusBadgeClass[r.status]}>{STATUS_LABEL[r.status]}</Badge>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <div>{d.toLocaleDateString()}</div>
                      <div className="tabular-nums">{d.toLocaleTimeString()}</div>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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
                <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">No requests.</TableCell></TableRow>
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
              <ItemPicker value={reqItem} onChange={setReqItem} warehouseId={reqWh || undefined} />
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
            <div className="space-y-1.5">
              <Label>Project (optional)</Label>
              <Select value={reqProject} onValueChange={setReqProject}>
                <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No project —</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ""}{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs text-muted-foreground">
              <div><span className="font-medium text-foreground">Requested by:</span> {requesterLabel(user?.id ?? "")}</div>
              <div><span className="font-medium text-foreground">Date & time:</span> {new Date().toLocaleString()} <span className="opacity-60">(captured on submit)</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancel</Button>
            <Button onClick={submitRequest} disabled={submitting}>{submitting ? "Submitting…" : "Submit for approval"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request details</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <RRow label="Item">{items[detail.item_id]?.name ?? "—"} <span className="font-mono text-xs text-muted-foreground">({items[detail.item_id]?.sku})</span></RRow>
              <RRow label="Warehouse">{whs[detail.warehouse_id] ?? "—"}</RRow>
              <RRow label="Quantity">{detail.quantity}</RRow>
              <RRow label="Requested by">{requesterLabel(detail.requested_by)}</RRow>
              <RRow label="Project">{projectLabel(detail.project_id)}</RRow>
              <RRow label="Status">
                {detail.status === "rejected"
                  ? <Badge variant="destructive">Rejected</Badge>
                  : detail.status === "pending"
                    ? <Badge variant="outline">Pending</Badge>
                    : <Badge className={statusBadgeClass[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>}
              </RRow>
              {detail.reason && <RRow label="Reason"><span className="whitespace-pre-wrap">{detail.reason}</span></RRow>}
              {detail.review_note && <RRow label="Review note">{detail.review_note}</RRow>}
              <RRow label="Submitted (date & time)">{new Date(detail.created_at).toLocaleString()}</RRow>
              {detail.reviewed_by && <RRow label="Reviewed by">{requesterLabel(detail.reviewed_by)}</RRow>}
              {detail.reviewed_at && <RRow label="Reviewed at">{new Date(detail.reviewed_at).toLocaleString()}</RRow>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const RRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-3 border-b border-border/60 py-1.5 last:border-0">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="col-span-2">{children}</div>
  </div>
);

export default Requests;
