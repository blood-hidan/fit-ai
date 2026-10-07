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

    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > 8_000) return json({ error: "Requisição muito grande" }, 413);
    const { calories, macros } = JSON.parse(rawBody);
    if (!Number.isInteger(calories) || calories < 500 || calories > 10_000 ||
      !macros || ![macros.protein, macros.carbs, macros.fat].every((value: unknown) => Number.isFinite(value) && Number(value) >= 0 && Number(value) <= 1_000)) {
      return json({ error: "Metas nutricionais inválidas" }, 400);
    }

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return json({ error: "Sessão inválida" }, 401);
    const rateLimit = await consumeAiRateLimit("generate-nutrition", authorization);
    if (rateLimit.unavailable) return json({ error: "Serviço temporariamente indisponível" }, 503);
    if (!rateLimit.allowed) return json({ error: "Limite de uso atingido. Tente novamente mais tarde." }, 429);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const [{ data: profile }, { data: privateProfile }] = await Promise.all([
      admin.from("profiles").select("name,level,goal").eq("user_id", user.id).maybeSingle(),
      admin.from("profile_private").select("age,weight,height,weekly_frequency,training_time,allergies,dietary_restrictions").eq("user_id", user.id).maybeSingle(),
    ]);

    const prompt = `Crie uma sugestão educativa de plano alimentar diário em português brasileiro.\n\nPerfil cadastrado: nome ${profile?.name || "Atleta"}; idade ${privateProfile?.age ?? "não informada"}; peso ${privateProfile?.weight ?? "não informado"} kg; altura ${privateProfile?.height ?? "não informada"} cm; objetivo ${profile?.goal ?? "não informado"}; treino ${privateProfile?.weekly_frequency ?? "não informado"} vezes por semana, no período ${privateProfile?.training_time ?? "não informado"}. Alergias: ${privateProfile?.allergies || "nenhuma informada"}. Restrições: ${privateProfile?.dietary_restrictions || "nenhuma informada"}.\n\nMetas informadas no aplicativo: ${calories} kcal; proteína ${macros.protein} g, carboidratos ${macros.carbs} g e gordura ${macros.fat} g.\n\nSugira cinco refeições com horários, alimentos e porções aproximadas, estimativa de macros por refeição e uma dica. Respeite rigorosamente alergias e restrições. Inclua uma frase breve de que o plano deve ser validado por nutricionista.`;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini",
        instructions: "Você é um assistente de nutrição esportiva. Não diagnostique doenças nem prescreva dietas clínicas. Responda com markdown organizado e em português brasileiro.",
        input: prompt,
        max_output_tokens: 2_000,
        store: false,
      }),
    });
    if (!response.ok) {
      console.error("OpenAI nutrition request failed", response.status);
      return json({ error: "O serviço de IA está indisponível no momento." }, response.status === 429 ? 429 : 502);
    }
    const result = await response.json();
    if (typeof result.output_text !== "string") return json({ error: "A IA não retornou um plano válido." }, 502);
    return json({ plan: result.output_text });
  } catch (error) {
    console.error("generate-nutrition error", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Erro interno ao gerar o plano" }, 500);
  }
});
