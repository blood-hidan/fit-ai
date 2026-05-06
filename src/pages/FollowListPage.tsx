import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface UserLite { user_id: string; username: string; name: string; avatar_url: string | null }

export default function FollowListPage({ mode }: { mode: "followers" | "following" }) {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: prof } = await supabase.from("profiles").select("user_id").ilike("username", username || "").maybeSingle();
      if (!prof) { setLoading(false); return; }
      const col = mode === "followers" ? "following_id" : "follower_id";
      const otherCol = mode === "followers" ? "follower_id" : "following_id";
      const { data: rels } = await supabase.from("follows").select(otherCol).eq(col, prof.user_id).eq("status", "accepted");
      const ids = (rels ?? []).map((r: any) => r[otherCol]);
      if (!ids.length) { setUsers([]); setLoading(false); return; }
      const { data: profs } = await supabase.from("profiles").select("user_id, username, name, avatar_url").in("user_id", ids);
      setUsers((profs ?? []) as UserLite[]);
      setLoading(false);
    })();
  }, [username, mode]);

  return (
    <div className="min-h-screen pb-24 max-w-lg mx-auto">
      <div className="flex items-center gap-3 px-4 pt-6 mb-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-secondary"><ChevronLeft size={18} /></button>
        <h1 className="font-bold font-display capitalize">{mode === "followers" ? "Seguidores" : "Seguindo"}</h1>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
      ) : users.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">Nada por aqui</p>
      ) : (
        <div className="px-4 space-y-1">
          {users.map(u => (
            <button key={u.user_id} onClick={() => navigate(`/u/${u.username}`)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary/60 transition text-left">
              <div className="w-11 h-11 rounded-full bg-gradient-primary p-[2px] shrink-0">
                <div className="w-full h-full rounded-full bg-background overflow-hidden flex items-center justify-center">
                  {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> : <span className="text-sm font-bold text-primary">{u.name?.[0]?.toUpperCase()}</span>}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{u.name}</p>
                <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
