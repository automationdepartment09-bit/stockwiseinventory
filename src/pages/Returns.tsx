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
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Check, X, Trash2, Download, FileSearch, Paperclip, Undo2, Printer } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ItemPicker } from "@/components/ItemPicker";
import { FilterBar, FilterValues, EMPTY_FILTERS, matchesQuery, inDateRange } from "@/components/FilterBar";
import { printReceipt, receiptNo } from "@/lib/receipt";
import { MultiLineItems, LineItem, emptyLine, newBatchRef } from "@/components/MultiLineItems";

type Status = "pending" | "completed" | "cancelled";
type Condition = "good" | "damaged" | "lost" | "partial";

interface ReturnRow {
  id: string;
  withdrawal_id: string | null;
  item_id: string;
  warehouse_id: string;
  project_id: string | null;
  quantity: number;
  returned_by_user_id: string | null;
  returned_by_name: string | null;
  return_date: string;
  condition: Condition;
  notes: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  status: Status;
  created_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  batch_ref: string | null;
}

interface WithdrawalLite {
  id: string;
  item_id: string;
  warehouse_id: string;
  project_id: string | null;
  quantity: number;
  purpose: string;
  withdrawal_date: string;
  return_expected: boolean;
  expected_return_date: string | null;
  withdrawn_by_user_id: string | null;
  withdrawn_by_name: string | null;
}

const statusBadge: Record<Status, string> = {
  pending: "bg-warning/20 text-warning",
  completed: "bg-success/20 text-success",
  cancelled: "bg-muted text-muted-foreground",
};

const conditionBadge: Record<Condition, string> = {
  good: "bg-success/20 text-success",
  partial: "bg-warning/20 text-warning",
  damaged: "bg-destructive/20 text-destructive",
  lost: "bg-destructive/20 text-destructive",
};

