import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Row { id: string; user_id: string|null; table_name: string; record_id: string|null; action: string; changes: any; created_at: string }

const AdminAudit = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [users, setUsers] = useState<Map<string,string>>(new Map());

  useEffect(() => {
    const load = async () => {
      const [{ data }, { data: profs }] = await Promise.all([
        supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("profiles").select("id, email"),
      ]);
      setRows((data ?? []) as Row[]);
      setUsers(new Map((profs ?? []).map((p: any) => [p.id, p.email])));
    };
    load();
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" description="All changes to items, categories, warehouses, movements, and roles." />
      <Card className="glass-card">
        <CardContent className="p-4">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Table</TableHead><TableHead>Action</TableHead><TableHead>Record</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{users.get(r.user_id ?? "") ?? "system"}</TableCell>
                  <TableCell><Badge variant="outline">{r.table_name}</Badge></TableCell>
                  <TableCell><Badge className={r.action === "DELETE" ? "bg-destructive/20 text-destructive" : r.action === "UPDATE" ? "bg-warning/20 text-warning" : "bg-primary/20 text-primary"}>{r.action}</Badge></TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">{r.record_id?.slice(0,8)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No activity yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
export default AdminAudit;
