import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface Row { id: string; user_id: string|null; table_name: string; record_id: string|null; action: string; changes: any; created_at: string }

const AdminAudit = () => {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [rows, setRows] = useState<Row[]>([]);
  const [users, setUsers] = useState<Map<string,string>>(new Map());
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data }, { data: profs }] = await Promise.all([
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id, email"),
    ]);
    setRows((data ?? []) as Row[]);
    setUsers(new Map((profs ?? []).map((p: any) => [p.id, p.email])));
  };

  useEffect(() => { load(); }, []);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    const { error } = await supabase.from("audit_log").delete().eq("id", toDelete);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Log entry deleted");
    setToDelete(null);
    load();
  };

  const clearAll = async () => {
    setBusy(true);
    const { error } = await supabase.from("audit_log").delete().not("id", "is", null);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Audit log cleared");
    setClearAllOpen(false);
    load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description="All changes to items, categories, warehouses, movements, and roles."
        actions={isAdmin && rows.length > 0 ? (
          <Button variant="destructive" size="sm" onClick={() => setClearAllOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Clear all
          </Button>
        ) : undefined}
      />
      <Card className="glass-card">
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Record</TableHead>
                {isAdmin && <TableHead className="w-16 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{users.get(r.user_id ?? "") ?? "system"}</TableCell>
                  <TableCell><Badge variant="outline">{r.table_name}</Badge></TableCell>
                  <TableCell><Badge className={r.action === "DELETE" ? "bg-destructive/20 text-destructive" : r.action === "UPDATE" ? "bg-warning/20 text-warning" : "bg-primary/20 text-primary"}>{r.action}</Badge></TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">{r.record_id?.slice(0,8)}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setToDelete(r.id)} aria-label="Delete log entry">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="py-10 text-center text-muted-foreground">No activity yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
