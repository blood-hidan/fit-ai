import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type FollowState = "none" | "pending" | "accepted";

export function useFollow(targetUserId: string | null | undefined, isPrivate: boolean) {
  const { user } = useAuth();
  const [state, setState] = useState<FollowState>("none");
  const [theyFollowMe, setTheyFollowMe] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);

    // counts
    const [{ count: f1 }, { count: f2 }] = await Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true })
        .eq("following_id", targetUserId).eq("status", "accepted"),
      supabase.from("follows").select("*", { count: "exact", head: true })
        .eq("follower_id", targetUserId).eq("status", "accepted"),
    ]);
    setFollowers(f1 ?? 0);
    setFollowing(f2 ?? 0);

    if (user && user.id !== targetUserId) {
      const { data: mine } = await supabase
        .from("follows")
        .select("status")
        .eq("follower_id", user.id)
        .eq("following_id", targetUserId)
        .maybeSingle();
      setState((mine?.status as FollowState) ?? "none");

      const { data: rev } = await supabase
        .from("follows")
        .select("status")
        .eq("follower_id", targetUserId)
        .eq("following_id", user.id)
        .eq("status", "accepted")
        .maybeSingle();
      setTheyFollowMe(!!rev);
    }
    setLoading(false);
  }, [user?.id, targetUserId]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggleFollow = async () => {
    if (!user || !targetUserId || user.id === targetUserId) return;
    if (state === "none") {
      const status = isPrivate ? "pending" : "accepted";
      setState(status);
      const { error } = await supabase.from("follows").insert({
        follower_id: user.id,
        following_id: targetUserId,
        status,
      });
      if (error) { setState("none"); return; }
      if (status === "accepted") setFollowers(c => c + 1);
    } else {
      setState("none");
      const wasAccepted = state === "accepted";
      await supabase.from("follows").delete()
        .eq("follower_id", user.id).eq("following_id", targetUserId);
      if (wasAccepted) setFollowers(c => Math.max(0, c - 1));
    }
  };

  const mutual = state === "accepted" && theyFollowMe;

  return { state, theyFollowMe, mutual, followers, following, loading, toggleFollow, refresh };
}
