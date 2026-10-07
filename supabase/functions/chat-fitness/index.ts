import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.2";
import { consumeAiRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!token || !supabaseUrl || !anonKey || !serviceKey) return json({ error: "Autenticação necessária" }, 401);
    if (!openAiKey) return json({ error: "A integração com IA ainda não foi configurada." }, 503);

    const bodyText = await req.text();
    if (new TextEncoder().encode(bodyText).byteLength > 8_000) return json({ error: "Requisição muito grande" }, 413);
    const body = JSON.parse(bodyText);
    const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!conversationId || !message || message.length > 4_000) return json({ error: "Mensagem inválida" }, 400);

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return json({ error: "Sessão inválida" }, 401);

    const rateLimit = await consumeAiRateLimit("chat-fitness", authorization);
    if (rateLimit.unavailable) return json({ error: "Serviço temporariamente indisponível" }, 503);
    if (!rateLimit.allowed) return json({ error: "Limite de uso atingido. Tente novamente mais tarde." }, 429);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const [{ data: conversation }, { data: profile }, { data: history }] = await Promise.all([
      admin.from("coach_conversations").select("id,title").eq("id", conversationId).eq("user_id", user.id).maybeSingle(),
      admin.from("profiles").select("name,level,goal").eq("user_id", user.id).maybeSingle(),
      admin.from("profile_private").select("age,weight,height,sleep_hours,sleep_quality,weekly_frequency,training_time,allergies,dietary_restrictions").eq("user_id", user.id).maybeSingle(),
    ]);
    if (!conversation) return json({ error: "Conversa não encontrada" }, 404);

    const { data: previous, error: historyError } = await admin.from("chat_messages")
      .select("role,content").eq("user_id", user.id).eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }).limit(30);
    if (historyError) return json({ error: "Não foi possível carregar a conversa" }, 500);

    const profileContext = profile || history
      ? `Perfil verificado do atleta: ${profile?.name || "Atleta"}; idade ${history?.age ?? "não informada"}; peso ${history?.weight ?? "não informado"} kg; altura ${history?.height ?? "não informada"} cm; nível ${profile?.level ?? "não informado"}; objetivo ${profile?.goal ?? "não informado"}; treino ${history?.weekly_frequency ?? "não informado"} vezes/semana no período ${history?.training_time ?? "não informado"}; sono ${history?.sleep_hours ?? "não informado"} horas, qualidade ${history?.sleep_quality ?? "não informada"}; alergias ${history?.allergies || "não informadas"}; restrições ${history?.dietary_restrictions || "nenhuma informada"}.`
      : "O usuário ainda não preencheu o perfil.";
    const instructions = `Você é o MultiFit Coach, um assistente de treino, nutrição, sono e recuperação. Responda sempre em português brasileiro, de forma clara, prática e direta. ${profileContext}\n\nPersonalize com o perfil apenas quando ajudar. Use markdown. Nunca diagnostique nem recomende medicamentos. Em caso de sintomas, lesão ou condição clínica, oriente procurar profissional de saúde. Para dietas, respeite alergias e restrições.`;

    const { error: saveUserError } = await admin.from("chat_messages").insert({
      user_id: user.id, conversation_id: conversationId, role: "user", content: message,
    });
    if (saveUserError) return json({ error: "Não foi possível salvar sua mensagem" }, 500);
    if (conversation.title === "Nova conversa") {
      await admin.from("coach_conversations").update({ title: message.slice(0, 80) }).eq("id", conversationId).eq("user_id", user.id);
    }

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini",
        instructions,
        input: [...(previous || []).reverse(), { role: "user", content: message }],
        stream: true,
        max_output_tokens: 1_200,
        store: false,
      }),
    });
    if (!openAiResponse.ok || !openAiResponse.body) {
      console.error("OpenAI request failed", openAiResponse.status);
      return json({ error: "O serviço de IA está indisponível no momento." }, openAiResponse.status === 429 ? 429 : 502);
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";
    let answer = "";
    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const data = JSON.parse(dataLine.slice(6));
            if (data.type === "response.output_text.delta" && typeof data.delta === "string") answer += data.delta;
            if (data.type === "error" || data.type === "response.failed") console.error("OpenAI stream reported failure");
          } catch { /* Ignore non-JSON keepalive events. */ }
        }
        controller.enqueue(chunk);
      },
      async flush() {
        const trailing = buffer.match(/data: (\{.*\})/s)?.[1];
        if (trailing) {
          try {
            const data = JSON.parse(trailing);
            if (data.type === "response.output_text.delta" && typeof data.delta === "string") answer += data.delta;
          } catch { /* Ignore incomplete trailing event. */ }
        }
        if (answer.trim()) {
          const { error } = await admin.from("chat_messages").insert({
            user_id: user.id, conversation_id: conversationId, role: "assistant", content: answer.slice(0, 20_000),
          });
          if (error) console.error("Could not persist assistant message");
        }
      },
    });
    return new Response(openAiResponse.body.pipeThrough(transform), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
    });
  } catch (error) {
    console.error("chat-fitness error", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Erro interno no chat" }, 500);
  }
});
