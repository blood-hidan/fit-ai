export async function consumeAiRateLimit(
  endpoint: "chat-fitness" | "generate-nutrition",
  authorization: string | null,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !publishableKey || !authorization) {
    return { allowed: false, unavailable: true };
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_ai_rate_limit`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_endpoint: endpoint }),
    });

    if (!response.ok) return { allowed: false, unavailable: true };
    return { allowed: await response.json() === true, unavailable: false };
  } catch {
    return { allowed: false, unavailable: true };
  }
}
