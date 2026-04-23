import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

interface Req {
  id: string; item_id: string; warehouse_id: string; quantity: number;
  reason: string | null; status: "pending" | "approved" | "rejected";
  requested_by: string; reviewed_by: string | null; review_note: string | null;
  reviewed_at: string | null; created_at: string;
}

const Requests = () => {
  const { user, hasRole } = useAuth();
  const canReview = hasRole("admin", "manager");
  const [rows, setRows] = useState<Req[]>([]);
  const [items, setItems] = useState<Record<string, { name: string; sku: string }>>({});
  const [whs, setWhs] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"pending" | "all" | "mine">("pending");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = async () => {
    const [{ data: rs }, { data: its }, { data: ws }] = await Promise.all([
      supabase.from("stock_requests").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("items").select("id, name, sku"),
      supabase.from("warehouses").select("id, name"),
    ]);
    setRows((rs ?? []) as Req[]);
    const im: Record<string, { name: string; sku: string }> = {};
    (its ?? []).forEach((i: any) => { im[i.id] = { name: i.name, sku: i.sku }; });
    setItems(im);
    const wm: Record<string, string> = {};
    (ws ?? []).forEach((w: any) => { wm[w.id] = w.name; });
    setWhs(wm);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    if (tab === "pending") return r.status === "pending";
    if (tab === "mine") return r.requested_by === user?.id;
    return true;
  });

  const review = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase
      .from("stock_requests")
      .update({ status, reviewed_by: user?.id, review_note: note || null, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Request ${status}`);
    setNoteFor(null); setNote("");
    load();
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Stock requests" description="Review and approve incoming stock additions per warehouse." />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="mine">My requests</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="glass-card">
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const it = items[r.item_id];
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {it?.name ?? "—"}
                      {it && <div className="font-mono text-[10px] text-muted-foreground">{it.sku}</div>}
                    </TableCell>
                    <TableCell>{whs[r.warehouse_id] ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.quantity}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{r.reason ?? "—"}</TableCell>
                    <TableCell>
                      {r.status === "pending" && <Badge variant="outline">Pending</Badge>}
                      {r.status === "approved" && <Badge className="bg-primary/20 text-primary">Approved</Badge>}
                      {r.status === "rejected" && <Badge variant="destructive">Rejected</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      {canReview && r.status === "pending" && (
                        noteFor === r.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="h-8 w-40" />
                            <Button size="sm" onClick={() => review(r.id, "approved")}><Check className="mr-1 h-3.5 w-3.5" />Approve</Button>
                            <Button size="sm" variant="destructive" onClick={() => review(r.id, "rejected")}><X className="mr-1 h-3.5 w-3.5" />Reject</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setNoteFor(null); setNote(""); }}>Cancel</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => { setNoteFor(r.id); setNote(""); }}>Review</Button>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No requests.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Requests;
