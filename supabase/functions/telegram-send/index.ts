import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

interface SendBody {
  chat_id: number;
  text?: string;
  attachment_url?: string;
  attachment_type?: string; // "photo" | "document"
  attachment_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const body = (await req.json()) as SendBody;
    if (!body?.chat_id || (!body.text && !body.attachment_url)) {
      return new Response(JSON.stringify({ error: "chat_id and text or attachment required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let endpoint = "sendMessage";
    let payload: Record<string, unknown> = { chat_id: body.chat_id, text: body.text ?? "" };

    if (body.attachment_url) {
      if (body.attachment_type === "photo") {
        endpoint = "sendPhoto";
        payload = { chat_id: body.chat_id, photo: body.attachment_url, caption: body.text ?? undefined };
      } else {
        endpoint = "sendDocument";
        payload = { chat_id: body.chat_id, document: body.attachment_url, caption: body.text ?? undefined };
      }
    }

    const tgRes = await fetch(`${GATEWAY_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const tgData = await tgRes.json();
    if (!tgRes.ok || !tgData.ok) {
      return new Response(JSON.stringify({ error: "Telegram error", details: tgData }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageId = tgData.result?.message_id;

    // Store outgoing message
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile } = await admin.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle();
    const senderName = profile?.full_name || profile?.email || "User";

    await admin.from("telegram_messages").insert({
      message_id: messageId,
      chat_id: body.chat_id,
      direction: "out",
      sender_user_id: user.id,
      sender_name: senderName,
      text: body.text ?? null,
      attachment_url: body.attachment_url ?? null,
      attachment_type: body.attachment_type ?? null,
      attachment_name: body.attachment_name ?? null,
    });

    return new Response(JSON.stringify({ ok: true, message_id: messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
