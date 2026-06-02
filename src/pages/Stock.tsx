import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { FilterBar, FilterValues, EMPTY_FILTERS, matchesQuery } from "@/components/FilterBar";
import { useNavigate } from "react-router-dom";
import { MultiLineItems, LineItem, emptyLine, newBatchRef } from "@/components/MultiLineItems";

type Status = "available" | "reserved" | "on_arrival" | "arrived" | "damaged";
const STATUS_LABEL: Record<Status, string> = { available:"Available", reserved:"Reserved", on_arrival:"On arrival", arrived:"Arrived", damaged:"Damaged" };
const statusClass = (s: Status) =>
  s==="available"?"bg-primary/15 text-primary border-primary/30"
  :s==="reserved"?"bg-secondary text-secondary-foreground"
  :s==="on_arrival"?"bg-accent text-accent-foreground"
  :s==="arrived"?"bg-primary/10 text-primary border-primary/20"
  :"bg-destructive/15 text-destructive border-destructive/30";

interface Row { id:string; item_id:string; warehouse_id:string; quantity:number; status:Status }

const Stock = () => {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const canEdit = hasRole("admin", "manager");
  const [rows, setRows] = useState<Row[]>([]);
  const [items, setItems] = useState<{id:string;name:string;sku:string;category_id:string|null}[]>([]);
  const [whs, setWhs] = useState<{id:string;name:string}[]>([]);
  const [categories, setCategories] = useState<{id:string;name:string}[]>([]);
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);

  const [addOpen, setAddOpen] = useState(false);
  const [aWh, setAWh] = useState("");
  const [aLines, setALines] = useState<LineItem[]>([emptyLine()]);
  const [aReason, setAReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const itemMap = useMemo(()=>new Map(items.map(i=>[i.id,i])),[items]);
  const whMap = useMemo(()=>new Map(whs.map(w=>[w.id,w.name])),[whs]);

  const load = async () => {
    const [{data:lvls},{data:its},{data:w},{data:cats}] = await Promise.all([
      supabase.from("stock_levels").select("id,item_id,warehouse_id,quantity,status"),
      supabase.from("items").select("id,name,sku,category_id").eq("is_active",true).order("name"),
      supabase.from("warehouses").select("id,name").eq("is_active",true).order("name"),
      supabase.from("categories").select("id,name").order("name"),
    ]);
    setRows((lvls??[]) as Row[]); setItems((its??[]) as any); setWhs(w??[]); setCategories(cats??[]);
  };
  useEffect(()=>{ load(); },[]);

  const filtered = useMemo(()=>rows.filter(r=>{
    const it = itemMap.get(r.item_id);
    if (!matchesQuery(filters.q,[it?.name,it?.sku])) return false;
    if (filters.status!=="all" && r.status!==filters.status) return false;
    if (filters.warehouse!=="all" && r.warehouse_id!==filters.warehouse) return false;
    if (filters.category!=="all" && (it as any)?.category_id!==filters.category) return false;
    return true;
  }),[rows,itemMap,filters]);

  const updateStatus = async (id:string, status:Status) => {
    const { error } = await supabase.from("stock_levels").update({status}).eq("id",id);
    if (error) return toast.error(error.message);
    toast.success("Status updated");
    setRows(p=>p.map(r=>r.id===id?{...r,status}:r));
  };

  const submitAdd = async () => {
    if (!aWh) return toast.error("Warehouse required");
    const valid = aLines.filter(l => l.item_id && l.quantity > 0);
    if (valid.length === 0) return toast.error("Add at least one line");
    setSubmitting(true);
    const batch_ref = valid.length > 1 ? newBatchRef("REQ") : null;
    const payload = valid.map(l => ({
      item_id: l.item_id, warehouse_id: aWh, quantity: l.quantity,
      reason: (l.note?.trim() || aReason.trim() || "Add stock"),
      requested_by: user!.id, batch_ref,
    }));
    const { error } = await supabase.from("stock_requests").insert(payload);
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(`Submitted ${valid.length} add-stock request(s) — awaiting approval`);
    setAddOpen(false); setALines([emptyLine()]); setAWh(""); setAReason("");
    navigate("/requests");
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Stock" description="Per-warehouse stock with status."
        actions={canEdit && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Add stock (batch)</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request to add stock</DialogTitle>
                <DialogDescription>Batch request — requires manager approval before stock is updated.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Warehouse *</Label>
                  <Select value={aWh} onValueChange={setAWh}>
                    <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                    <SelectContent>{whs.map(w=>(<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <MultiLineItems value={aLines} onChange={setALines} showNote notePlaceholder="Reason" hidePickerWarehouseFilter />
                <div className="space-y-1.5">
                  <Label>Default reason / reference</Label>
                  <Input value={aReason} onChange={e=>setAReason(e.target.value)} placeholder="e.g. Restock, PO #, invoice" maxLength={200} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={()=>setAddOpen(false)}>Cancel</Button>
                <Button onClick={submitAdd} disabled={submitting}>{submitting?"Submitting…":"Submit batch for approval"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      />
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="mb-4">
            <FilterBar values={filters} onChange={setFilters}
              searchPlaceholder="Search item name or SKU…"
              show={{q:true,category:true,warehouse:true,status:true}}
              categories={categories.map(c=>({value:c.id,label:c.name}))}
              warehouses={whs.map(w=>({value:w.id,label:w.name}))}
              statuses={(Object.keys(STATUS_LABEL) as Status[]).map(s=>({value:s,label:STATUS_LABEL[s]}))}
            />
          </div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>SKU</TableHead><TableHead>Item</TableHead><TableHead>Warehouse</TableHead>
              <TableHead className="text-right">Qty</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(r=>{ const it = itemMap.get(r.item_id); return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{it?.sku??"—"}</TableCell>
                  <TableCell className="font-medium">{it?.name??"Unknown"}</TableCell>
                  <TableCell>{whMap.get(r.warehouse_id)??"—"}</TableCell>
                  <TableCell className="text-right">{r.quantity}</TableCell>
                  <TableCell>
                    {canEdit?(
                      <Select value={r.status} onValueChange={v=>updateStatus(r.id,v as Status)}>
                        <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{(Object.keys(STATUS_LABEL) as Status[]).map(s=>(<SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>))}</SelectContent>
                      </Select>
                    ):(<Badge variant="outline" className={statusClass(r.status)}>{STATUS_LABEL[r.status]}</Badge>)}
                  </TableCell>
                </TableRow>
              );})}
              {filtered.length===0 && (<TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No stock rows.</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
export default Stock;
