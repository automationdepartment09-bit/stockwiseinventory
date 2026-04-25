import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Send, Trash2, RefreshCw, Paperclip, ImageIcon, Download } from "lucide-react";
import { toast } from "sonner";

type Direction = "in" | "out";
interface Chat { id: string; title: string; chat_id: number }
interface Msg {
  id: string;
  chat_id: number;
  message_id: number | null;
  direction: Direction;
  sender_name: string | null;
  sender_user_id: string | null;
  text: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  deleted_at: string | null;
  created_at: string;
}

const Chat = () => {
  const { user, hasRole } = useAuth();
  const canManage = hasRole("admin", "manager");
  const isAdmin = hasRole("admin");
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [polling, setPolling] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Msg | null>(null);
  const [discovered, setDiscovered] = useState<{ chat_id: number; sender_name: string | null }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = useMemo(() => chats.find((c) => c.id === activeId) ?? null, [chats, activeId]);

  const loadChats = async () => {
    const { data } = await supabase.from("telegram_chats").select("*").order("created_at");
    const list = (data ?? []) as Chat[];
    setChats(list);
    if (!activeId && list[0]) setActiveId(list[0].id);
  };

  const loadMessages = async (chatId: number) => {
    const { data } = await supabase
      .from("telegram_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages((data ?? []) as Msg[]);
  };

  useEffect(() => { loadChats(); }, []);

  useEffect(() => {
    if (!active) { setMessages([]); return; }
    loadMessages(active.chat_id);
    const channel = supabase
      .channel(`tg-${active.chat_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "telegram_messages", filter: `chat_id=eq.${active.chat_id}` }, () => {
        loadMessages(active.chat_id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [active?.chat_id]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Auto-poll every 15s
  useEffect(() => {
    const t = setInterval(() => { pollOnce(true); }, 15000);
    return () => clearInterval(t);
  }, []);

  const pollOnce = async (silent = false) => {
    setPolling(true);
    const { error } = await supabase.functions.invoke("telegram-poll");
    setPolling(false);
    if (error && !silent) toast.error(error.message);
  };

  const createChat = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    const chat_id = Number(fd.get("chat_id"));
    if (!title || !chat_id) return toast.error("Title and chat ID required");
    const { error } = await supabase.from("telegram_chats").insert({ title, chat_id, created_by: user?.id });
    if (error) return toast.error(error.message);
    toast.success("Chat added"); setNewOpen(false); loadChats();
  };

  const uploadAttachment = async (file: File): Promise<{ url: string; type: string; name: string } | null> => {
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `outgoing/${user?.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("chat-attachments").upload(path, file, { contentType: file.type, upsert: false });
    if (error) { toast.error(error.message); return null; }
    const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(path, 60 * 60 * 24 * 30);
    if (!data?.signedUrl) return null;
    const isImage = file.type.startsWith("image/");
    return { url: data.signedUrl, type: isImage ? "photo" : "document", name: file.name };
  };

  const send = async (file?: File) => {
    if (!active) return;
    if (!text.trim() && !file) return;
    setSending(true);
    let attachment: { url: string; type: string; name: string } | null = null;
    if (file) {
      attachment = await uploadAttachment(file);
      if (!attachment) { setSending(false); return; }
    }
    const { data, error } = await supabase.functions.invoke("telegram-send", {
      body: {
        chat_id: active.chat_id,
        text: text.trim() || undefined,
        attachment_url: attachment?.url,
        attachment_type: attachment?.type,
        attachment_name: attachment?.name,
      },
    });
    setSending(false);
    // Surface real Telegram error (e.g. "chat not found", "bot was blocked")
    const apiErr = (data as any)?.error || (data as any)?.details?.description;
    if (error || apiErr) {
      const msg = apiErr || error?.message || "Failed to send";
      return toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    setText("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) send(f);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.functions.invoke("telegram-delete", { body: { id: toDelete.id } });
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    setToDelete(null);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Chat"
        description="Telegram-powered DMs. Send text, files, and images."
        actions={
          <>
            <Button variant="outline" onClick={() => pollOnce()} disabled={polling}>
              <RefreshCw className={`mr-2 h-4 w-4 ${polling ? "animate-spin" : ""}`} />Refresh
            </Button>
            {canManage && (
              <Dialog open={newOpen} onOpenChange={async (o) => {
                setNewOpen(o);
                if (o) {
                  await pollOnce(true);
                  const { data } = await supabase
                    .from("telegram_messages")
                    .select("chat_id, sender_name")
                    .eq("direction", "in")
                    .order("created_at", { ascending: false })
                    .limit(50);
                  const seen = new Set<number>();
                  const uniq: { chat_id: number; sender_name: string | null }[] = [];
                  (data ?? []).forEach((r: any) => {
                    if (!seen.has(r.chat_id)) { seen.add(r.chat_id); uniq.push(r); }
                  });
                  setDiscovered(uniq);
                }
              }}>
                <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Add chat</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Telegram chat</DialogTitle></DialogHeader>
                  {discovered.length > 0 && (
                    <div className="rounded-md border p-2">
                      <div className="mb-1 text-xs font-medium text-muted-foreground">Detected from incoming messages — click to use</div>
                      <div className="flex flex-wrap gap-1">
                        {discovered.map((d) => (
                          <button
                            key={d.chat_id}
                            type="button"
                            onClick={() => {
                              const titleEl = document.querySelector<HTMLInputElement>('input[name="title"]');
                              const idEl = document.querySelector<HTMLInputElement>('input[name="chat_id"]');
                              if (titleEl) titleEl.value = d.sender_name ?? `Chat ${d.chat_id}`;
                              if (idEl) idEl.value = String(d.chat_id);
                            }}
                            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                          >
                            {d.sender_name ?? "Unknown"} · {d.chat_id}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <form onSubmit={createChat} className="space-y-3">
                    <div className="space-y-1.5"><Label>Display title</Label><Input name="title" required maxLength={100} placeholder="e.g. Warehouse team" /></div>
                    <div className="space-y-1.5">
                      <Label>Telegram chat ID</Label>
                      <Input name="chat_id" required type="number" placeholder="e.g. 123456789 or -1001234567890" />
                      <p className="text-xs text-muted-foreground">
                        Tip: open Telegram, search for your bot, send it any message (or add it to a group), then click Refresh and reopen this dialog — the chat will appear above.
                      </p>
                    </div>
                    <DialogFooter><Button type="submit">Add</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="glass-card">
          <CardContent className="p-2">
            {chats.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">No chats yet. Add one to start.</p>
            )}
            <div className="space-y-1">
              {chats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    c.id === activeId ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-muted"
                  }`}
                >
                  <div className="font-medium">{c.title}</div>
                  <div className="text-[10px] text-muted-foreground">{c.chat_id}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
          <CardContent className="flex flex-1 flex-col p-0">
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {!active && <p className="text-center text-sm text-muted-foreground">Select a chat.</p>}
              {active && messages.length === 0 && <p className="text-center text-sm text-muted-foreground">No messages yet.</p>}
              {messages.map((m) => {
                const mine = m.direction === "out";
                const deleted = !!m.deleted_at;
                const canDelete = !deleted && (m.sender_user_id === user?.id || isAdmin) && m.direction === "out";
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`group max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      mine ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}>
                      <div className="mb-0.5 text-[10px] opacity-70">
                        {m.sender_name ?? (mine ? "You" : "Telegram")} · {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      {deleted ? (
                        <em className="opacity-70">Message deleted</em>
                      ) : (
                        <>
                          {m.attachment_url && m.attachment_type === "photo" && (
                            <a href={m.attachment_url} target="_blank" rel="noreferrer">
                              <img src={m.attachment_url} alt={m.attachment_name ?? "image"} className="mb-1 max-h-60 rounded-md" />
                            </a>
                          )}
                          {m.attachment_url && m.attachment_type !== "photo" && (
                            <a href={m.attachment_url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-md bg-background/30 px-2 py-1 text-xs underline">
                              <Download className="h-3 w-3" />{m.attachment_name ?? "Download"}
                            </a>
                          )}
                          {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                        </>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => setToDelete(m)}
                          className="mt-1 hidden rounded text-[10px] opacity-70 hover:underline group-hover:inline-flex"
                        >
                          <Trash2 className="mr-1 inline h-3 w-3" />Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {active && (
              <div className="border-t p-3">
                <div className="flex items-end gap-2">
                  <input ref={fileRef} type="file" className="hidden" onChange={onPickFile} accept="image/*,application/pdf,application/zip,text/*" />
                  <Button type="button" variant="outline" size="icon" onClick={() => { if (fileRef.current) { fileRef.current.accept = "image/*"; fileRef.current.click(); } }} disabled={sending} title="Send image">
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={() => { if (fileRef.current) { fileRef.current.accept = "*/*"; fileRef.current.click(); } }} disabled={sending} title="Send file">
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder="Type a message…"
                    className="min-h-[44px] max-h-32 flex-1 resize-none"
                  />
                  <Button onClick={() => send()} disabled={sending || !text.trim()}><Send className="mr-1 h-4 w-4" />Send</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              The message will be removed from this app and from Telegram (if still within Telegram's allowed window).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Chat;
