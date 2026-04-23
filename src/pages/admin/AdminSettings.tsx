import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const AdminSettings = () => (
  <div className="space-y-4">
    <PageHeader title="Settings" description="Workspace preferences." />
    <Card className="glass-card">
      <CardHeader><CardTitle className="text-base">About Stockwise</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>Stockwise is your inventory operating system. v1 includes catalog, multi-warehouse stock, automatic SKUs, role-based access, audit log, low-stock alerts, and analytics.</p>
        <p>Coming next: realtime team & DM chat, suppliers, purchase orders, and barcode scanning.</p>
      </CardContent>
    </Card>
  </div>
);
export default AdminSettings;
