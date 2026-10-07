import { supabase } from "@/integrations/supabase/client";

export async function createCommunityMediaUrlMap(paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  if (uniquePaths.length === 0) return new Map<string, string>();

  const { data, error } = await supabase.storage
    .from("community-media")
    .createSignedUrls(uniquePaths, 15 * 60);

  if (error) {
    console.error("Could not sign community media URLs", error.message);
    return new Map<string, string>();
  }

  return new Map(
    (data ?? [])
      .filter((item) => Boolean(item.path && item.signedUrl))
      .map((item) => [item.path!, item.signedUrl!] as const),
  );
}
