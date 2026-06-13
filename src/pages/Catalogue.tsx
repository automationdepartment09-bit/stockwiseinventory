import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Link2 } from "lucide-react";
import { toast } from "sonner";
import { formatPHP } from "@/lib/currency";
import { ItemPicker } from "@/components/ItemPicker";

interface CatalogueItem {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  item_id: string | null;
  category_id: string | null;
  unit_price: number;
  cost_price: number | null;
  uom: string | null;
  image_url: string | null;
  is_active: boolean;
  is_visible: boolean;
  remarks: string | null;
  created_at: string;
}
interface Category { id: string; name: string }
interface InvItem { id: string; name: string; sku: string; unit_price: number | null }

const empty = {
  name: "", description: "", sku: "", item_id: "", category_id: "",
  unit_price: "", cost_price: "", uom: "", image_url: "", remarks: "",
  is_active: true, is_visible: true,
};

const Catalogue = () => {
  const { hasRole } = useAuth();
  const canManage = hasRole("admin", "manager");

  const [rows, setRows] = useState<CatalogueItem[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<InvItem[]>([]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("__all__");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);

  const catMap = useMemo(() => new Map(cats.map(c => [c.id, c.name])), [cats]);
  const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);

  const load = async () => {
    const [c, ca, it] = await Promise.all([
      supabase.from("catalogue_items").select("*").order("created_at", { ascending: false }),
      supabase.from("categories").select("id,name").order("name"),
      supabase.from("items").select("id,name,sku,unit_price").eq("is_active", true).order("name"),
    ]);
    if (c.data) setRows(c.data as CatalogueItem[]);
    if (ca.data) setCats(ca.data as Category[]);
    if (it.data) setItems(it.data as InvItem[]);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (catFilter !== "__all__" && r.category_id !== catFilter) return false;
      if (!q) return true;
      return [r.name, r.sku, r.description, r.uom, r.remarks].some(v => (v ?? "").toLowerCase().includes(q));
    });
  }, [rows, search, catFilter]);

  const openNew = () => { setEditId(null); setForm(empty); setOpen(true); };
  const openEdit = (r: CatalogueItem) => {
    setEditId(r.id);
    setForm({
      name: r.name, description: r.description ?? "", sku: r.sku ?? "",
      item_id: r.item_id ?? "", category_id: r.category_id ?? "",
      unit_price: String(r.unit_price ?? ""), cost_price: r.cost_price != null ? String(r.cost_price) : "",
      uom: r.uom ?? "", image_url: r.image_url ?? "", remarks: r.remarks ?? "",
      is_active: r.is_active, is_visible: r.is_visible,
    });
    setOpen(true);
  };

  // Auto-fill from inventory item
  const pickInventory = (id: string) => {
    const it = itemMap.get(id);
    setForm(f => ({
      ...f,
      item_id: id,
      name: f.name || (it?.name ?? ""),
      sku: f.sku || (it?.sku ?? ""),
      unit_price: f.unit_price || (it?.unit_price != null ? String(it.unit_price) : ""),
    }));
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const payload: any = {
      name: form.name.trim(),
      description: form.description || null,
      sku: form.sku || null,
      item_id: form.item_id || null,
      category_id: form.category_id || null,
      unit_price: Number(form.unit_price) || 0,
      cost_price: form.cost_price ? Number(form.cost_price) : null,
      uom: form.uom || null,
      image_url: form.image_url || null,
      remarks: form.remarks || null,
      is_active: form.is_active,
      is_visible: form.is_visible,
    };
    const r = editId
      ? await supabase.from("catalogue_items").update(payload).eq("id", editId)
      : await supabase.from("catalogue_items").insert(payload);
    if (r.error) { toast.error(r.error.message); return; }
    toast.success(editId ? "Updated" : "Added to catalogue");
    setOpen(false); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this catalogue entry?")) return;
    const r = await supabase.from("catalogue_items").delete().eq("id", id);
    if (r.error) { toast.error(r.error.message); return; }
    toast.success("Deleted"); load();
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Catalogue" description="Sellable products — link to inventory items or create standalone offerings." />

      <Card><CardContent className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search name, SKU, description…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editId ? "Edit catalogue item" : "New catalogue item"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="flex items-center gap-1"><Link2 className="h-3 w-3" />Link to inventory item (optional)</Label>
                  <ItemPicker value={form.item_id} onChange={pickInventory} />
                  {form.item_id && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 mt-1"
                      onClick={() => setForm(f => ({ ...f, item_id: "" }))}>Clear link</Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                  <div><Label>SKU / Code</Label><Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></div>
                  <div><Label>Category</Label>
                    <Select value={form.category_id || "__none__"} onValueChange={v => setForm({ ...form, category_id: v === "__none__" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>UOM</Label><Input value={form.uom} onChange={e => setForm({ ...form, uom: e.target.value })} placeholder="pc, box…" /></div>
                  <div><Label>Unit price</Label><Input type="number" step="0.01" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} /></div>
                  <div><Label>Cost price</Label><Input type="number" step="0.01" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} /></div>
                </div>
                <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                <div><Label>Image URL</Label><Input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} /></div>
                <div><Label>Remarks</Label><Textarea rows={2} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />Active</label>
                  <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_visible} onCheckedChange={v => setForm({ ...form, is_visible: v })} />Visible</label>
                </div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>SKU</TableHead><TableHead>Category</TableHead>
            <TableHead>Linked item</TableHead><TableHead className="text-right">Price</TableHead>
            <TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No catalogue items.</TableCell></TableRow>
            ) : filtered.map(r => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.name}</div>
                  {r.description && <div className="text-xs text-muted-foreground line-clamp-1">{r.description}</div>}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                <TableCell>{r.category_id ? catMap.get(r.category_id) : "—"}</TableCell>
                <TableCell className="text-xs">{r.item_id ? itemMap.get(r.item_id)?.name ?? "—" : <span className="text-muted-foreground">Standalone</span>}</TableCell>
                <TableCell className="text-right font-medium">{formatPHP(r.unit_price)}</TableCell>
                <TableCell>
                  {r.is_active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                  {!r.is_visible && <Badge variant="secondary" className="ml-1">Hidden</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  {canManage && <>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
};

export default Catalogue;
