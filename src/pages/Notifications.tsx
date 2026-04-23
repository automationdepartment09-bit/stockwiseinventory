import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Check } from "lucide-react";
import { toast } from "sonner";

interface Notif { id: string; title: string; body: string|null; type: string|null; link: string|null; is_read: boolean; created_at: string }

const Notifications = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<Notif[]>([]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
    setRows((data ?? []) as Notif[]);
  };
  useEffect(() => { load(); }, [user]);

  const markAll = async () => {
    if (!user) return;
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    if (error) return toast.error(error.message);
    toast.success("All marked as read"); load();
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Notifications" description="Stock alerts and activity updates." actions={<Button variant="outline" onClick={markAll}><Check className="mr-2 h-4 w-4" />Mark all read</Button>} />
      <Card className="glass-card">
        <CardContent className="p-0">
          {rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-12 text-muted-foreground">
              <Bell className="h-8 w-8" />
              <p className="text-sm">No notifications yet.</p>
            </div>
          )}
          <ul className="divide-y divide-border">
            {rows.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 p-4 ${!n.is_read ? "bg-primary/5" : ""}`}>
                <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${!n.is_read ? "bg-primary" : "bg-muted"}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{n.title}</p>
                    {n.type && <Badge variant="outline" className="text-[10px]">{n.type}</Badge>}
                  </div>
                  {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};
export default Notifications;
