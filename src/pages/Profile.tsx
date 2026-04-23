import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const Profile = () => {
  const { user, roles } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle().then(({ data }) => setName(data?.full_name ?? ""));
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Profile" />
      <Card className="glass-card max-w-xl">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14"><AvatarFallback className="bg-gradient-brand text-primary-foreground">{(user?.email ?? "U").slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
            <div>
              <div className="font-medium">{user?.email}</div>
              <div className="mt-1 flex gap-1">{roles.map(r => <Badge key={r} variant="outline">{r}</Badge>)}</div>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></div>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </CardContent>
      </Card>
    </div>
  );
};
export default Profile;
