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
import { Plus, Pencil, Trash2, FolderKanban, Boxes } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ItemPicker } from "@/components/ItemPicker";
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
  const [materialsFor, setMaterialsFor] = useState<Project | null>(null);
  const [matAuto, setMatAuto] = useState<any[]>([]);
  const [matManual, setMatManual] = useState<any[]>([]);
  const [itemMap, setItemMap] = useState<Map<string, { name: string; sku: string }>>(new Map());
  const [mItem, setMItem] = useState(""); const [mDesc, setMDesc] = useState("");
  const [mQty, setMQty] = useState<number>(1); const [mUnit, setMUnit] = useState(""); const [mCost, setMCost] = useState<number>(0);

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

  const openMaterials = async (p: Project) => {
    setMaterialsFor(p);
    setMatAuto([]); setMatManual([]); setMItem(""); setMDesc(""); setMQty(1); setMUnit(""); setMCost(0);
    const [wd, pm, its] = await Promise.all([
      supabase.from("withdrawals").select("id,item_id,quantity,withdrawal_date,status,purpose").eq("project_id", p.id),
      supabase.from("project_materials").select("*").eq("project_id", p.id).order("used_on", { ascending: false }),
      supabase.from("items").select("id,name,sku"),
    ]);
    setMatAuto((wd.data ?? []).filter((w: any) => w.status === "approved"));
    setMatManual(pm.data ?? []);
    setItemMap(new Map((its.data ?? []).map((i: any) => [i.id, { name: i.name, sku: i.sku }])));
  };

  const addManualMaterial = async () => {
    if (!materialsFor) return;
    if (!mItem && !mDesc.trim()) return toast.error("Pick an item or write a description");
    const { error } = await supabase.from("project_materials").insert({
      project_id: materialsFor.id, item_id: mItem || null, description: mDesc.trim() || null,
      quantity: mQty, unit: mUnit.trim() || null, unit_cost: mCost, created_by: user!.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Material logged");
    openMaterials(materialsFor);
  };

  const removeManual = async (id: string) => {
    const { error } = await supabase.from("project_materials").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (materialsFor) openMaterials(materialsFor);
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
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openMaterials(p)} title="Materials"><Boxes className="h-4 w-4" /></Button>
                    {canManage && <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>}
                    {canManage && <Button size="icon" variant="ghost" onClick={() => setToDelete(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                  </TableCell>
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

      <Dialog open={!!materialsFor} onOpenChange={(o) => !o && setMaterialsFor(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Materials — {materialsFor?.name}</DialogTitle>
          </DialogHeader>
          {materialsFor && (
            <Tabs defaultValue="auto">
              <TabsList>
                <TabsTrigger value="auto">From withdrawals ({matAuto.length})</TabsTrigger>
                <TabsTrigger value="manual">Manual entries ({matManual.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Purpose</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {matAuto.map((w) => {
                      const it = itemMap.get(w.item_id);
                      return (<TableRow key={w.id}>
                        <TableCell className="text-xs">{new Date(w.withdrawal_date).toLocaleDateString()}</TableCell>
                        <TableCell>{it?.name ?? "—"} <span className="ml-1 font-mono text-[10px] text-muted-foreground">{it?.sku}</span></TableCell>
                        <TableCell className="text-right">{w.quantity}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{w.purpose}</TableCell>
                      </TableRow>);
                    })}
                    {matAuto.length === 0 && (<TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No approved withdrawals linked.</TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="manual" className="space-y-3">
                {canManage && (
                  <div className="rounded border border-border/60 p-3 space-y-2">
                    <Label className="text-xs text-muted-foreground">Add material used</Label>
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-4"><ItemPicker value={mItem} onChange={setMItem} /></div>
                      <div className="col-span-3"><Input placeholder="…or description" value={mDesc} onChange={(e) => setMDesc(e.target.value)} /></div>
                      <div className="col-span-1"><Input type="number" min={0} value={mQty} onChange={(e) => setMQty(Number(e.target.value)||0)} placeholder="Qty" /></div>
                      <div className="col-span-1"><Input value={mUnit} onChange={(e) => setMUnit(e.target.value)} placeholder="Unit" /></div>
                      <div className="col-span-2"><Input type="number" step="0.01" value={mCost} onChange={(e) => setMCost(Number(e.target.value)||0)} placeholder="Unit cost ₱" /></div>
                      <div className="col-span-1"><Button onClick={addManualMaterial} className="w-full"><Plus className="h-4 w-4" /></Button></div>
                    </div>
                  </div>
                )}
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Item / Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Cost</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {matManual.map((m) => {
                      const it = m.item_id ? itemMap.get(m.item_id) : null;
                      return (<TableRow key={m.id}>
                        <TableCell className="text-xs">{new Date(m.used_on).toLocaleDateString()}</TableCell>
                        <TableCell>{it?.name ?? m.description ?? "—"}</TableCell>
                        <TableCell className="text-right">{m.quantity}{m.unit ? ` ${m.unit}` : ""}</TableCell>
                        <TableCell className="text-right">₱{(Number(m.quantity) * Number(m.unit_cost)).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{canManage && <Button size="icon" variant="ghost" onClick={() => removeManual(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</TableCell>
                      </TableRow>);
                    })}
                    {matManual.length === 0 && (<TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No manual entries yet.</TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Projects;
