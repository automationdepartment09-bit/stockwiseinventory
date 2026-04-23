import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Boxes, DollarSign, Package, TrendingUp, Warehouse } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";

interface KPIs {
  totalItems: number;
  totalUnits: number;
  totalValue: number;
  warehouses: number;
  lowStock: number;
}

const Dashboard = () => {
  const [kpi, setKpi] = useState<KPIs>({ totalItems: 0, totalUnits: 0, totalValue: 0, warehouses: 0, lowStock: 0 });
  const [series, setSeries] = useState<{ date: string; in: number; out: number }[]>([]);
  const [topItems, setTopItems] = useState<{ name: string; qty: number }[]>([]);
  const [lowStockList, setLowStockList] = useState<{ name: string; sku: string; qty: number; reorder: number }[]>([]);

  useEffect(() => {
    const load = async () => {
      const [{ data: items }, { data: levels }, { count: whCount }] = await Promise.all([
        supabase.from("items").select("id, sku, name, unit_price, reorder_level"),
        supabase.from("stock_levels").select("item_id, quantity"),
        supabase.from("warehouses").select("*", { count: "exact", head: true }),
      ]);

      const qtyByItem = new Map<string, number>();
      (levels ?? []).forEach((l: any) => qtyByItem.set(l.item_id, (qtyByItem.get(l.item_id) ?? 0) + l.quantity));
      const totalUnits = Array.from(qtyByItem.values()).reduce((a, b) => a + b, 0);
      const totalValue = (items ?? []).reduce((sum, it: any) => sum + (qtyByItem.get(it.id) ?? 0) * Number(it.unit_price), 0);
      const lowStock = (items ?? []).filter((it: any) => it.reorder_level > 0 && (qtyByItem.get(it.id) ?? 0) <= it.reorder_level);

      setKpi({
        totalItems: items?.length ?? 0,
        totalUnits,
        totalValue,
        warehouses: whCount ?? 0,
        lowStock: lowStock.length,
      });

      setLowStockList(
        lowStock.slice(0, 6).map((it: any) => ({
          name: it.name, sku: it.sku, qty: qtyByItem.get(it.id) ?? 0, reorder: it.reorder_level,
        })),
      );

      setTopItems(
        (items ?? [])
          .map((it: any) => ({ name: it.name, qty: qtyByItem.get(it.id) ?? 0 }))
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 6),
      );

      // movements last 14 days
      const from = new Date();
      from.setDate(from.getDate() - 13);
      const { data: moves } = await supabase
        .from("stock_movements")
        .select("movement_type, quantity, created_at")
        .gte("created_at", from.toISOString());

      const byDay = new Map<string, { in: number; out: number }>();
      for (let i = 0; i < 14; i++) {
        const d = new Date(from); d.setDate(from.getDate() + i);
        byDay.set(d.toISOString().slice(0, 10), { in: 0, out: 0 });
      }
      (moves ?? []).forEach((m: any) => {
        const k = m.created_at.slice(0, 10);
        const cur = byDay.get(k) ?? { in: 0, out: 0 };
        if (m.movement_type === "in" || m.movement_type === "adjustment") cur.in += m.quantity;
        else if (m.movement_type === "out") cur.out += m.quantity;
        byDay.set(k, cur);
      });
      setSeries(Array.from(byDay.entries()).map(([date, v]) => ({ date: date.slice(5), ...v })));
    };
    load();
  }, []);

  const cards = [
    { label: "Total items", value: kpi.totalItems.toLocaleString(), icon: Package, accent: "from-primary/20 to-primary/5" },
    { label: "Units in stock", value: kpi.totalUnits.toLocaleString(), icon: Boxes, accent: "from-secondary/20 to-secondary/5" },
    { label: "Stock value", value: `$${kpi.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: DollarSign, accent: "from-primary/20 to-secondary/10" },
    { label: "Warehouses", value: kpi.warehouses, icon: Warehouse, accent: "from-secondary/20 to-primary/10" },
    { label: "Low stock", value: kpi.lowStock, icon: AlertTriangle, accent: "from-destructive/20 to-destructive/5" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="At-a-glance view of your inventory health." />

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label} className="glass-card relative overflow-hidden">
            <div className={`absolute inset-0 -z-0 bg-gradient-to-br ${c.accent} opacity-60`} />
            <CardContent className="relative z-10 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</span>
                <c.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-2 text-2xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="glass-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" /> Stock movement (14 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--secondary))" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="hsl(var(--secondary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Area type="monotone" dataKey="in" stroke="hsl(var(--primary))" fill="url(#gIn)" />
                <Area type="monotone" dataKey="out" stroke="hsl(var(--secondary))" fill="url(#gOut)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Low stock alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lowStockList.length === 0 && <p className="text-sm text-muted-foreground">All items above reorder level.</p>}
            {lowStockList.map((it) => (
              <div key={it.sku} className="flex items-center justify-between rounded-md border border-border p-2">
                <div>
                  <div className="text-sm font-medium">{it.name}</div>
                  <div className="text-xs text-muted-foreground">{it.sku}</div>
                </div>
                <Badge variant="destructive">{it.qty} / {it.reorder}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Top items by quantity</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topItems}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Bar dataKey="qty" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
