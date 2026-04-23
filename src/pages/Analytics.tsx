import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

const COLORS = ["hsl(158 80% 45%)", "hsl(263 70% 60%)", "hsl(38 92% 55%)", "hsl(199 89% 60%)", "hsl(330 81% 60%)", "hsl(0 75% 60%)"];

const Analytics = () => {
  const [byCategory, setByCategory] = useState<{name:string;value:number}[]>([]);
  const [byWarehouse, setByWarehouse] = useState<{name:string;qty:number;value:number}[]>([]);
  const [movementSummary, setMovementSummary] = useState<{type:string;count:number;qty:number}[]>([]);

  useEffect(() => {
    const load = async () => {
      const [{ data: items }, { data: cats }, { data: levels }, { data: whs }, { data: moves }] = await Promise.all([
        supabase.from("items").select("id, category_id, unit_price"),
        supabase.from("categories").select("id, name"),
        supabase.from("stock_levels").select("item_id, warehouse_id, quantity"),
        supabase.from("warehouses").select("id, name"),
        supabase.from("stock_movements").select("movement_type, quantity"),
      ]);

      // by category (value)
      const itemMap = new Map((items??[]).map((i:any)=>[i.id, i]));
      const qtyByItem = new Map<string,number>();
      (levels??[]).forEach((l:any)=>qtyByItem.set(l.item_id,(qtyByItem.get(l.item_id)??0)+l.quantity));
      const catVal = new Map<string, number>();
      (items??[]).forEach((it:any)=>{
        const v = (qtyByItem.get(it.id)??0) * Number(it.unit_price);
        catVal.set(it.category_id ?? "uncat", (catVal.get(it.category_id ?? "uncat") ?? 0) + v);
      });
      const catName = new Map((cats??[]).map((c:any)=>[c.id,c.name]));
      setByCategory(Array.from(catVal.entries()).map(([id,v])=>({ name: catName.get(id) ?? "Uncategorized", value: Math.round(v) })));

      // by warehouse
      const whName = new Map((whs??[]).map((w:any)=>[w.id,w.name]));
      const whAgg = new Map<string,{qty:number;value:number}>();
      (levels??[]).forEach((l:any)=>{
        const it:any = itemMap.get(l.item_id);
        const cur = whAgg.get(l.warehouse_id) ?? { qty: 0, value: 0 };
        cur.qty += l.quantity;
        cur.value += l.quantity * Number(it?.unit_price ?? 0);
        whAgg.set(l.warehouse_id, cur);
      });
      setByWarehouse(Array.from(whAgg.entries()).map(([id,v])=>({ name: whName.get(id) ?? "?", qty: v.qty, value: Math.round(v.value) })));

      // movements summary
      const ms = new Map<string,{count:number;qty:number}>();
      (moves??[]).forEach((m:any)=>{
        const cur = ms.get(m.movement_type) ?? { count: 0, qty: 0 };
        cur.count++; cur.qty += m.quantity;
        ms.set(m.movement_type, cur);
      });
      setMovementSummary(Array.from(ms.entries()).map(([type,v])=>({ type, ...v })));
    };
    load();
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader title="Advanced analytics" description="Stock value, distribution, and activity." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base">Stock value by category</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={100} innerRadius={60} paddingAngle={3}>
                  {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v:any)=>`₱${Number(v).toLocaleString()}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base">Inventory by warehouse</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byWarehouse}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="qty" name="Units" fill="hsl(var(--primary))" radius={[6,6,0,0]} />
                <Bar dataKey="value" name="Value ₱" fill="hsl(var(--secondary))" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">Movements summary</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={movementSummary}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="type" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="count" name="Transactions" fill="hsl(var(--secondary))" radius={[6,6,0,0]} />
              <Bar dataKey="qty" name="Units" fill="hsl(var(--primary))" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};
export default Analytics;
