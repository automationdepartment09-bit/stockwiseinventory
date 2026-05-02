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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Check, X, Trash2, Download, FileSearch, Paperclip, Printer } from "lucide-react";
import { toast } from "sonner";
import { ItemPicker } from "@/components/ItemPicker";
import { FilterBar, FilterValues, EMPTY_FILTERS, matchesQuery, inDateRange } from "@/components/FilterBar";
import { printReceipt, receiptNo } from "@/lib/receipt";

type Status = "pending" | "approved" | "rejected" | "cancelled";
interface Withdrawal {
  id: string;
  item_id: string;
  warehouse_id: string;
  quantity: number;
  withdrawn_by_user_id: string | null;
  withdrawn_by_name: string | null;
  purpose: string;
  project_reference: string | null;
  project_id: string | null;
  withdrawal_date: string;
  return_expected: boolean;
  expected_return_date: string | null;
  notes: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  status: Status;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

const statusBadge: Record<Status, string> = {
  pending: "bg-warning/20 text-warning",
  approved: "bg-success/20 text-success",
  rejected: "bg-destructive/20 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const Withdrawals = () => {
  const { user, hasRole } = useAuth();
  const canCreate = hasRole("admin", "manager", "staff");
  const canReview = hasRole("admin", "manager");
  const isAdmin = hasRole("admin");

  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [items, setItems] = useState<{ id: string; name: string; sku: string; barcode: string | null; ref_number: string | null; category_id: string | null }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [view, setView] = useState<Withdrawal | null>(null);
  const [reviewing, setReviewing] = useState<Withdrawal | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [reviewNote, setReviewNote] = useState("");
  const [toDelete, setToDelete] = useState<Withdrawal | null>(null);

  // form state
  const [fItem, setFItem] = useState("");
  const [fWarehouse, setFWarehouse] = useState("");
  const [fQty, setFQty] = useState<number>(1);
  const [fByUser, setFByUser] = useState<string>("__none__");
  const [fByName, setFByName] = useState("");
  const [fPurpose, setFPurpose] = useState("");
  const [fRef, setFRef] = useState("");
  const [fProject, setFProject] = useState<string>("__none__");
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fReturn, setFReturn] = useState(false);
  const [fReturnDate, setFReturnDate] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fFile, setFFile] = useState<File | null>(null);

  const loadAll = async () => {
    const [w, it, wh, pf, pj, cat] = await Promise.all([
      supabase.from("withdrawals").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("items").select("id,name,sku,barcode,ref_number,category_id").eq("is_active", true).order("name"),
      supabase.from("warehouses").select("id,name").eq("is_active", true).order("name"),
      isAdmin
        ? supabase.from("profiles").select("id,full_name,email").order("full_name")
        : Promise.resolve({ data: [{ id: user!.id, full_name: user!.user_metadata?.full_name ?? null, email: user!.email ?? null }] } as any),
      supabase.from("projects").select("id,name,code").eq("is_active", true).order("name"),
      supabase.from("categories").select("id,name").order("name"),
    ]);
    setRows((w.data ?? []) as Withdrawal[]);
    setItems((it.data ?? []) as any);
    setWarehouses(wh.data ?? []);
    setUsers((pf.data ?? []) as any);
    setProjects((pj.data ?? []) as any);
    setCategories(cat.data ?? []);
  };

  useEffect(() => { loadAll(); }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const itemParam = searchParams.get("item");
    if (itemParam && items.some((i) => i.id === itemParam) && canCreate) {
      setFItem(itemParam);
      setOpen(true);
      searchParams.delete("item");
      setSearchParams(searchParams, { replace: true });
    }
  }, [items, searchParams, canCreate, setSearchParams]);

  const itemMap = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const whMap = useMemo(() => Object.fromEntries(warehouses.map((w) => [w.id, w])), [warehouses]);
  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const projectMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filters.status !== "all" && r.status !== filters.status) return false;
      if (filters.warehouse !== "all" && r.warehouse_id !== filters.warehouse) return false;
      if (filters.project !== "all") {
        if (filters.project === "__none__" ? r.project_id !== null : r.project_id !== filters.project) return false;
      }
      if (filters.requester !== "all" && r.requested_by !== filters.requester) return false;
      if (!inDateRange(r.withdrawal_date, filters.from, filters.to)) return false;
      const item = itemMap[r.item_id];
      if (filters.category !== "all" && item?.category_id !== filters.category) return false;
      const wh = whMap[r.warehouse_id];
      const by = r.withdrawn_by_user_id ? (userMap[r.withdrawn_by_user_id]?.full_name ?? userMap[r.withdrawn_by_user_id]?.email) : r.withdrawn_by_name;
      if (!matchesQuery(filters.q, [item?.name, item?.sku, item?.barcode, item?.ref_number, wh?.name, by, r.purpose, r.project_reference, r.notes])) return false;
      return true;
    });
  }, [rows, filters, itemMap, whMap, userMap]);

  const resetForm = () => {
    setFItem(""); setFWarehouse(""); setFQty(1);
    setFByUser("__none__"); setFByName("");
    setFPurpose(""); setFRef(""); setFProject("__none__"); setFDate(new Date().toISOString().slice(0, 10));
    setFReturn(false); setFReturnDate(""); setFNotes(""); setFFile(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fItem || !fWarehouse || !fPurpose.trim()) return toast.error("Item, warehouse and purpose are required");
    if (fByUser === "__none__" && !fByName.trim()) return toast.error("Pick a user or enter a name");
    if (fReturn && !fReturnDate) return toast.error("Pick the expected return date");
    setSubmitting(true);

    let attachment_url: string | null = null;
    let attachment_name: string | null = null;
    if (fFile) {
      const ext = fFile.name.split(".").pop() ?? "bin";
      const path = `withdrawals/${user?.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const up = await supabase.storage.from("chat-attachments").upload(path, fFile, { contentType: fFile.type });
      if (up.error) { setSubmitting(false); return toast.error(up.error.message); }
      const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(path, 60 * 60 * 24 * 365);
      attachment_url = data?.signedUrl ?? null;
      attachment_name = fFile.name;
    }

    const { error } = await supabase.from("withdrawals").insert({
      item_id: fItem,
      warehouse_id: fWarehouse,
      quantity: fQty,
      withdrawn_by_user_id: fByUser === "__none__" ? null : fByUser,
      withdrawn_by_name: fByName.trim() || null,
      purpose: fPurpose.trim(),
      project_reference: fRef.trim() || null,
      project_id: fProject === "__none__" ? null : fProject,
      withdrawal_date: fDate,
      return_expected: fReturn,
      expected_return_date: fReturn ? fReturnDate : null,
      notes: fNotes.trim() || null,
      attachment_url,
      attachment_name,
      requested_by: user!.id,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Withdrawal submitted for approval");
    setOpen(false); resetForm(); loadAll();
  };

  const cancelOwn = async (w: Withdrawal) => {
    const { error } = await supabase.from("withdrawals").update({ status: "cancelled" }).eq("id", w.id);
    if (error) return toast.error(error.message);
    toast.success("Cancelled"); loadAll();
  };

  const submitReview = async () => {
    if (!reviewing) return;
    const { error } = await supabase.from("withdrawals").update({
      status: reviewAction === "approve" ? "approved" : "rejected",
      reviewed_by: user!.id,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote.trim() || null,
    }).eq("id", reviewing.id);
    if (error) return toast.error(error.message);
    toast.success(reviewAction === "approve" ? "Approved & stock deducted" : "Rejected");
    setReviewing(null); setReviewNote(""); loadAll();
  };

  const remove = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("withdrawals").delete().eq("id", toDelete.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); setToDelete(null); loadAll();
  };

  const exportCsv = () => {
    const header = ["Date","Item","SKU","Warehouse","Qty","Withdrawn by","Purpose","Project ref","Status","Return by","Notes"];
    const lines = [header.join(",")].concat(
      filtered.map((r) => {
        const item = itemMap[r.item_id];
        const wh = whMap[r.warehouse_id];
        const by = r.withdrawn_by_user_id ? (userMap[r.withdrawn_by_user_id]?.full_name ?? userMap[r.withdrawn_by_user_id]?.email ?? "User") : r.withdrawn_by_name;
        return [
          r.withdrawal_date, item?.name ?? "", item?.sku ?? "", wh?.name ?? "", r.quantity,
          by ?? "", r.purpose, r.project_reference ?? "", r.status,
          r.expected_return_date ?? "", (r.notes ?? "").replace(/\n/g, " "),
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
      }),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `withdrawals-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const byLabel = (r: Withdrawal) => {
    if (r.withdrawn_by_user_id) {
      const u = userMap[r.withdrawn_by_user_id];
      return u?.full_name || u?.email || "User";
    }
    return r.withdrawn_by_name ?? "—";
  };

  const printWithdrawal = (r: Withdrawal) => {
    const it = itemMap[r.item_id];
    const wh = whMap[r.warehouse_id];
    const proj = r.project_id ? projectMap[r.project_id] : null;
    printReceipt({
      kind: "withdrawal",
      receiptNo: receiptNo("WTH", r.id),
      title: r.return_expected ? "Borrow / Withdrawal slip" : "Withdrawal slip",
      subtitle: `Status: ${r.status.toUpperCase()}`,
      date: r.withdrawal_date,
      fields: [
        { label: "Warehouse", value: wh?.name },
        { label: "Withdrawn by", value: byLabel(r) },
        { label: "Project", value: proj ? `${proj.code ? proj.code + " · " : ""}${proj.name}` : "—" },
        { label: "Project ref", value: r.project_reference || "—" },
        { label: "Return expected", value: r.return_expected ? `Yes — by ${r.expected_return_date ?? "—"}` : "No" },
        { label: "Submitted", value: new Date(r.created_at).toLocaleString() },
        { label: "Reviewed", value: r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : "—" },
        { label: "Purpose", value: r.purpose, full: true },
        { label: "Review note", value: r.review_note || "" , full: true },
      ],
      lineItems: [{ name: it?.name ?? "Item", sku: it?.sku, qty: r.quantity }],
      notes: r.notes || undefined,
      signatures: r.return_expected
        ? ["Issued by", "Borrower", "Returned to"]
        : ["Issued by", "Received by"],
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Withdrawals"
        description="Track items withdrawn from stock with full audit trail and approval flow."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export</Button>
            {canCreate && (
              <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
                <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New withdrawal</Button></DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>New withdrawal</DialogTitle></DialogHeader>
                  <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Item *</Label>
                      <ItemPicker value={fItem} onChange={setFItem} warehouseId={fWarehouse || undefined} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Warehouse *</Label>
                      <Select value={fWarehouse} onValueChange={setFWarehouse}>
                        <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                        <SelectContent>{warehouses.map((w) => (<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Quantity *</Label>
                      <Input type="number" min={1} value={fQty} onChange={(e) => setFQty(Number(e.target.value))} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Date *</Label>
                      <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Withdrawn by (user)</Label>
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
                      <Label>Purpose *</Label>
                      <Input value={fPurpose} onChange={(e) => setFPurpose(e.target.value)} placeholder="What is this for?" required maxLength={300} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Project</Label>
                      <Select value={fProject} onValueChange={setFProject}>
                        <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— No project —</SelectItem>
                          {projects.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ""}{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Project / job reference</Label>
                      <Input value={fRef} onChange={(e) => setFRef(e.target.value)} placeholder="PO #, ticket, custom ref" maxLength={120} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-2">
                        <Checkbox checked={fReturn} onCheckedChange={(v) => setFReturn(Boolean(v))} />
                        Return expected
                      </Label>
                      {fReturn && (
                        <Input type="date" value={fReturnDate} onChange={(e) => setFReturnDate(e.target.value)} required />
                      )}
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
                      <Button type="submit" disabled={submitting}>{submitting ? "Submitting..." : "Submit for approval"}</Button>
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
            searchPlaceholder="Search item, SKU, barcode, person, purpose…"
            show={{ q: true, category: true, warehouse: true, status: true, project: true, requester: isAdmin, from: true, to: true }}
            categories={categories.map((c) => ({ value: c.id, label: c.name }))}
            warehouses={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            statuses={[
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
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
                  <TableHead>Withdrawn by</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No withdrawals.</TableCell></TableRow>
                )}
                {filtered.map((r) => {
                  const it = itemMap[r.item_id];
                  const wh = whMap[r.warehouse_id];
                  const isOwner = r.requested_by === user?.id;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        <div>{r.withdrawal_date}</div>
                        <div className="text-[10px] tabular-nums text-muted-foreground">submitted {new Date(r.created_at).toLocaleTimeString()} · {new Date(r.created_at).toLocaleDateString()}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{it?.name ?? "—"}</div>
                        <div className="text-[10px] text-muted-foreground">{it?.sku}</div>
                      </TableCell>
                      <TableCell>{wh?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                      <TableCell>{byLabel(r)}</TableCell>
                      <TableCell className="max-w-[260px] truncate" title={r.purpose}>{r.purpose}</TableCell>
                      <TableCell><Badge className={statusBadge[r.status]}>{r.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setView(r)} title="Details"><FileSearch className="h-4 w-4" /></Button>
                          {canReview && r.status === "pending" && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => { setReviewing(r); setReviewAction("approve"); setReviewNote(""); }} title="Approve"><Check className="h-4 w-4 text-success" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => { setReviewing(r); setReviewAction("reject"); setReviewNote(""); }} title="Reject"><X className="h-4 w-4 text-destructive" /></Button>
                            </>
                          )}
                          {isOwner && r.status === "pending" && !canReview && (
                            <Button size="sm" variant="ghost" onClick={() => cancelOwn(r)} title="Cancel"><X className="h-4 w-4" /></Button>
                          )}
                          {isAdmin && (
                            <Button size="sm" variant="ghost" onClick={() => setToDelete(r)} title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
          <DialogHeader><DialogTitle>Withdrawal details</DialogTitle></DialogHeader>
          {view && (
            <div className="space-y-2 text-sm">
              <Row label="Withdrawal date">{view.withdrawal_date}</Row>
              <Row label="Submitted at">{new Date(view.created_at).toLocaleString()}</Row>
              <Row label="Item">{itemMap[view.item_id]?.name} <span className="text-muted-foreground">({itemMap[view.item_id]?.sku})</span></Row>
              <Row label="Warehouse">{whMap[view.warehouse_id]?.name}</Row>
              <Row label="Quantity">{view.quantity}</Row>
              <Row label="Withdrawn by">{byLabel(view)}</Row>
              <Row label="Purpose">{view.purpose}</Row>
              {view.project_id && projectMap[view.project_id] && <Row label="Project">{projectMap[view.project_id].code ? `${projectMap[view.project_id].code} · ` : ""}{projectMap[view.project_id].name}</Row>}
              {view.project_reference && <Row label="Reference">{view.project_reference}</Row>}
              {view.return_expected && <Row label="Return by">{view.expected_return_date ?? "—"}</Row>}
              {view.notes && <Row label="Notes"><span className="whitespace-pre-wrap">{view.notes}</span></Row>}
              {view.attachment_url && (
                <Row label="Attachment">
                  <a className="underline" href={view.attachment_url} target="_blank" rel="noreferrer">{view.attachment_name ?? "Open"}</a>
                </Row>
              )}
              <Row label="Status"><Badge className={statusBadge[view.status]}>{view.status}</Badge></Row>
              {view.review_note && <Row label="Review note">{view.review_note}</Row>}
              {view.reviewed_at && <Row label="Reviewed at">{new Date(view.reviewed_at).toLocaleString()}</Row>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Review */}
      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{reviewAction === "approve" ? "Approve withdrawal" : "Reject withdrawal"}</DialogTitle></DialogHeader>
          {reviewing && (
            <div className="space-y-3 text-sm">
              <p>{reviewing.quantity} × <strong>{itemMap[reviewing.item_id]?.name}</strong> from <strong>{whMap[reviewing.warehouse_id]?.name}</strong> for <em>{reviewing.purpose}</em>.</p>
              {reviewAction === "approve" && (
                <p className="text-xs text-muted-foreground">Approving will deduct stock immediately and create a stock movement.</p>
              )}
              <div className="space-y-1.5">
                <Label>Note (optional)</Label>
                <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3} maxLength={500} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button onClick={submitReview} className={reviewAction === "reject" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}>
              {reviewAction === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this withdrawal?</AlertDialogTitle>
            <AlertDialogDescription>The audit record will be permanently removed. The stock movement (if approved) will remain.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-3 border-b py-1.5 last:border-0">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="col-span-2">{children}</div>
  </div>
);

export default Withdrawals;
