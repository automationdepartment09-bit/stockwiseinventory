import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

// Single short poll (called on demand from the chat UI to fetch new updates)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Server not configured" }), { status: 500, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: state } = await admin.from("telegram_bot_state").select("update_offset").eq("id", 1).single();
    const offset = state?.update_offset ?? 0;

    const tgRes = await fetch(`${GATEWAY_URL}/getUpdates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ offset, timeout: 0, allowed_updates: ["message"] }),
    });
    const tgData = await tgRes.json();
    if (!tgRes.ok || !tgData.ok) {
      return new Response(JSON.stringify({ error: "Telegram error", details: tgData }), { status: 502, headers: corsHeaders });
    }

    const updates = tgData.result ?? [];
    let processed = 0;

    for (const u of updates) {
      const msg = u.message;
      if (!msg) continue;

      let attachment_url: string | null = null;
      let attachment_type: string | null = null;
      let attachment_name: string | null = null;
      let telegram_file_id: string | null = null;

      const fileId = msg.photo?.[msg.photo.length - 1]?.file_id || msg.document?.file_id;
      if (fileId) {
        telegram_file_id = fileId;
        attachment_type = msg.photo ? "photo" : "document";
        attachment_name = msg.document?.file_name ?? null;
        // Get file path & download then upload to storage
        try {
          const fr = await fetch(`${GATEWAY_URL}/getFile`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": TELEGRAM_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ file_id: fileId }),
          });
          const fd = await fr.json();
          if (fr.ok && fd.ok) {
            const filePath = fd.result.file_path as string;
            const dl = await fetch(`${GATEWAY_URL}/file/${filePath}`, {
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "X-Connection-Api-Key": TELEGRAM_API_KEY,
              },
            });
            if (dl.ok) {
              const bytes = new Uint8Array(await dl.arrayBuffer());
              const ext = filePath.split(".").pop() ?? "bin";
              const objectPath = `incoming/${msg.chat.id}/${u.update_id}.${ext}`;
              await admin.storage.from("chat-attachments").upload(objectPath, bytes, {
                contentType: attachment_type === "photo" ? `image/${ext}` : "application/octet-stream",
                upsert: true,
              });
              const { data: signed } = await admin.storage.from("chat-attachments").createSignedUrl(objectPath, 60 * 60 * 24 * 30);
              attachment_url = signed?.signedUrl ?? null;
              if (!attachment_name) attachment_name = `file.${ext}`;
            }
          }
        } catch (_) { /* ignore */ }
      }

      const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || msg.from?.username || "Telegram user";

      await admin.from("telegram_messages").upsert({
        update_id: u.update_id,
        message_id: msg.message_id,
        chat_id: msg.chat.id,
        direction: "in",
        sender_name: senderName,
        text: msg.text ?? msg.caption ?? null,
        attachment_url,
        attachment_type,
        attachment_name,
        telegram_file_id,
        raw: u,
      }, { onConflict: "update_id" });
      processed++;
    }

    if (updates.length > 0) {
      const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
      await admin.from("telegram_bot_state").update({ update_offset: newOffset, updated_at: new Date().toISOString() }).eq("id", 1);
    }

    return new Response(JSON.stringify({ ok: true, processed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: corsHeaders });
  }
});