const Returns = () => {
  const { user, hasRole } = useAuth();
  const canCreate = hasRole("admin", "manager", "staff");
  const canReview = hasRole("admin", "manager");
  const isAdmin = hasRole("admin");

  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [items, setItems] = useState<{ id: string; name: string; sku: string; barcode: string | null; ref_number: string | null; category_id: string | null }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalLite[]>([]);

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [view, setView] = useState<ReturnRow | null>(null);
  const [reviewing, setReviewing] = useState<ReturnRow | null>(null);
  const [reviewAction, setReviewAction] = useState<"complete" | "cancel">("complete");
  const [reviewNote, setReviewNote] = useState("");
  const [toDelete, setToDelete] = useState<ReturnRow | null>(null);

  // form state
  const [fWithdrawal, setFWithdrawal] = useState<string>("__none__");
  const [fLines, setFLines] = useState<LineItem[]>([emptyLine()]);
  const [fWarehouse, setFWarehouse] = useState("");
  const [fProject, setFProject] = useState<string>("__none__");
  const [fByUser, setFByUser] = useState<string>("__none__");
  const [fByName, setFByName] = useState("");
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fCondition, setFCondition] = useState<Condition>("good");
  const [fNotes, setFNotes] = useState("");
  const [fFile, setFFile] = useState<File | null>(null);

  const loadAll = async () => {
    const [r, it, wh, pf, pj, wd, cat] = await Promise.all([
      supabase.from("returns").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("items").select("id,name,sku,barcode,ref_number,category_id").eq("is_active", true).order("name"),
      supabase.from("warehouses").select("id,name").eq("is_active", true).order("name"),
      isAdmin
        ? supabase.from("profiles").select("id,full_name,email").order("full_name")
        : Promise.resolve({ data: [{ id: user!.id, full_name: user!.user_metadata?.full_name ?? null, email: user!.email ?? null }] } as any),
      supabase.from("projects").select("id,name,code").eq("is_active", true).order("name"),
      supabase.from("withdrawals").select("id,item_id,warehouse_id,project_id,quantity,purpose,withdrawal_date,return_expected,expected_return_date,withdrawn_by_user_id,withdrawn_by_name").eq("status", "approved").order("created_at", { ascending: false }).limit(500),
      supabase.from("categories").select("id,name").order("name"),
    ]);
    setRows((r.data ?? []) as ReturnRow[]);
    setItems((it.data ?? []) as any);
    setWarehouses(wh.data ?? []);
    setUsers((pf.data ?? []) as any);
    setProjects((pj.data ?? []) as any);
    setWithdrawals((wd.data ?? []) as WithdrawalLite[]);
    setCategories(cat.data ?? []);
  };

  useEffect(() => { loadAll(); }, []);

  const itemMap = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const whMap = useMemo(() => Object.fromEntries(warehouses.map((w) => [w.id, w])), [warehouses]);
  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const projectMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const wdMap = useMemo(() => Object.fromEntries(withdrawals.map((w) => [w.id, w])), [withdrawals]);

  const applyFilters = (list: ReturnRow[]) => list.filter((r) => {
    if (filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.warehouse !== "all" && r.warehouse_id !== filters.warehouse) return false;
    if (filters.project !== "all") {
      if (filters.project === "__none__" ? r.project_id !== null : r.project_id !== filters.project) return false;
    }
    if (filters.requester !== "all" && r.created_by !== filters.requester) return false;
    if (!inDateRange(r.return_date, filters.from, filters.to)) return false;
    const item = itemMap[r.item_id];
    if (filters.category !== "all" && item?.category_id !== filters.category) return false;
    const wh = whMap[r.warehouse_id];
    const by = r.returned_by_user_id ? (userMap[r.returned_by_user_id]?.full_name ?? userMap[r.returned_by_user_id]?.email) : r.returned_by_name;
    if (!matchesQuery(filters.q, [item?.name, item?.sku, item?.barcode, item?.ref_number, wh?.name, by, r.notes, r.condition])) return false;
    return true;
  });

  const returnsRows = useMemo(() => applyFilters(rows.filter((r) => r.condition !== "damaged" && r.condition !== "lost")), [rows, filters, itemMap, whMap, userMap]);
  const damagesRows = useMemo(() => applyFilters(rows.filter((r) => r.condition === "damaged" || r.condition === "lost")), [rows, filters, itemMap, whMap, userMap]);

  const resetForm = () => {
    setFWithdrawal("__none__"); setFLines([emptyLine()]); setFWarehouse(""); setFProject("__none__");
    setFByUser("__none__"); setFByName("");
    setFDate(new Date().toISOString().slice(0, 10));
    setFCondition("good"); setFNotes(""); setFFile(null);
  };

  // Auto-fill when picking a withdrawal
  const onPickWithdrawal = (id: string) => {
    setFWithdrawal(id);
    if (id === "__none__") return;
    const w = wdMap[id];
    if (!w) return;
    setFLines([{ item_id: w.item_id, quantity: w.quantity }]);
    setFWarehouse(w.warehouse_id);
    setFProject(w.project_id ?? "__none__");
    if (w.withdrawn_by_user_id) setFByUser(w.withdrawn_by_user_id);
    else if (w.withdrawn_by_name) setFByName(w.withdrawn_by_name);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = fLines.filter((l) => l.item_id && l.quantity > 0);
    if (!fWarehouse || valid.length === 0) return toast.error("Warehouse and at least one item are required");
    if (fByUser === "__none__" && !fByName.trim()) return toast.error("Pick a user or enter a name");
    setSubmitting(true);

    let attachment_url: string | null = null;
    let attachment_name: string | null = null;
    if (fFile) {
      const ext = fFile.name.split(".").pop() ?? "bin";
      const path = `returns/${user?.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const up = await supabase.storage.from("chat-attachments").upload(path, fFile, { contentType: fFile.type });
      if (up.error) { setSubmitting(false); return toast.error(up.error.message); }
      const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(path, 60 * 60 * 24 * 365);
      attachment_url = data?.signedUrl ?? null;
      attachment_name = fFile.name;
    }

    const batch_ref = valid.length > 1 ? newBatchRef("RET") : null;
    const payload = valid.map((l) => ({
      withdrawal_id: fWithdrawal === "__none__" ? null : fWithdrawal,
      item_id: l.item_id,
      warehouse_id: fWarehouse,
      project_id: fProject === "__none__" ? null : fProject,
      quantity: l.quantity,
      returned_by_user_id: fByUser === "__none__" ? null : fByUser,
      returned_by_name: fByName.trim() || null,
      return_date: fDate,
      condition: fCondition,
      notes: fNotes.trim() || null,
      attachment_url,
      attachment_name,
      created_by: user!.id,
      batch_ref,
    }));
    const { error } = await supabase.from("returns").insert(payload);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(valid.length > 1 ? `${valid.length} returns logged (batch ${batch_ref})` : "Return logged");
    setOpen(false); resetForm(); loadAll();
  };

  const cancelOwn = async (r: ReturnRow) => {
    const { error } = await supabase.from("returns").update({ status: "cancelled" }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Cancelled"); loadAll();
  };

  const submitReview = async () => {
    if (!reviewing) return;
    const { error } = await supabase.from("returns").update({
      status: reviewAction === "complete" ? "completed" : "cancelled",
      reviewed_by: user!.id,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote.trim() || null,
    }).eq("id", reviewing.id);
    if (error) return toast.error(error.message);
    toast.success(reviewAction === "complete" ? "Completed — stock updated" : "Cancelled");
    setReviewing(null); setReviewNote(""); loadAll();
  };

  const remove = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("returns").delete().eq("id", toDelete.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); setToDelete(null); loadAll();
  };

  const exportCsv = () => {
    const header = ["Date","Item","SKU","Warehouse","Qty","Returned by","Condition","Status","Notes"];
    const lines = [header.join(",")].concat(
      filtered.map((r) => {
        const item = itemMap[r.item_id];
        const wh = whMap[r.warehouse_id];
        const by = r.returned_by_user_id ? (userMap[r.returned_by_user_id]?.full_name ?? userMap[r.returned_by_user_id]?.email ?? "User") : r.returned_by_name;
        return [
          r.return_date, item?.name ?? "", item?.sku ?? "", wh?.name ?? "", r.quantity,
          by ?? "", r.condition, r.status, (r.notes ?? "").replace(/\n/g, " "),
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
      }),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `returns-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const byLabel = (r: ReturnRow) => {
    if (r.returned_by_user_id) {
      const u = userMap[r.returned_by_user_id];
      return u?.full_name || u?.email || "User";
    }
    return r.returned_by_name ?? "—";
  };

  const printReturn = (r: ReturnRow) => {
    const siblings = r.batch_ref ? rows.filter((x) => x.batch_ref === r.batch_ref) : [r];
    const wh = whMap[r.warehouse_id];
    const proj = r.project_id ? projectMap[r.project_id] : null;
    const totalQty = siblings.reduce((s, x) => s + x.quantity, 0);
    printReceipt({
      kind: "return",
      receiptNo: r.batch_ref ?? receiptNo("RET", r.id),
      title: "Return slip",
      subtitle: `Status: ${r.status.toUpperCase()} · Condition: ${r.condition}${siblings.length > 1 ? ` · ${siblings.length} items · total qty ${totalQty}` : ""}`,
      date: r.return_date,
      fields: [
        { label: "Warehouse", value: wh?.name },
        { label: "Returned by", value: byLabel(r) },
        { label: "Condition", value: r.condition },
        { label: "Linked withdrawal", value: r.withdrawal_id ? receiptNo("WTH", r.withdrawal_id) : "—" },
        { label: "Project", value: proj ? `${proj.code ? proj.code + " · " : ""}${proj.name}` : "—" },
        { label: "Submitted", value: new Date(r.created_at).toLocaleString() },
        { label: "Reviewed", value: r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : "—" },
        { label: "Batch", value: r.batch_ref || "—" },
        { label: "Review note", value: r.review_note || "", full: true },
      ],
      lineItems: siblings.map((x) => {
        const it = itemMap[x.item_id];
        return { name: it?.name ?? "Item", sku: it?.sku, qty: x.quantity, note: x.condition };
      }),
      notes: r.notes || undefined,
      signatures: ["Returned by", "Received by"],
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Returns"
        description="Log items returned from withdrawals and restore stock when completed."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export</Button>
            {canCreate && (
              <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
                <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New return</Button></DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>New return</DialogTitle></DialogHeader>
                  <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Linked withdrawal (optional)</Label>
                      <Select value={fWithdrawal} onValueChange={onPickWithdrawal}>
                        <SelectTrigger><SelectValue placeholder="Select an approved withdrawal" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— None / standalone —</SelectItem>
                          {withdrawals.map((w) => {
                            const it = itemMap[w.item_id];
                            return (
                              <SelectItem key={w.id} value={w.id}>
                                {w.withdrawal_date} · {it?.sku ?? ""} {it?.name ?? "Item"} · {w.quantity} · {w.purpose}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Warehouse *</Label>
                      <Select value={fWarehouse} onValueChange={setFWarehouse}>
                        <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                        <SelectContent>{warehouses.map((w) => (<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <MultiLineItems value={fLines} onChange={setFLines} warehouseId={fWarehouse || undefined} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Return date *</Label>
                      <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Condition *</Label>
                      <Select value={fCondition} onValueChange={(v) => setFCondition(v as Condition)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="good">Good (back to stock)</SelectItem>
                          <SelectItem value="partial">Partial (back to stock)</SelectItem>
                          <SelectItem value="damaged">Damaged (no restock)</SelectItem>
                          <SelectItem value="lost">Lost (no restock)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Project</Label>
                      <Select value={fProject} onValueChange={setFProject}>
                        <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— No project —</SelectItem>
                          {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ""}{p.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Returned by (user)</Label>
                      <Select value={fByUser} onValueChange={setFByUser}>
                        <SelectTrigger><SelectValue placeholder="Select user (optional)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— External / use name —</SelectItem>
                          {users.map((u) => (<SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Or enter name</Label>
                      <Input value={fByName} onChange={(e) => setFByName(e.target.value)} placeholder="e.g. John (contractor)" maxLength={120} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Notes</Label>
                      <Textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} rows={3} maxLength={1000} placeholder="Optional details" />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="flex items-center gap-2"><Paperclip className="h-3.5 w-3.5" /> Attachment</Label>
                      <Input type="file" onChange={(e) => setFFile(e.target.files?.[0] ?? null)} accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,text/*" />
                    </div>
                    <DialogFooter className="sm:col-span-2">
                      <Button type="submit" disabled={submitting}>{submitting ? "Submitting..." : "Submit return"}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </>
        }
      />

      <Card className="glass-card">
        <CardContent className="space-y-3 pt-4">
          <FilterBar
            values={filters}
            onChange={setFilters}
            searchPlaceholder="Search item, SKU, barcode, person, notes…"
            show={{ q: true, category: true, warehouse: true, status: true, project: true, requester: isAdmin, from: true, to: true }}
            categories={categories.map((c) => ({ value: c.id, label: c.name }))}
            warehouses={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            statuses={[
              { value: "pending", label: "Pending" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
            projects={projects.map((p) => ({ value: p.id, label: p.code ? `${p.code} · ${p.name}` : p.name }))}
            requesters={users.map((u) => ({ value: u.id, label: u.full_name || u.email || "User" }))}
            rightSlot={<span className="ml-auto text-xs text-muted-foreground">{filtered.length} record(s)</span>}
          />


          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Returned by</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No returns yet.</TableCell></TableRow>
                )}
                {filtered.map((r) => {
                  const item = itemMap[r.item_id];
                  const wh = whMap[r.warehouse_id];
                  const isOwner = r.created_by === user?.id;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        <div>{r.return_date}</div>
                        <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{item?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{item?.sku}</div>
                      </TableCell>
                      <TableCell>{wh?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                      <TableCell>{byLabel(r)}</TableCell>
                      <TableCell><Badge className={conditionBadge[r.condition]} variant="outline">{r.condition}</Badge></TableCell>
                      <TableCell><Badge className={statusBadge[r.status]} variant="outline">{r.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setView(r)} title="Details">
                            <FileSearch className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => printReturn(r)} title="Print receipt">
                            <Printer className="h-4 w-4" />
                          </Button>
                          {r.status === "pending" && canReview && (
                            <>
                              <Button size="icon" variant="ghost" title="Complete" onClick={() => { setReviewing(r); setReviewAction("complete"); setReviewNote(""); }}>
                                <Check className="h-4 w-4 text-success" />
                              </Button>
                              <Button size="icon" variant="ghost" title="Cancel" onClick={() => { setReviewing(r); setReviewAction("cancel"); setReviewNote(""); }}>
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                          {r.status === "pending" && isOwner && !canReview && (
                            <Button size="icon" variant="ghost" title="Cancel" onClick={() => cancelOwn(r)}>
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button size="icon" variant="ghost" title="Delete" onClick={() => setToDelete(r)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Return details</DialogTitle></DialogHeader>
          {view && (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Date:</span> {view.return_date}</div>
                <div><span className="text-muted-foreground">Logged:</span> {new Date(view.created_at).toLocaleString()}</div>
                <div><span className="text-muted-foreground">Item:</span> {itemMap[view.item_id]?.name}</div>
                <div><span className="text-muted-foreground">SKU:</span> {itemMap[view.item_id]?.sku}</div>
                <div><span className="text-muted-foreground">Warehouse:</span> {whMap[view.warehouse_id]?.name}</div>
                <div><span className="text-muted-foreground">Quantity:</span> {view.quantity}</div>
                <div><span className="text-muted-foreground">Condition:</span> <Badge className={conditionBadge[view.condition]} variant="outline">{view.condition}</Badge></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className={statusBadge[view.status]} variant="outline">{view.status}</Badge></div>
                <div><span className="text-muted-foreground">Returned by:</span> {byLabel(view)}</div>
                {view.project_id && <div><span className="text-muted-foreground">Project:</span> {projectMap[view.project_id]?.name}</div>}
                {view.withdrawal_id && <div className="col-span-2"><span className="text-muted-foreground">Withdrawal:</span> {view.withdrawal_id.slice(0, 8)}…</div>}
              </div>
              {view.notes && <div><span className="text-muted-foreground">Notes:</span><div className="mt-1 whitespace-pre-wrap">{view.notes}</div></div>}
              {view.attachment_url && (
                <div><a className="text-primary underline" href={view.attachment_url} target="_blank" rel="noreferrer">{view.attachment_name ?? "Attachment"}</a></div>
              )}
              {view.reviewed_at && (
                <div className="rounded-md border p-2 text-xs">
                  <div>Reviewed by {view.reviewed_by ? (userMap[view.reviewed_by]?.full_name || userMap[view.reviewed_by]?.email || "—") : "—"} on {new Date(view.reviewed_at).toLocaleString()}</div>
                  {view.review_note && <div className="mt-1">Note: {view.review_note}</div>}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Review */}
      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{reviewAction === "complete" ? "Complete return" : "Cancel return"}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {reviewing && reviewAction === "complete" && ["good","partial"].includes(reviewing.condition) && (
              <p className="text-sm text-muted-foreground">Completing this return will add <strong>{reviewing.quantity}</strong> unit(s) back into stock.</p>
            )}
            <Label>Note (optional)</Label>
            <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3} maxLength={500} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewing(null)}>Close</Button>
            <Button onClick={submitReview}>{reviewAction === "complete" ? "Complete" : "Cancel return"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete return?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the return record. Stock movements created on completion remain.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Returns;
