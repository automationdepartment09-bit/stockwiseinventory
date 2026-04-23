import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface WH { id: string; name: string; code: string; location: string | null; is_active: boolean }

const Warehouses = () => {
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin", "manager");
  const isAdmin = hasRole("admin");
  const [rows, setRows] = useState<WH[]>([]);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<WH | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("warehouses").select("*").order("name");
    setRows((data ?? []) as WH[]);
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const code = String(fd.get("code") ?? "").trim().toUpperCase();
    const location = String(fd.get("location") ?? "").trim() || null;
    if (!name || !code) return toast.error("Name and code required");
    const { error } = await supabase.from("warehouses").insert({ name, code, location });
    if (error) return toast.error(error.message);
    toast.success("Warehouse created"); setOpen(false); load();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("warehouses").delete().eq("id", toDelete.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${toDelete.name}`);
    setToDelete(null);
    load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Warehouses"
        description="Multi-location inventory."
        actions={canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New warehouse</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create warehouse</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-3">
                <div className="space-y-1.5"><Label>Name</Label><Input name="name" required maxLength={100} /></div>
                <div className="space-y-1.5"><Label>Code</Label><Input name="code" required maxLength={20} placeholder="e.g. WH-MAIN" /></div>
                <div className="space-y-1.5"><Label>Location</Label><Input name="location" maxLength={200} /></div>
                <DialogFooter><Button type="submit">Create</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />
      <Card className="glass-card">
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono">{w.code}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{w.location ?? "—"}</TableCell>
                  <TableCell>{w.is_active ? <Badge className="bg-primary/20 text-primary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setToDelete(w)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" />Delete
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={isAdmin ? 5 : 4} className="py-10 text-center text-muted-foreground">No warehouses yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete warehouse?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <span className="font-medium text-foreground">{toDelete?.name}</span> and all its stock levels and movement history. This cannot be undone.
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
export default Warehouses;
