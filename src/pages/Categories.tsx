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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Cat { id: string; name: string; description: string | null; sku_prefix: string; sku_seq: number }

const Categories = () => {
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin", "manager");
  const [rows, setRows] = useState<Cat[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("categories").select("*").order("name");
    setRows((data ?? []) as Cat[]);
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const sku_prefix = String(fd.get("sku_prefix") ?? "").trim().toUpperCase();
    const description = String(fd.get("description") ?? "").trim() || null;
    if (!name || !sku_prefix) return toast.error("Name and SKU prefix required");
    const { error } = await supabase.from("categories").insert({ name, sku_prefix, description });
    if (error) return toast.error(error.message);
    toast.success("Category created");
    setOpen(false); load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Categories"
        description="Group items and define their SKU prefix."
        actions={canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New category</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create category</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-3">
                <div className="space-y-1.5"><Label>Name</Label><Input name="name" required maxLength={100} /></div>
                <div className="space-y-1.5"><Label>SKU prefix</Label><Input name="sku_prefix" required maxLength={10} placeholder="e.g. ELC" /></div>
                <div className="space-y-1.5"><Label>Description</Label><Input name="description" maxLength={300} /></div>
                <DialogFooter><Button type="submit">Create</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />

      <Card className="glass-card">
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Name</TableHead><TableHead>Prefix</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Items numbered</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono">{c.sku_prefix}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{c.description ?? "—"}</TableCell>
                  <TableCell className="text-right">{c.sku_seq}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
export default Categories;
