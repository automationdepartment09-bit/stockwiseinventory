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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowRightLeft, ArrowUp, Plus, Sliders } from "lucide-react";
import { toast } from "sonner";

interface Move { id: string; movement_type: "in"|"out"|"transfer"|"adjustment"; quantity: number; reason: string|null; reference: string|null; created_at: string; item_id: string; from_warehouse_id: string|null; to_warehouse_id: string|null }

const Movements = () => {
  const { user, hasRole } = useAuth();
  const canCreate = hasRole("admin", "manager", "staff");
  const [moves, setMoves] = useState<Move[]>([]);
  const [items, setItems] = useState<{id:string;name:string;sku:string}[]>([]);
  const [warehouses, setWarehouses] = useState<{id:string;name:string}[]>([]);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"in"|"out"|"transfer"|"adjustment">("in");

  const load = async () => {
    const [{ data: m }, { data: it }, { data: wh }] = await Promise.all([
      supabase.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("items").select("id, name, sku").order("name"),
      supabase.from("warehouses").select("id, name").order("name"),
    ]);
    setMoves((m ?? []) as Move[]);
    setItems(it ?? []);
    setWarehouses(wh ?? []);
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const item_id = String(fd.get("item_id") ?? "");
    const quantity = Number(fd.get("quantity") ?? 0);
    const from_warehouse_id = String(fd.get("from_warehouse_id") ?? "") || null;
    const to_warehouse_id = String(fd.get("to_warehouse_id") ?? "") || null;
    const reason = String(fd.get("reason") ?? "").trim() || null;
    const reference = String(fd.get("reference") ?? "").trim() || null;
    if (!item_id || quantity <= 0) return toast.error("Item and positive quantity required");
    if ((type === "in" || type === "adjustment") && !to_warehouse_id) return toast.error("Destination warehouse required");
    if (type === "out" && !from_warehouse_id) return toast.error("Source warehouse required");
    if (type === "transfer" && (!from_warehouse_id || !to_warehouse_id)) return toast.error("Both warehouses required");
    const { error } = await supabase.from("stock_movements").insert({
      item_id, movement_type: type, quantity, from_warehouse_id, to_warehouse_id, reason, reference, created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Stock updated"); setOpen(false); load();
  };

  const itemMap = new Map(items.map(i=>[i.id,i]));
  const whMap = new Map(warehouses.map(w=>[w.id,w]));

  const typeIcon = (t: string) =>
    t === "in" ? <ArrowDown className="h-3 w-3 text-primary" /> :
    t === "out" ? <ArrowUp className="h-3 w-3 text-destructive" /> :
    t === "transfer" ? <ArrowRightLeft className="h-3 w-3 text-secondary" /> :
    <Sliders className="h-3 w-3 text-warning" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock movements"
        description="Record stock in, out, transfers, and adjustments."
        actions={canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New movement</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record movement</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">Stock in</SelectItem>
                      <SelectItem value="out">Stock out</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Item</Label>
                  <Select name="item_id">
                    <SelectTrigger><SelectValue placeholder="Choose item…" /></SelectTrigger>
                    <SelectContent>{items.map(i=><SelectItem key={i.id} value={i.id}>{i.sku} — {i.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Quantity</Label>
                  <Input name="quantity" type="number" min="1" required />
                </div>
                {(type === "out" || type === "transfer") && (
                  <div className="space-y-1.5">
                    <Label>From warehouse</Label>
                    <Select name="from_warehouse_id">
                      <SelectTrigger><SelectValue placeholder="Source…" /></SelectTrigger>
                      <SelectContent>{warehouses.map(w=><SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {(type === "in" || type === "transfer" || type === "adjustment") && (
                  <div className="space-y-1.5">
                    <Label>To warehouse</Label>
                    <Select name="to_warehouse_id">
                      <SelectTrigger><SelectValue placeholder="Destination…" /></SelectTrigger>
                      <SelectContent>{warehouses.map(w=><SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5"><Label>Reason</Label><Input name="reason" maxLength={200} /></div>
                <div className="space-y-1.5"><Label>Reference</Label><Input name="reference" maxLength={100} placeholder="PO, invoice…" /></div>
                <DialogFooter><Button type="submit">Save</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />
      <Card className="glass-card">
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>From → To</TableHead><TableHead>Reason</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {moves.map((m) => {
                const it = itemMap.get(m.item_id);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline" className="gap-1">{typeIcon(m.movement_type)}{m.movement_type}</Badge></TableCell>
                    <TableCell className="font-medium">{it?.name ?? "—"} <span className="ml-1 font-mono text-xs text-muted-foreground">{it?.sku}</span></TableCell>
                    <TableCell>{m.quantity}</TableCell>
                    <TableCell className="text-xs">{whMap.get(m.from_warehouse_id ?? "")?.name ?? "—"} → {whMap.get(m.to_warehouse_id ?? "")?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.reason ?? ""}{m.reference ? ` (${m.reference})` : ""}</TableCell>
                  </TableRow>
                );
              })}
              {moves.length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No movements yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
export default Movements;
