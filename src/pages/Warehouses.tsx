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
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface WH { id: string; name: string; code: string; location: string | null; is_active: boolean }

const Warehouses = () => {
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin", "manager");
  const [rows, setRows] = useState<WH[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("warehouses").select("*").order("name");
    setRows((data ?? []) as WH[]);
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const code = String(fd.get("code") ?? "").trim().toUpperCase();
    const location = String(fd.get("location") ?? "").trim() || null;
    if (!name || !code) return toast.error("Name and code required");
    const { error } = await supabase.from("warehouses").insert({ name, code, location });
    if (error) return toast.error(error.message);
    toast.success("Warehouse created"); setOpen(false); load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Warehouses"
        description="Multi-location inventory."
        actions={canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New warehouse</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create warehouse</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-3">
                <div className="space-y-1.5"><Label>Name</Label><Input name="name" required maxLength={100} /></div>
                <div className="space-y-1.5"><Label>Code</Label><Input name="code" required maxLength={20} placeholder="e.g. WH-MAIN" /></div>
                <div className="space-y-1.5"><Label>Location</Label><Input name="location" maxLength={200} /></div>
                <DialogFooter><Button type="submit">Create</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />
      <Card className="glass-card">
        <CardContent className="p-4">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono">{w.code}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{w.location ?? "—"}</TableCell>
                  <TableCell>{w.is_active ? <Badge className="bg-primary/20 text-primary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
export default Warehouses;
