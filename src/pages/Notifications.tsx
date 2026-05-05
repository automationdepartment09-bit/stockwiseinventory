import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Check, Settings2, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface Notif { id: string; title: string; body: string|null; type: string|null; link: string|null; is_read: boolean; created_at: string }

const TYPE_GROUPS: { id: string; label: string; match: (t: string|null) => boolean }[] = [
  { id: "all",         label: "All",         match: () => true },
  { id: "low_stock",   label: "Low stock",   match: (t) => t === "low_stock" },
  { id: "request",     label: "Requests",    match: (t) => !!t?.startsWith("request") },
  { id: "withdrawal",  label: "Withdrawals", match: (t) => !!t?.startsWith("withdrawal") },
  { id: "return",      label: "Returns",     match: (t) => !!t?.startsWith("return") },
];

const PREF_KEYS = ["low_stock", "request", "withdrawal", "return"] as const;
type PrefKey = typeof PREF_KEYS[number];

const Notifications = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<Notif[]>([]);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>({ low_stock: true, request: true, withdrawal: true, return: true });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200);
    setRows((data ?? []) as Notif[]);
  };
  const loadPrefs = async () => {
    if (!user) return;
    const { data } = await supabase.from("notification_preferences").select("prefs").eq("user_id", user.id).maybeSingle();
    if (data?.prefs) setPrefs((p) => ({ ...p, ...(data.prefs as any) }));
  };

  useEffect(() => { load(); loadPrefs(); }, [user]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("notif-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
        const n = payload.new as Notif;
        setRows((r) => [n, ...r]);
        toast(n.title, { description: n.body ?? undefined });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const filtered = useMemo(() => {
    const group = TYPE_GROUPS.find((g) => g.id === tab) ?? TYPE_GROUPS[0];
    return rows.filter((n) => {
      if (!group.match(n.type)) return false;
      if (unreadOnly && n.is_read) return false;
      if (q.trim()) {
        const s = q.toLowerCase();
        if (!(n.title + " " + (n.body ?? "")).toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [rows, tab, q, unreadOnly]);

  const counts = useMemo(() => {
    const r: Record<string, number> = {};
    TYPE_GROUPS.forEach((g) => { r[g.id] = rows.filter((n) => g.match(n.type) && !n.is_read).length; });
    return r;
  }, [rows]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = filtered.length > 0 && filtered.every((n) => selected.has(n.id));
  const toggleAll = () => setSelected((s) => {
    if (allChecked) { const n = new Set(s); filtered.forEach((f) => n.delete(f.id)); return n; }
    const n = new Set(s); filtered.forEach((f) => n.add(f.id)); return n;
  });

  const markAll = async () => {
    if (!user) return;
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    if (error) return toast.error(error.message);
    toast.success("All marked as read"); load();
  };
  const markSelectedRead = async () => {
    if (selected.size === 0) return;
    const { error } = await supabase.from("notifications").update({ is_read: true }).in("id", Array.from(selected));
    if (error) return toast.error(error.message);
    toast.success(`${selected.size} marked as read`); setSelected(new Set()); load();
  };
  const deleteSelected = async () => {
    if (selected.size === 0) return;
    const { error } = await supabase.from("notifications").delete().in("id", Array.from(selected));
    if (error) return toast.error(error.message);
    toast.success(`${selected.size} deleted`); setSelected(new Set()); load();
  };
  const savePrefs = async () => {
    if (!user) return;
    const { error } = await supabase.from("notification_preferences").upsert({ user_id: user.id, prefs }, { onConflict: "user_id" });
    if (error) return toast.error(error.message);
    toast.success("Preferences saved"); setPrefsOpen(false);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description="Stock alerts and activity updates."
        actions={
          <div className="flex flex-wrap gap-2">
            <Dialog open={prefsOpen} onOpenChange={setPrefsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Settings2 className="mr-2 h-4 w-4" />Preferences</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Notification preferences</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Choose which categories you'd like to see in your notifications feed. Existing notifications stay visible.</p>
                  {PREF_KEYS.map((k) => (
                    <div key={k} className="flex items-center justify-between rounded-md border p-3">
                      <Label htmlFor={`pref-${k}`} className="capitalize">{k.replace("_", " ")}</Label>
                      <Switch id={`pref-${k}`} checked={prefs[k]} onCheckedChange={(v) => setPrefs((p) => ({ ...p, [k]: v }))} />
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPrefsOpen(false)}>Cancel</Button>
                  <Button onClick={savePrefs}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" onClick={markAll}><Check className="mr-2 h-4 w-4" />Mark all read</Button>
          </div>
        }
      />

      <Card className="glass-card">
        <CardContent className="space-y-3 p-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex flex-wrap gap-1">
              {TYPE_GROUPS.map((g) => (
                <TabsTrigger key={g.id} value={g.id} className="gap-1.5">
                  {g.label}
                  {counts[g.id] > 0 && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{counts[g.id]}</Badge>}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notifications…" className="pl-9" />
            </div>
            <Select value={unreadOnly ? "unread" : "all"} onValueChange={(v) => setUnreadOnly(v === "unread")}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unread">Unread only</SelectItem>
              </SelectContent>
            </Select>
            {selected.size > 0 && (
              <>
                <Button size="sm" variant="outline" onClick={markSelectedRead}><Check className="mr-2 h-3.5 w-3.5" />Mark read ({selected.size})</Button>
                <Button size="sm" variant="destructive" onClick={deleteSelected}><Trash2 className="mr-2 h-3.5 w-3.5" />Delete</Button>
              </>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-12 text-muted-foreground">
              <Bell className="h-8 w-8" />
              <p className="text-sm">No notifications.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
                <span>Select all in view</span>
              </div>
              <ul className="divide-y divide-border rounded-md border">
                {filtered.map((n) => (
                  <li key={n.id} className={`flex items-start gap-3 p-3 ${!n.is_read ? "bg-primary/5" : ""}`}>
                    <Checkbox className="mt-1" checked={selected.has(n.id)} onCheckedChange={() => toggle(n.id)} />
                    <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${!n.is_read ? "bg-primary" : "bg-muted"}`} />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {n.link
                          ? <Link to={n.link} className="font-medium hover:underline">{n.title}</Link>
                          : <p className="font-medium">{n.title}</p>}
                        {n.type && <Badge variant="outline" className="text-[10px]">{n.type}</Badge>}
                      </div>
                      {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
export default Notifications;
