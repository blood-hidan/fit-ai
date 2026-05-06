import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, Lock, MessageCircle, Loader2, Grid3x3, Info, Trophy, UserPlus, UserCheck, Clock, Settings } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFollow } from "@/hooks/useFollow";
import { toast } from "@/hooks/use-toast";
import type { DBProfile } from "@/hooks/useProfile";

interface PostLite {
  id: string;
  media_url: string | null;
  media_type: string | null;
  caption: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
}

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<DBProfile | null>(null);
  const [posts, setPosts] = useState<PostLite[]>([]);
  const [tab, setTab] = useState<"posts" | "about" | "achievements">("posts");
  const [loading, setLoading] = useState(true);

  const isMe = user && profile && user.id === profile.user_id;
  const follow = useFollow(profile?.user_id, profile?.is_private ?? false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles").select("*")
        .ilike("username", username || "")
        .maybeSingle();
      if (cancel) return;
      if (!data) { setLoading(false); return; }
      setProfile(data as DBProfile);
      const canViewPosts = !data.is_private || (user && data.user_id === user.id);
      if (canViewPosts) {
        const { data: ps } = await supabase
          .from("posts").select("id, media_url, media_type, caption, likes_count, comments_count, created_at")
          .eq("user_id", data.user_id).order("created_at", { ascending: false }).limit(60);
        if (!cancel) setPosts((ps ?? []) as PostLite[]);
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [username, user?.id]);

  const startChat = async () => {
    if (!user || !profile) return;
    const { data, error } = await supabase.rpc("get_or_create_conversation", { _other_user: profile.user_id });
    if (error) { toast({ title: "Vocês precisam se seguir mutuamente", variant: "destructive" }); return; }
    navigate(`/messages/${data}`);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  }
  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <p className="text-muted-foreground mb-4">Perfil não encontrado</p>
        <button onClick={() => navigate(-1)} className="bg-secondary px-4 py-2 rounded-xl text-sm">Voltar</button>
      </div>
    );
  }

  const canSeePosts = !profile.is_private || isMe || follow.state === "accepted";
  const postsCount = posts.length;

  let followLabel = "Seguir";
  let FollowIcon = UserPlus;
  if (follow.state === "accepted") { followLabel = "Seguindo"; FollowIcon = UserCheck; }
  else if (follow.state === "pending") { followLabel = "Solicitado"; FollowIcon = Clock; }

  return (
    <div className="min-h-screen pb-24 max-w-lg mx-auto">
      {/* header */}
      <div className="flex items-center justify-between px-4 pt-6 mb-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-secondary"><ChevronLeft size={18} /></button>
        <p className="font-bold font-display text-sm flex items-center gap-1.5">
          @{profile.username}
          {profile.is_private && <Lock size={12} className="text-muted-foreground" />}
        </p>
        {isMe ? (
          <button onClick={() => navigate("/profile")} className="p-2 rounded-xl bg-secondary"><Settings size={16} /></button>
        ) : <div className="w-9" />}
      </div>

      {/* avatar + stats */}
      <div className="px-4 flex items-center gap-5 mb-4">
        <div className="w-20 h-20 rounded-full bg-gradient-primary p-[3px] shadow-neon shrink-0">
          <div className="w-full h-full rounded-full bg-background overflow-hidden flex items-center justify-center">
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl font-bold text-primary">{profile.name?.[0]?.toUpperCase()}</span>}
          </div>
        </div>
        <div className="flex-1 grid grid-cols-3 gap-1 text-center">
          <Stat label="Posts" value={canSeePosts ? postsCount : 0} />
          <Stat label="Seguidores" value={follow.followers} onClick={() => navigate(`/u/${profile.username}/followers`)} />
          <Stat label="Seguindo" value={follow.following} onClick={() => navigate(`/u/${profile.username}/following`)} />
        </div>
      </div>

      {/* name + bio */}
      <div className="px-4 mb-4">
        <p className="font-bold font-display">{profile.name}</p>
        {profile.bio && <p className="text-sm text-foreground/80 mt-0.5 whitespace-pre-line">{profile.bio}</p>}
      </div>

      {/* actions */}
      {!isMe && (
        <div className="px-4 flex gap-2 mb-5">
          <button
            onClick={follow.toggleFollow}
            className={`flex-1 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm transition ${
              follow.state === "none"
                ? "bg-gradient-primary text-primary-foreground shadow-neon"
                : "bg-secondary text-foreground"
            }`}
          >
            <FollowIcon size={14} /> {followLabel}
          </button>
          {follow.mutual && (
            <button onClick={startChat} className="flex-1 bg-secondary text-foreground font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm">
              <MessageCircle size={14} /> Mensagem
            </button>
          )}
        </div>
      )}

      {/* tabs */}
      <div className="border-t border-border/50 flex">
        {([["posts", Grid3x3], ["about", Info], ["achievements", Trophy]] as const).map(([t, Icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 flex items-center justify-center border-b-2 transition ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>

      {/* tab content */}
      {tab === "posts" && (
        <div className="mt-1">
          {!canSeePosts ? (
            <div className="text-center py-16 text-muted-foreground">
              <Lock size={32} className="mx-auto mb-3 text-primary/60" />
              <p className="text-sm font-bold">Conta privada</p>
              <p className="text-xs">Siga para ver os posts</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">Nenhum post ainda</div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5">
              {posts.map((p) => (
                <motion.button
                  key={p.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate(`/community#post-${p.id}`)}
                  className="aspect-square bg-secondary relative overflow-hidden"
                >
                  {p.media_url && p.media_type === "image" && (
                    <img src={p.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  )}
                  {p.media_url && p.media_type === "video" && (
                    <video src={p.media_url} className="w-full h-full object-cover" muted />
                  )}
                  {!p.media_url && (
                    <div className="w-full h-full flex items-center justify-center p-2 text-[10px] text-muted-foreground line-clamp-4">{p.caption}</div>
                  )}
                </motion.button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "about" && (
        <div className="px-4 py-4 space-y-3 text-sm">
          <Info2 label="Nível" value={profile.level} />
          <Info2 label="Objetivo" value={profile.goal?.replace("_", " ")} />
          <Info2 label="Biotipo" value={profile.body_type} />
          <Info2 label="Frequência semanal" value={`${profile.weekly_frequency}x`} />
          <Info2 label="Horário de treino" value={profile.training_time} />
        </div>
      )}

      {tab === "achievements" && (
        <div className="px-4 py-4 grid grid-cols-3 gap-3">
          {[
            { e: "🔥", l: "7 dias seguidos" },
            { e: "💪", l: "Primeiro treino" },
            { e: "🏃", l: "5km" },
            { e: "🥗", l: "Nutrição on" },
            { e: "🌙", l: "Sono 8h" },
            { e: "📈", l: "Progresso +" },
          ].map(a => (
            <div key={a.l} className="glass rounded-2xl p-3 text-center">
              <div className="text-3xl mb-1">{a.e}</div>
              <p className="text-[10px] text-muted-foreground">{a.l}</p>
            </div>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
}

function Stat({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="py-1">
      <p className="font-bold font-display text-lg leading-none">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">{label}</p>
    </button>
  );
}

function Info2({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between glass rounded-xl px-4 py-3">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      <span className="font-bold capitalize">{value}</span>
    </div>
  );
}
