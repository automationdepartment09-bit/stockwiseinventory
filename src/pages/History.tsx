import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PackageMinus, PackagePlus, ArrowLeftRight, ClipboardCheck, Package, History as HistoryIcon } from "lucide-react";

type Kind = "withdrawal" | "item_created" | "stock_added" | "movement" | "request";

interface Entry {
  id: string;
  kind: Kind;
  date: string; // ISO
  title: string;
  subtitle?: string;
  status?: string;
  qty?: number;
  raw: any;
}

const KIND_LABEL: Record<Kind, string> = {
  withdrawal: "Withdrawal",
  item_created: "Item created",
  stock_added: "Stock added",
  movement: "Movement",
  request: "Request",
};

const KIND_ICON: Record<Kind, any> = {
  withdrawal: PackageMinus,
  item_created: Package,
  stock_added: PackagePlus,
  movement: ArrowLeftRight,
  request: ClipboardCheck,
};

const kindBadgeClass: Record<Kind, string> = {
  withdrawal: "bg-warning/15 text-warning border-warning/30",
  item_created: "bg-primary/15 text-primary border-primary/30",
  stock_added: "bg-success/15 text-success border-success/30",
  movement: "bg-accent text-accent-foreground",
  request: "bg-secondary text-secondary-foreground",
};

