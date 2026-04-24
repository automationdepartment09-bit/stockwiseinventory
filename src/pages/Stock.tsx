import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { toast } from "sonner";

type Status = "available" | "reserved" | "on_arrival" | "arrived" | "damaged";

const STATUS_LABEL: Record<Status, string> = {
  available: "Available",
  reserved: "Reserved",
  on_arrival: "On arrival",
  arrived: "Arrived",
  damaged: "Damaged",
};

const statusClass = (s: Status) =>
  s === "available" ? "bg-primary/15 text-primary border-primary/30"
  : s === "reserved" ? "bg-secondary text-secondary-foreground"
  : s === "on_arrival" ? "bg-accent text-accent-foreground"
  : s === "arrived" ? "bg-primary/10 text-primary border-primary/20"
  : "bg-destructive/15 text-destructive border-destructive/30";

interface Row {
  id: string;
  item_id: string;
  warehouse_id: string;
  quantity: number;
  status: Status;
}

const Stock = () => {
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin", "manager");
  const [rows, setRows] = useState<Row[]>([]);
  const [items, setItems] = useState<Map<string, { name: string; sku: string }>>(new Map());
  const [whs, setWhs] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = async () => {
    const [{ data: lvls }, { data: its }, { data: w }] = await Promise.all([
      supabase.from("stock_levels").select("id,item_id,warehouse_id,quantity,status"),
      supabase.from("items").select("id,name,sku"),
      supabase.from("warehouses").select("id,name"),
    ]);
    setRows((lvls ?? []) as Row[]);
    setItems(new Map((its ?? []).map((i: any) => [i.id, { name: i.name, sku: i.sku }])));
    setWhs(new Map((w ?? []).map((x: any) => [x.id, x.name])));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const it = items.get(r.item_id);
      const matchQ = !q || it?.name.toLowerCase().includes(q) || it?.sku.toLowerCase().includes(q);
      const matchS = statusFilter === "all" || r.status === statusFilter;
      return matchQ && matchS;
    });
  }, [rows, items, search, statusFilter]);

  const updateStatus = async (id: string, status: Status) => {
    const { error } = await supabase.from("stock_levels").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status updated");
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Stock" description="Per-warehouse stock with status." />
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search item name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const it = items.get(r.item_id);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{it?.sku ?? "—"}</TableCell>
                    <TableCell className="font-medium">{it?.name ?? "Unknown"}</TableCell>
                    <TableCell>{whs.get(r.warehouse_id) ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.quantity}</TableCell>
                    <TableCell>
                      {canEdit ? (
                        <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v as Status)}>
                          <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className={statusClass(r.status)}>{STATUS_LABEL[r.status]}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No stock rows.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Stock;
