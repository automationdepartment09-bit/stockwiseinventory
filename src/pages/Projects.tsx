import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, FolderKanban } from "lucide-react";
import { toast } from "sonner";

interface Project {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

const Projects = () => {
  const { user, hasRole } = useAuth();
  const canManage = hasRole("admin", "manager");

  const [rows, setRows] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [fName, setFName] = useState("");
  const [fCode, setFCode] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fActive, setFActive] = useState(true);

  const load = async () => {
    const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setRows((data ?? []) as Project[]);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.code, r.description].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const reset = () => { setFName(""); setFCode(""); setFDesc(""); setFActive(true); setEditing(null); };

  const openEdit = (p: Project) => {
    setEditing(p);
    setFName(p.name); setFCode(p.code ?? ""); setFDesc(p.description ?? ""); setFActive(p.is_active);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fName.trim()) return toast.error("Name is required");
    setSubmitting(true);
    const payload = {
      name: fName.trim(),
      code: fCode.trim() || null,
      description: fDesc.trim() || null,
      is_active: fActive,
    };
    const { error } = editing
      ? await supabase.from("projects").update(payload).eq("id", editing.id)
      : await supabase.from("projects").insert({ ...payload, created_by: user!.id });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Project updated" : "Project created");
    setOpen(false); reset(); load();
  };

  const remove = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("projects").delete().eq("id", toDelete.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); setToDelete(null); load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Projects"
        description="Manage projects that withdrawals can be linked to."
        actions={canManage && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New project</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input value={fName} onChange={(e) => setFName(e.target.value)} required maxLength={120} />
                </div>
                <div className="space-y-1.5">
                  <Label>Code</Label>
                  <Input value={fCode} onChange={(e) => setFCode(e.target.value)} placeholder="e.g. PRJ-2026-01" maxLength={40} />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={3} maxLength={500} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={fActive} onCheckedChange={setFActive} id="proj-active" />
                  <Label htmlFor="proj-active">Active</Label>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>{submitting ? "Saving..." : editing ? "Save" : "Create"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />

      <Card className="glass-card">
        <CardContent className="space-y-3 pt-4">
          <Input placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={canManage ? 5 : 4} className="py-8 text-center text-sm text-muted-foreground"><FolderKanban className="mx-auto mb-2 h-6 w-6 opacity-50" />No projects yet.</TableCell></TableRow>
              )}
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-xs font-mono">{p.code ?? "—"}</TableCell>
                  <TableCell className="max-w-[420px] truncate text-muted-foreground">{p.description ?? "—"}</TableCell>
                  <TableCell>
                    {p.is_active
                      ? <Badge className="bg-success/20 text-success">Active</Badge>
                      : <Badge variant="outline">Inactive</Badge>}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setToDelete(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>"{toDelete?.name}" will be removed. Linked withdrawals will keep their data but lose the project link.</AlertDialogDescription>
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

export default Projects;
