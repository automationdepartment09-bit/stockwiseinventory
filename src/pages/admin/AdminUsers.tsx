import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Role = "admin"|"manager"|"staff"|"viewer";
interface Row { id: string; email: string|null; full_name: string|null; roles: Role[] }

const AdminUsers = () => {
  const [rows, setRows] = useState<Row[]>([]);

  const load = async () => {
    const [{ data: profs }, { data: ur }] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const map = new Map<string, Role[]>();
    (ur ?? []).forEach((r: any) => {
      map.set(r.user_id, [...(map.get(r.user_id) ?? []), r.role]);
    });
    setRows((profs ?? []).map((p: any) => ({ id: p.id, email: p.email, full_name: p.full_name, roles: map.get(p.id) ?? [] })));
  };
  useEffect(() => { load(); }, []);

  const setRole = async (uid: string, role: Role) => {
    // remove existing roles, set new single role
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", uid);
    if (delErr) return toast.error(delErr.message);
    const { error: insErr } = await supabase.from("user_roles").insert({ user_id: uid, role });
    if (insErr) return toast.error(insErr.message);
    toast.success("Role updated"); load();
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Users & Roles" description="Manage who can access what." />
      <Card className="glass-card">
        <CardContent className="p-4">
          <Table>
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Email</TableHead><TableHead>Current roles</TableHead><TableHead className="w-48">Set role</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.full_name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.email}</TableCell>
                  <TableCell className="space-x-1">
                    {r.roles.length === 0 && <Badge variant="outline">none</Badge>}
                    {r.roles.map((role) => <Badge key={role} className={role === "admin" ? "bg-primary/20 text-primary" : "bg-secondary/20 text-secondary"}>{role}</Badge>)}
                  </TableCell>
                  <TableCell>
                    <Select onValueChange={(v) => setRole(r.id, v as Role)}>
                      <SelectTrigger><SelectValue placeholder="Change…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
export default AdminUsers;
