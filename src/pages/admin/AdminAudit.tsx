import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Download, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { FilterBar, FilterValues, EMPTY_FILTERS, inDateRange, matchesQuery } from "@/components/FilterBar";

interface Row { id: string; user_id: string|null; table_name: string; record_id: string|null; action: string; changes: any; created_at: string }

const PAGE_SIZE = 25;

const Diff = ({ changes, action }: { changes: any; action: string }) => {
  if (!changes) return <p className="text-sm text-muted-foreground">No payload.</p>;
  if (action === "UPDATE") {
    // Heuristic: if changes is a single jsonb object representing NEW row, just show fields.
    return (
      <div className="space-y-1 text-xs font-mono">
        {Object.entries(changes).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[140px_1fr] gap-2">
            <span className="text-muted-foreground">{k}</span>
            <span className="break-all">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <pre className="max-h-[60vh] overflow-auto rounded bg-muted/40 p-3 text-xs">
      {JSON.stringify(changes, null, 2)}
    </pre>
  );
};

const AdminAudit = () => {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [rows, setRows] = useState<Row[]>([]);
  const [users, setUsers] = useState<Map<string, string>>(new Map());
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Row | null>(null);

  const load = async () => {
    const [{ data }, { data: profs }] = await Promise.all([
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("profiles").select("id, email"),
    ]);
    setRows((data ?? []) as Row[]);
    setUsers(new Map((profs ?? []).map((p: any) => [p.id, p.email])));
  };
  useEffect(() => { load(); }, []);

  const tableOptions = useMemo(() => Array.from(new Set(rows.map(r => r.table_name))).sort(), [rows]);
  const userOptions = useMemo(() => {
    const ids = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean) as string[]));
    return ids.map(id => ({ value: id, label: users.get(id) ?? id.slice(0, 8) }));
  }, [rows, users]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (tableFilter !== "all" && r.table_name !== tableFilter) return false;
    if (actionFilter !== "all" && r.action !== actionFilter) return false;
    if (filters.requester !== "all" && r.user_id !== filters.requester) return false;
    if (!inDateRange(r.created_at, filters.from, filters.to)) return false;
    if (!matchesQuery(filters.q, [r.table_name, r.action, r.record_id, users.get(r.user_id ?? ""), JSON.stringify(r.changes ?? {})])) return false;
    return true;
  }), [rows, tableFilter, actionFilter, filters, users]);

  useEffect(() => { setPage(1); }, [tableFilter, actionFilter, filters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportCsv = () => {
    const head = ["When", "User", "Table", "Action", "Record ID", "Changes"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = filtered.map((r) => [
      new Date(r.created_at).toISOString(),
      users.get(r.user_id ?? "") ?? "system",
      r.table_name,
      r.action,
      r.record_id ?? "",
      JSON.stringify(r.changes ?? {}),
    ].map(esc).join(","));
    const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} entries`);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    const { error } = await supabase.from("audit_log").delete().eq("id", toDelete);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Log entry deleted");
    setToDelete(null); load();
  };
  const clearAll = async () => {
    setBusy(true);
    const { error } = await supabase.from("audit_log").delete().not("id", "is", null);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Audit log cleared");
    setClearAllOpen(false); load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description="All changes to items, categories, warehouses, movements, and roles."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            {isAdmin && rows.length > 0 && (
              <Button variant="destructive" size="sm" onClick={() => setClearAllOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Clear all
              </Button>
            )}
          </div>
        }
      />

      <Card className="glass-card">
        <CardContent className="space-y-4 p-4">
          <FilterBar
            values={filters}
            onChange={setFilters}
            searchPlaceholder="Search records, payload, IDs…"
            show={{ q: true, requester: true, from: true, to: true }}
            requesters={userOptions}
            rightSlot={
              <>
                <Select value={tableFilter} onValueChange={setTableFilter}>
                  <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tables</SelectItem>
                    {tableOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    <SelectItem value="INSERT">INSERT</SelectItem>
                    <SelectItem value="UPDATE">UPDATE</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Record</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{users.get(r.user_id ?? "") ?? "system"}</TableCell>
                  <TableCell><Badge variant="outline">{r.table_name}</Badge></TableCell>
                  <TableCell><Badge className={r.action === "DELETE" ? "bg-destructive/20 text-destructive" : r.action === "UPDATE" ? "bg-warning/20 text-warning" : "bg-primary/20 text-primary"}>{r.action}</Badge></TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">{r.record_id?.slice(0, 8)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setDetail(r)} aria-label="View changes" title="View">
                      <Eye className="h-4 w-4" />
                    </Button>
                    {isAdmin && (
                      <Button variant="ghost" size="icon" onClick={() => setToDelete(r.id)} aria-label="Delete log entry" title="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {paged.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No matching activity.</TableCell></TableRow>}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{filtered.length} entries</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>Page {page} / {pageCount}</span>
              <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="outline">{detail?.table_name}</Badge>
              <Badge>{detail?.action}</Badge>
              <span className="text-xs font-normal text-muted-foreground">{detail && new Date(detail.created_at).toLocaleString()}</span>
            </DialogTitle>
          </DialogHeader>
          {detail && <Diff changes={detail.changes} action={detail.action} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this log entry?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={busy} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the entire audit log?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete all audit entries. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={clearAll} disabled={busy} className="bg-destructive hover:bg-destructive/90">Clear all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
export default AdminAudit;
