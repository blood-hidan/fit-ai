// Streaming fitness chatbot via Lovable AI Gateway
import { consumeAiRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    if (Number(req.headers.get("content-length") ?? 0) > 64_000) {
      return new Response(JSON.stringify({ error: "Requisição muito grande" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.text();
    if (new TextEncoder().encode(body).byteLength > 64_000) {
      return new Response(JSON.stringify({ error: "Requisição muito grande" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { messages, profile } = JSON.parse(body);
    if (
      !Array.isArray(messages) || messages.length === 0 || messages.length > 30 ||
      messages.some((message) =>
        !message || !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" || message.content.length === 0 ||
        message.content.length > 4_000
      )
    ) {
      return new Response(JSON.stringify({ error: "Mensagens inválidas" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const rateLimit = await consumeAiRateLimit("chat-fitness", req.headers.get("authorization"));
    if (rateLimit.unavailable) {
      return new Response(JSON.stringify({ error: "Serviço temporariamente indisponível" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Limite de uso atingido. Tente novamente mais tarde." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const profileContext = profile
      ? `Perfil do usuário: ${profile.name || "Atleta"}, ${profile.age} anos, ${profile.weight}kg, ${profile.height}cm, nível ${profile.level}, objetivo ${profile.goal}, biotipo ${profile.body_type}, dorme ${profile.sleep_hours}h (${profile.sleep_quality}), treina ${profile.weekly_frequency}x/semana de ${profile.training_time}.${profile.allergies ? ` Alergias: ${profile.allergies}.` : ""}${profile.dietary_restrictions ? ` Restrições: ${profile.dietary_restrictions}.` : ""}`
      : "Usuário ainda não configurou o perfil.";

    const systemPrompt = `Você é o MultiFit Coach, um personal trainer e nutricionista virtual amigável e motivador. Responda em português brasileiro de forma clara, prática e direta.

${profileContext}

Diretrizes:
- Tire dúvidas sobre exercícios, nutrição, suplementação, sono e recuperação.
- Explique como executar exercícios corretamente e sugira alternativas.
- Adapte recomendações ao perfil do usuário sempre que possível.
- Use markdown (negritos, listas) para deixar respostas escaneáveis.
- Seja motivador, mas honesto. Nunca recomende medicamentos.
- Se a pergunta envolver lesão grave ou questão médica, oriente procurar profissional de saúde.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.slice(-30),
          ],
          stream: true,
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de uso atingido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos esgotados. Adicione créditos no workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await response.text();
      console.error("AI gateway error", response.status);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat-fitness error", e instanceof Error ? e.name : "UnknownError");
    return new Response(
      JSON.stringify({ error: "Erro interno no chat" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
