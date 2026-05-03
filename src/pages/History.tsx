import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Printer, History as HistoryIcon, Download, FileText } from "lucide-react";
import { FilterBar, FilterValues, EMPTY_FILTERS, matchesQuery, inDateRange } from "@/components/FilterBar";
import { printReceipt, receiptNo } from "@/lib/receipt";
import { exportCsv, printList } from "@/lib/exportPrint";

type ReqStatus = "pending" | "approved" | "rejected" | "on_arrival" | "arrived" | "received";
const REQ_LABEL: Record<ReqStatus, string> = {
  pending: "Pending", approved: "Approved", rejected: "Rejected",
  on_arrival: "On arrival", arrived: "Arrived", received: "Received",
};

interface Item { id: string; name: string; sku: string; barcode: string | null; ref_number: string | null; category_id: string | null }
interface Wh { id: string; name: string }
interface Profile { id: string; full_name: string | null; email: string | null }
interface Project { id: string; name: string; code: string | null }
interface Category { id: string; name: string }

const History = () => {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin", "manager");

  const [tab, setTab] = useState<"withdrawals" | "returns" | "requests" | "movements" | "items">("withdrawals");
  const [scopeAll, setScopeAll] = useState(isAdmin); // managers can see all by default
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [qtyMin, setQtyMin] = useState("");
  const [qtyMax, setQtyMax] = useState("");
  const [refNo, setRefNo] = useState("");

  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Wh[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [itemsCreated, setItemsCreated] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const reset = () => { setFilters(EMPTY_FILTERS); setQtyMin(""); setQtyMax(""); setRefNo(""); };

  // Reset extra filters when switching tabs (filter values stay intentionally)
  useEffect(() => { setRefNo(""); setQtyMin(""); setQtyMax(""); }, [tab]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const own = (q: any, col: string) => (scopeAll ? q : q.eq(col, user.id));
    const [w, r, rq, mv, it, itAll, wh, pf, pj, cat] = await Promise.all([
      own(supabase.from("withdrawals").select("*").order("created_at", { ascending: false }).limit(1000), "requested_by"),
      own(supabase.from("returns").select("*").order("created_at", { ascending: false }).limit(1000), "created_by"),
      own(supabase.from("stock_requests").select("*").order("created_at", { ascending: false }).limit(1000), "requested_by"),
      own(supabase.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(1000), "created_by"),
      own(supabase.from("items").select("*").order("created_at", { ascending: false }).limit(1000), "created_by"),
      supabase.from("items").select("id,name,sku,barcode,ref_number,category_id"),
      supabase.from("warehouses").select("id,name").order("name"),
      supabase.from("profiles").select("id,full_name,email"),
      supabase.from("projects").select("id,name,code").eq("is_active", true).order("name"),
      supabase.from("categories").select("id,name").order("name"),
    ]);
    setWithdrawals(w.data ?? []); setReturns(r.data ?? []); setRequests(rq.data ?? []);
    setMovements(mv.data ?? []); setItemsCreated(it.data ?? []);
    setItems(itAll.data ?? []);
    setWarehouses(wh.data ?? []);
    setProfiles(pf.data ?? []);
    setProjects(pj.data ?? []);
    setCategories(cat.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, scopeAll]);

  const itemMap = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const whMap = useMemo(() => Object.fromEntries(warehouses.map((w) => [w.id, w])), [warehouses]);
  const profMap = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p])), [profiles]);
  const projMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const userLabel = (id: string | null | undefined) => {
    if (!id) return "—";
    const p = profMap[id];
    return p?.full_name || p?.email || (id === user?.id ? "You" : id.slice(0, 6));
  };
  const projLabel = (id: string | null | undefined) => {
    if (!id) return "—";
    const p = projMap[id];
    return p ? `${p.code ? p.code + " · " : ""}${p.name}` : "—";
  };

  const inQty = (q: number) => {
    const min = qtyMin === "" ? -Infinity : Number(qtyMin);
    const max = qtyMax === "" ? Infinity : Number(qtyMax);
    return q >= min && q <= max;
  };
  const matchRef = (s: string) => !refNo.trim() || s.toLowerCase().includes(refNo.trim().toLowerCase());

  // ---------- Per-tab filtered lists ----------
  const fWithdrawals = useMemo(() => withdrawals.filter((r) => {
    const it = itemMap[r.item_id];
    if (filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.warehouse !== "all" && r.warehouse_id !== filters.warehouse) return false;
    if (filters.project !== "all" && (filters.project === "__none__" ? r.project_id !== null : r.project_id !== filters.project)) return false;
    if (filters.requester !== "all" && r.requested_by !== filters.requester) return false;
    if (filters.category !== "all" && it?.category_id !== filters.category) return false;
    if (!inDateRange(r.withdrawal_date, filters.from, filters.to)) return false;
    if (!inQty(r.quantity)) return false;
    if (!matchRef(receiptNo("WTH", r.id))) return false;
    return matchesQuery(filters.q, [it?.name, it?.sku, it?.barcode, it?.ref_number, r.purpose, r.project_reference, r.notes, r.withdrawn_by_name, userLabel(r.withdrawn_by_user_id)]);
  }), [withdrawals, filters, itemMap, qtyMin, qtyMax, refNo]);

  const fReturns = useMemo(() => returns.filter((r) => {
    const it = itemMap[r.item_id];
    if (filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.warehouse !== "all" && r.warehouse_id !== filters.warehouse) return false;
    if (filters.project !== "all" && (filters.project === "__none__" ? r.project_id !== null : r.project_id !== filters.project)) return false;
    if (filters.requester !== "all" && r.created_by !== filters.requester) return false;
    if (filters.category !== "all" && it?.category_id !== filters.category) return false;
    if (!inDateRange(r.return_date, filters.from, filters.to)) return false;
    if (!inQty(r.quantity)) return false;
    if (!matchRef(receiptNo("RET", r.id))) return false;
    return matchesQuery(filters.q, [it?.name, it?.sku, it?.barcode, r.notes, r.returned_by_name, userLabel(r.returned_by_user_id)]);
  }), [returns, filters, itemMap, qtyMin, qtyMax, refNo]);

  const fRequests = useMemo(() => requests.filter((r) => {
    const it = itemMap[r.item_id];
    if (filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.warehouse !== "all" && r.warehouse_id !== filters.warehouse) return false;
    if (filters.project !== "all" && (filters.project === "__none__" ? r.project_id !== null : r.project_id !== filters.project)) return false;
    if (filters.requester !== "all" && r.requested_by !== filters.requester) return false;
    if (filters.category !== "all" && it?.category_id !== filters.category) return false;
    if (!inDateRange(r.created_at, filters.from, filters.to)) return false;
    if (!inQty(r.quantity)) return false;
    if (!matchRef(receiptNo("REQ", r.id))) return false;
    return matchesQuery(filters.q, [it?.name, it?.sku, r.reason, userLabel(r.requested_by)]);
  }), [requests, filters, itemMap, qtyMin, qtyMax, refNo]);

  const fMovements = useMemo(() => movements.filter((m) => {
    const it = itemMap[m.item_id];
    if (filters.warehouse !== "all" && m.from_warehouse_id !== filters.warehouse && m.to_warehouse_id !== filters.warehouse) return false;
    if (filters.requester !== "all" && m.created_by !== filters.requester) return false;
    if (filters.category !== "all" && it?.category_id !== filters.category) return false;
    if (filters.status !== "all" && m.movement_type !== filters.status) return false;
    if (!inDateRange(m.created_at, filters.from, filters.to)) return false;
    if (!inQty(m.quantity)) return false;
    if (!matchRef(receiptNo("MV", m.id))) return false;
    return matchesQuery(filters.q, [it?.name, it?.sku, m.reason, m.reference, m.movement_type]);
  }), [movements, filters, itemMap, qtyMin, qtyMax, refNo]);

  const fItems = useMemo(() => itemsCreated.filter((it: Item & any) => {
    if (filters.category !== "all" && it.category_id !== filters.category) return false;
    if (filters.requester !== "all" && it.created_by !== filters.requester) return false;
    if (!inDateRange(it.created_at, filters.from, filters.to)) return false;
    if (!matchRef(it.sku ?? "")) return false;
    return matchesQuery(filters.q, [it.name, it.sku, it.barcode, it.ref_number, it.description]);
  }), [itemsCreated, filters, qtyMin, qtyMax, refNo]);

  // ---------- Print helpers ----------
  const printW = (r: any) => {
    const it = itemMap[r.item_id];
    printReceipt({
      kind: "withdrawal", receiptNo: receiptNo("WTH", r.id),
      title: r.return_expected ? "Borrow / Withdrawal slip" : "Withdrawal slip",
      subtitle: `Status: ${r.status.toUpperCase()}`, date: r.withdrawal_date,
      fields: [
        { label: "Warehouse", value: whMap[r.warehouse_id]?.name },
        { label: "Withdrawn by", value: r.withdrawn_by_name || userLabel(r.withdrawn_by_user_id) },
        { label: "Requested by", value: userLabel(r.requested_by) },
        { label: "Project", value: projLabel(r.project_id) },
        { label: "Project ref", value: r.project_reference || "—" },
        { label: "Return expected", value: r.return_expected ? `Yes — by ${r.expected_return_date ?? "—"}` : "No" },
        { label: "Submitted", value: new Date(r.created_at).toLocaleString() },
        { label: "Purpose", value: r.purpose, full: true },
      ],
      lineItems: [{ name: it?.name ?? "Item", sku: it?.sku, qty: r.quantity }],
      notes: r.notes || undefined,
      signatures: r.return_expected ? ["Issued by", "Borrower", "Returned to"] : ["Issued by", "Received by"],
    });
  };
  const printR = (r: any) => {
    const it = itemMap[r.item_id];
    printReceipt({
      kind: "return", receiptNo: receiptNo("RET", r.id),
      title: "Return slip",
      subtitle: `Status: ${r.status.toUpperCase()} · Condition: ${r.condition}`,
      date: r.return_date,
      fields: [
        { label: "Warehouse", value: whMap[r.warehouse_id]?.name },
        { label: "Returned by", value: r.returned_by_name || userLabel(r.returned_by_user_id) },
        { label: "Condition", value: r.condition },
        { label: "Linked withdrawal", value: r.withdrawal_id ? receiptNo("WTH", r.withdrawal_id) : "—" },
        { label: "Project", value: projLabel(r.project_id) },
        { label: "Submitted", value: new Date(r.created_at).toLocaleString() },
      ],
      lineItems: [{ name: it?.name ?? "Item", sku: it?.sku, qty: r.quantity, note: r.condition }],
      notes: r.notes || undefined,
      signatures: ["Returned by", "Received by"],
    });
  };
  const printRq = (r: any) => {
    const it = itemMap[r.item_id];
    printReceipt({
      kind: "request", receiptNo: receiptNo("REQ", r.id),
      title: r.status === "received" ? "Goods received slip" : "Stock request slip",
      subtitle: `Status: ${REQ_LABEL[r.status as ReqStatus]}`, date: r.created_at,
      fields: [
        { label: "Warehouse", value: whMap[r.warehouse_id]?.name },
        { label: "Requested by", value: userLabel(r.requested_by) },
        { label: "Project", value: projLabel(r.project_id) },
        { label: "Reason", value: r.reason || "—", full: true },
      ],
      lineItems: [{ name: it?.name ?? "Item", sku: it?.sku, qty: r.quantity }],
      signatures: r.status === "received" ? ["Received by", "Verified by"] : ["Requested by", "Approved by"],
    });
  };
  const printMv = (m: any) => {
    const it = itemMap[m.item_id];
    const titleByType: Record<string, string> = {
      in: "Stock receipt voucher", out: "Stock issue voucher",
      transfer: "Stock transfer voucher", adjustment: "Stock adjustment voucher",
    };
    printReceipt({
      kind: "movement", receiptNo: receiptNo("MV", m.id),
      title: titleByType[m.movement_type] ?? "Stock voucher",
      subtitle: `Type: ${m.movement_type.toUpperCase()}`, date: m.created_at,
      fields: [
        { label: "From warehouse", value: whMap[m.from_warehouse_id ?? ""]?.name || "—" },
        { label: "To warehouse", value: whMap[m.to_warehouse_id ?? ""]?.name || "—" },
        { label: "Created by", value: userLabel(m.created_by) },
        { label: "Reference", value: m.reference || "—" },
        { label: "Reason", value: m.reason || "—", full: true },
      ],
      lineItems: [{ name: it?.name ?? "Item", sku: it?.sku, qty: m.quantity }],
      signatures: m.movement_type === "transfer"
        ? ["Released by", "Received by", "Verified by"]
        : m.movement_type === "out" ? ["Issued by", "Received by"] : ["Received by", "Verified by"],
    });
  };

  // ---------- Filter config per tab ----------
  const statusByTab: Record<string, { value: string; label: string }[]> = {
    withdrawals: [
      { value: "pending", label: "Pending" }, { value: "approved", label: "Approved" },
      { value: "rejected", label: "Rejected" }, { value: "cancelled", label: "Cancelled" },
    ],
    returns: [
      { value: "pending", label: "Pending" }, { value: "completed", label: "Completed" },
      { value: "cancelled", label: "Cancelled" },
    ],
    requests: (Object.keys(REQ_LABEL) as ReqStatus[]).map((s) => ({ value: s, label: REQ_LABEL[s] })),
    movements: [
      { value: "in", label: "Stock in" }, { value: "out", label: "Stock out" },
      { value: "transfer", label: "Transfer" }, { value: "adjustment", label: "Adjustment" },
    ],
    items: [],
  };

  const counts = {
    withdrawals: fWithdrawals.length, returns: fReturns.length, requests: fRequests.length,
    movements: fMovements.length, items: fItems.length,
  };

  const showQty = tab !== "items";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transaction history"
        description="Browse, search and reprint receipts for every transaction across the system."
        actions={
          isAdmin ? (
            <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
              <Switch id="scope-all" checked={scopeAll} onCheckedChange={setScopeAll} />
              <Label htmlFor="scope-all" className="cursor-pointer">{scopeAll ? "All users" : "Only mine"}</Label>
            </div>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="withdrawals">Withdrawals ({withdrawals.length})</TabsTrigger>
          <TabsTrigger value="returns">Returns ({returns.length})</TabsTrigger>
          <TabsTrigger value="requests">Stock requests ({requests.length})</TabsTrigger>
          <TabsTrigger value="movements">Movements ({movements.length})</TabsTrigger>
          <TabsTrigger value="items">Items created ({itemsCreated.length})</TabsTrigger>
        </TabsList>

        <Card className="glass-card mt-3">
          <CardContent className="pt-4 space-y-3">
            <FilterBar
              values={filters}
              onChange={setFilters}
              searchPlaceholder="Search name, SKU, barcode, person, notes…"
              show={{
                q: true, category: true, warehouse: tab !== "items",
                status: tab !== "items", project: tab !== "items" && tab !== "movements",
                requester: isAdmin, from: true, to: true,
              }}
              categories={categories.map((c) => ({ value: c.id, label: c.name }))}
              warehouses={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              statuses={statusByTab[tab]}
              projects={projects.map((p) => ({ value: p.id, label: p.code ? `${p.code} · ${p.name}` : p.name }))}
              requesters={profiles.map((p) => ({ value: p.id, label: p.full_name || p.email || "User" }))}
              rightSlot={<span className="ml-auto text-xs text-muted-foreground">{counts[tab]} of {[withdrawals, returns, requests, movements, itemsCreated][["withdrawals","returns","requests","movements","items"].indexOf(tab)].length}</span>}
            />

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Input
                  placeholder="Receipt no. (e.g. WTH-AB12CD)"
                  value={refNo}
                  onChange={(e) => setRefNo(e.target.value)}
                  className="h-9 w-[230px] font-mono text-xs uppercase"
                />
              </div>
              {showQty && (
                <>
                  <Input
                    type="number" min={0} placeholder="Min qty" value={qtyMin}
                    onChange={(e) => setQtyMin(e.target.value)} className="h-9 w-[110px]"
                  />
                  <Input
                    type="number" min={0} placeholder="Max qty" value={qtyMax}
                    onChange={(e) => setQtyMax(e.target.value)} className="h-9 w-[110px]"
                  />
                </>
              )}
              <Button variant="ghost" size="sm" onClick={reset}>Reset all</Button>
            </div>

            <TabsContent value="withdrawals" className="m-0">
              <SimpleTable
                cols={["Date", "Receipt", "Item", "Warehouse", "Qty", "By", "Purpose", "Status", "Print"]}
                empty={loading ? "Loading…" : "No withdrawals."}
                rows={fWithdrawals.map((r) => ({
                  key: r.id,
                  cells: [
                    r.withdrawal_date,
                    <span className="font-mono text-[11px]">{receiptNo("WTH", r.id)}</span>,
                    <ItemCell name={itemMap[r.item_id]?.name} sku={itemMap[r.item_id]?.sku} />,
                    whMap[r.warehouse_id]?.name ?? "—",
                    <span className="tabular-nums">{r.quantity}</span>,
                    r.withdrawn_by_name || userLabel(r.withdrawn_by_user_id),
                    <span className="line-clamp-1 max-w-[200px]" title={r.purpose}>{r.purpose}</span>,
                    <Badge variant="outline">{r.status}</Badge>,
                    <PrintBtn onClick={() => printW(r)} />,
                  ],
                }))}
              />
            </TabsContent>

            <TabsContent value="returns" className="m-0">
              <SimpleTable
                cols={["Date", "Receipt", "Item", "Warehouse", "Qty", "By", "Condition", "Status", "Print"]}
                empty={loading ? "Loading…" : "No returns."}
                rows={fReturns.map((r) => ({
                  key: r.id,
                  cells: [
                    r.return_date,
                    <span className="font-mono text-[11px]">{receiptNo("RET", r.id)}</span>,
                    <ItemCell name={itemMap[r.item_id]?.name} sku={itemMap[r.item_id]?.sku} />,
                    whMap[r.warehouse_id]?.name ?? "—",
                    <span className="tabular-nums">{r.quantity}</span>,
                    r.returned_by_name || userLabel(r.returned_by_user_id),
                    <Badge variant="outline">{r.condition}</Badge>,
                    <Badge variant="outline">{r.status}</Badge>,
                    <PrintBtn onClick={() => printR(r)} />,
                  ],
                }))}
              />
            </TabsContent>

            <TabsContent value="requests" className="m-0">
              <SimpleTable
                cols={["Date", "Receipt", "Item", "Warehouse", "Qty", "Requested by", "Project", "Status", "Print"]}
                empty={loading ? "Loading…" : "No requests."}
                rows={fRequests.map((r) => ({
                  key: r.id,
                  cells: [
                    new Date(r.created_at).toLocaleDateString(),
                    <span className="font-mono text-[11px]">{receiptNo("REQ", r.id)}</span>,
                    <ItemCell name={itemMap[r.item_id]?.name} sku={itemMap[r.item_id]?.sku} />,
                    whMap[r.warehouse_id]?.name ?? "—",
                    <span className="tabular-nums">{r.quantity}</span>,
                    userLabel(r.requested_by),
                    projLabel(r.project_id),
                    <Badge variant="outline">{REQ_LABEL[r.status as ReqStatus] ?? r.status}</Badge>,
                    <PrintBtn onClick={() => printRq(r)} />,
                  ],
                }))}
              />
            </TabsContent>

            <TabsContent value="movements" className="m-0">
              <SimpleTable
                cols={["When", "Receipt", "Type", "Item", "Qty", "From → To", "By", "Reason", "Print"]}
                empty={loading ? "Loading…" : "No movements."}
                rows={fMovements.map((m) => ({
                  key: m.id,
                  cells: [
                    new Date(m.created_at).toLocaleString(),
                    <span className="font-mono text-[11px]">{receiptNo("MV", m.id)}</span>,
                    <Badge variant="outline">{m.movement_type}</Badge>,
                    <ItemCell name={itemMap[m.item_id]?.name} sku={itemMap[m.item_id]?.sku} />,
                    <span className="tabular-nums">{m.quantity}</span>,
                    `${whMap[m.from_warehouse_id ?? ""]?.name ?? "—"} → ${whMap[m.to_warehouse_id ?? ""]?.name ?? "—"}`,
                    userLabel(m.created_by),
                    <span className="line-clamp-1 max-w-[200px]" title={m.reason ?? ""}>{m.reason ?? "—"}</span>,
                    <PrintBtn onClick={() => printMv(m)} />,
                  ],
                }))}
              />
            </TabsContent>

            <TabsContent value="items" className="m-0">
              <SimpleTable
                cols={["Created", "SKU", "Name", "Category", "Reorder", "By"]}
                empty={loading ? "Loading…" : "No items created."}
                rows={fItems.map((it: any) => ({
                  key: it.id,
                  cells: [
                    new Date(it.created_at).toLocaleDateString(),
                    <span className="font-mono text-[11px]">{it.sku}</span>,
                    it.name,
                    categories.find((c) => c.id === it.category_id)?.name ?? "—",
                    <span className="tabular-nums">{it.reorder_level}</span>,
                    userLabel(it.created_by),
                  ],
                }))}
              />
            </TabsContent>

            {!loading && counts[tab] === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                <HistoryIcon className="h-6 w-6 opacity-50" />
                Nothing matches your filters.
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
};

const ItemCell = ({ name, sku }: { name?: string; sku?: string }) => (
  <div>
    <div className="font-medium">{name ?? "—"}</div>
    {sku && <div className="font-mono text-[10px] text-muted-foreground">{sku}</div>}
  </div>
);

const PrintBtn = ({ onClick }: { onClick: () => void }) => (
  <Button size="sm" variant="ghost" onClick={onClick} title="Print receipt">
    <Printer className="h-4 w-4" />
  </Button>
);

const SimpleTable = ({
  cols, rows, empty,
}: { cols: string[]; rows: { key: string; cells: React.ReactNode[] }[]; empty: string }) => (
  <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          {cols.map((c) => (
            <TableHead key={c} className={c === "Print" ? "text-right" : ""}>{c}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow><TableCell colSpan={cols.length} className="py-8 text-center text-sm text-muted-foreground">{empty}</TableCell></TableRow>
        )}
        {rows.map((r) => (
          <TableRow key={r.key}>
            {r.cells.map((c, i) => (
              <TableCell key={i} className={cols[i] === "Print" ? "text-right" : ""}>{c}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export default History;
