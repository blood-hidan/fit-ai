// Generate personalized nutrition plan via Lovable AI
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { profile, calories, macros } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `Crie um plano alimentar diário personalizado em português brasileiro.

Perfil:
- Nome: ${profile.name || "Atleta"}
- ${profile.age} anos, ${profile.weight}kg, ${profile.height}cm
- Objetivo: ${profile.goal}
- Biotipo: ${profile.body_type}
- Treina ${profile.weekly_frequency}x/semana no período da ${profile.training_time}
- Alergias: ${profile.allergies || "nenhuma"}
- Restrições alimentares: ${profile.dietary_restrictions || "nenhuma"}

Meta calórica: ${calories} kcal/dia
Meta de macros: ${macros.protein}g proteína, ${macros.carbs}g carboidratos, ${macros.fat}g gordura

Retorne 5 refeições (café da manhã, lanche manhã, almoço, lanche tarde, jantar) com:
- Nome da refeição e horário sugerido
- Lista de alimentos com quantidades em gramas/medidas caseiras
- Calorias e macros aproximados por refeição
- 1 dica nutricional ao final`;

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
            {
              role: "system",
              content:
                "Você é um nutricionista esportivo. Responda sempre em português brasileiro, em formato markdown organizado, claro e prático.",
            },
            { role: "user", content: prompt },
          ],
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de uso atingido. Tente novamente." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos esgotados." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await response.text();
      console.error("AI gateway error", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const plan = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ plan }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-nutrition error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
  }
});