const History = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [items, setItems] = useState<Record<string, { name: string; sku: string }>>({});
  const [whs, setWhs] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Kind | "all">("all");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [w, m, r, i, its, whList] = await Promise.all([
      supabase.from("withdrawals").select("*").eq("requested_by", user.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("stock_movements").select("*").eq("created_by", user.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("stock_requests").select("*").eq("requested_by", user.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("items").select("*").eq("created_by", user.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("items").select("id,name,sku"),
      supabase.from("warehouses").select("id,name"),
    ]);
    const itemsMap: Record<string, { name: string; sku: string }> = {};
    (its.data ?? []).forEach((x: any) => { itemsMap[x.id] = { name: x.name, sku: x.sku }; });
    const whMap: Record<string, string> = {};
    (whList.data ?? []).forEach((x: any) => { whMap[x.id] = x.name; });
    setItems(itemsMap);
    setWhs(whMap);

    const list: Entry[] = [];

    (w.data ?? []).forEach((x: any) => {
      const it = itemsMap[x.item_id];
      list.push({
        id: `wth-${x.id}`,
        kind: "withdrawal",
        date: x.created_at,
        title: `${x.quantity} × ${it?.name ?? "item"}`,
        subtitle: x.purpose,
        status: x.status,
        qty: x.quantity,
        raw: x,
      });
    });

    (m.data ?? []).forEach((x: any) => {
      const it = itemsMap[x.item_id];
      const isAdd = x.movement_type === "in" || x.movement_type === "adjustment";
      list.push({
        id: `mv-${x.id}`,
        kind: isAdd && !x.reference?.startsWith("REQ:") ? "stock_added" : "movement",
        date: x.created_at,
        title: `${x.movement_type.toUpperCase()} · ${x.quantity} × ${it?.name ?? "item"}`,
        subtitle: x.reason ?? undefined,
        qty: x.quantity,
        raw: x,
      });
    });

    (r.data ?? []).forEach((x: any) => {
      const it = itemsMap[x.item_id];
      list.push({
        id: `req-${x.id}`,
        kind: "request",
        date: x.created_at,
        title: `${x.quantity} × ${it?.name ?? "item"}`,
        subtitle: x.reason ?? undefined,
        status: x.status,
        qty: x.quantity,
        raw: x,
      });
    });

    (i.data ?? []).forEach((x: any) => {
      list.push({
        id: `itm-${x.id}`,
        kind: "item_created",
        date: x.created_at,
        title: x.name,
        subtitle: x.sku,
        raw: x,
      });
    });

    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setEntries(list);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const counts = useMemo(() => {
    const c: Record<Kind, number> = { withdrawal: 0, item_created: 0, stock_added: 0, movement: 0, request: 0 };
    entries.forEach((e) => { c[e.kind]++; });
    return c;
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (tab !== "all" && e.kind !== tab) return false;
      if (!q) return true;
      return [e.title, e.subtitle, e.status].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [entries, tab, search]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="My history"
        description="Everything you've done — withdrawals, items created, stock added, movements and requests."
      />

      <Card className="glass-card">
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search title, status, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} of {entries.length}</span>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="all">All ({entries.length})</TabsTrigger>
              <TabsTrigger value="withdrawal">Withdrawals ({counts.withdrawal})</TabsTrigger>
              <TabsTrigger value="item_created">Items ({counts.item_created})</TabsTrigger>
              <TabsTrigger value="stock_added">Stock added ({counts.stock_added})</TabsTrigger>
              <TabsTrigger value="movement">Movements ({counts.movement})</TabsTrigger>
              <TabsTrigger value="request">Requests ({counts.request})</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground"><HistoryIcon className="mx-auto mb-2 h-6 w-6 opacity-50" />No activity yet.</TableCell></TableRow>
                )}
                {filtered.map((e) => {
                  const Icon = KIND_ICON[e.kind];
                  return (
                    <TableRow key={e.id} onClick={() => setDetail(e)} className="cursor-pointer hover:bg-muted/40">
                      <TableCell>
                        <Badge variant="outline" className={kindBadgeClass[e.kind]}>
                          <Icon className="mr-1 h-3 w-3" />{KIND_LABEL[e.kind]}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{new Date(e.date).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="font-medium">{e.title}</div>
                        {e.subtitle && <div className="text-xs text-muted-foreground truncate max-w-[360px]">{e.subtitle}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{e.qty ?? "—"}</TableCell>
                      <TableCell>{e.status ? <Badge variant="outline">{e.status}</Badge> : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail ? KIND_LABEL[detail.kind] : "Details"}</DialogTitle>
            <DialogDescription>{detail ? new Date(detail.date).toLocaleString() : ""}</DialogDescription>
          </DialogHeader>
          {detail && <DetailBody entry={detail} items={items} whs={whs} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-3 border-b border-border/60 py-1.5 last:border-0">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="col-span-2">{children}</div>
  </div>
);

const DetailBody = ({
  entry, items, whs,
}: { entry: Entry; items: Record<string, { name: string; sku: string }>; whs: Record<string, string> }) => {
  const x = entry.raw;
  const itemLabel = (id?: string | null) => id ? `${items[id]?.name ?? "—"} (${items[id]?.sku ?? ""})` : "—";

  if (entry.kind === "withdrawal") {
    return (
      <div className="space-y-1 text-sm">
        <Row label="Item">{itemLabel(x.item_id)}</Row>
        <Row label="Warehouse">{whs[x.warehouse_id] ?? "—"}</Row>
        <Row label="Quantity">{x.quantity}</Row>
        <Row label="Purpose">{x.purpose}</Row>
        {x.project_reference && <Row label="Reference">{x.project_reference}</Row>}
        <Row label="Date">{x.withdrawal_date}</Row>
        {x.return_expected && <Row label="Return by">{x.expected_return_date ?? "—"}</Row>}
        {x.notes && <Row label="Notes"><span className="whitespace-pre-wrap">{x.notes}</span></Row>}
        {x.attachment_url && (
          <Row label="Attachment"><a className="underline" href={x.attachment_url} target="_blank" rel="noreferrer">{x.attachment_name ?? "Open"}</a></Row>
        )}
        <Row label="Status"><Badge variant="outline">{x.status}</Badge></Row>
        {x.review_note && <Row label="Review note">{x.review_note}</Row>}
      </div>
    );
  }

  if (entry.kind === "item_created") {
    return (
      <div className="space-y-1 text-sm">
        <Row label="Name">{x.name}</Row>
        <Row label="SKU"><span className="font-mono text-xs">{x.sku}</span></Row>
        <Row label="Unit price">₱{Number(x.unit_price).toFixed(2)}</Row>
        <Row label="Cost price">₱{Number(x.cost_price).toFixed(2)}</Row>
        <Row label="Reorder at">{x.reorder_level}</Row>
        <Row label="Status">{x.is_active ? "Active" : "Inactive"}</Row>
        {x.description && <Row label="Description"><span className="whitespace-pre-wrap">{x.description}</span></Row>}
      </div>
    );
  }

  if (entry.kind === "request") {
    return (
      <div className="space-y-1 text-sm">
        <Row label="Item">{itemLabel(x.item_id)}</Row>
        <Row label="Warehouse">{whs[x.warehouse_id] ?? "—"}</Row>
        <Row label="Quantity">{x.quantity}</Row>
        {x.reason && <Row label="Reason">{x.reason}</Row>}
        <Row label="Status"><Badge variant="outline">{x.status}</Badge></Row>
        {x.review_note && <Row label="Review note">{x.review_note}</Row>}
        {x.reviewed_at && <Row label="Reviewed">{new Date(x.reviewed_at).toLocaleString()}</Row>}
      </div>
    );
  }

  // movement / stock_added
  return (
    <div className="space-y-1 text-sm">
      <Row label="Type">{x.movement_type}</Row>
      <Row label="Item">{itemLabel(x.item_id)}</Row>
      {x.from_warehouse_id && <Row label="From">{whs[x.from_warehouse_id] ?? "—"}</Row>}
      {x.to_warehouse_id && <Row label="To">{whs[x.to_warehouse_id] ?? "—"}</Row>}
      <Row label="Quantity">{x.quantity}</Row>
      {x.reason && <Row label="Reason">{x.reason}</Row>}
      {x.reference && <Row label="Reference"><span className="font-mono text-xs">{x.reference}</span></Row>}
    </div>
  );
};

export default History;
