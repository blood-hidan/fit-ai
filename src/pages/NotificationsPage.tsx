import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Heart, MessageCircle, UserPlus, MessageSquare, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

interface Notif {
  id: string;
  type: string;
  actor_id: string | null;
  entity_id: string | null;
  read: boolean;
  created_at: string;
  actor?: { username: string; name: string; avatar_url: string | null };
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(80);
    const ids = Array.from(new Set((data ?? []).map(n => n.actor_id).filter(Boolean))) as string[];
    const { data: profs } = ids.length ? await supabase.from("profiles").select("user_id, username, name, avatar_url").in("user_id", ids) : { data: [] };
    const map = new Map((profs ?? []).map(p => [p.user_id, p]));
    setList(((data ?? []) as Notif[]).map(n => ({ ...n, actor: n.actor_id ? (map.get(n.actor_id) as any) : undefined })));
    setLoading(false);

    // mark all read
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
  };

  useEffect(() => { load(); }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("notif-list").on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const handleAccept = async (n: Notif) => {
    if (!n.entity_id) return;
    const { error } = await supabase.from("follows").update({ status: "accepted" }).eq("id", n.entity_id);
    if (error) return toast({ title: "Erro", variant: "destructive" });
    toast({ title: "Solicitação aceita" });
    load();
  };
  const handleReject = async (n: Notif) => {
    if (!n.entity_id) return;
    await supabase.from("follows").delete().eq("id", n.entity_id);
    load();
  };

  const open = (n: Notif) => {
    if (n.type === "message" && n.entity_id) navigate(`/messages/${n.entity_id}`);
    else if ((n.type === "like" || n.type === "comment") && n.entity_id) navigate(`/community#post-${n.entity_id}`);
    else if (n.actor?.username) navigate(`/u/${n.actor.username}`);
  };

  const Icon = (t: string) => {
    if (t === "like") return Heart;
    if (t === "comment") return MessageCircle;
    if (t === "message") return MessageSquare;
    return UserPlus;
  };

  return (
    <div className="min-h-screen pb-24 max-w-lg mx-auto">
      <div className="flex items-center gap-3 px-4 pt-6 mb-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-secondary"><ChevronLeft size={18} /></button>
        <h1 className="text-xl font-bold font-display"><span className="text-gradient">Notificações</span></h1>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">Nenhuma notificação</p>
      ) : (
        <div className="px-2 space-y-0.5">
          {list.map(n => {
            const I = Icon(n.type);
            const text = (
              n.type === "follow" ? "começou a seguir você" :
              n.type === "follow_request" ? "quer te seguir" :
              n.type === "follow_accepted" ? "aceitou sua solicitação" :
              n.type === "like" ? "curtiu seu post" :
              n.type === "comment" ? "comentou no seu post" :
              n.type === "message" ? "te enviou uma mensagem" : ""
            );
            return (
              <div key={n.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${!n.read ? "bg-primary/5" : ""}`}>
                <button onClick={() => open(n)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-primary p-[2px]">
                      <div className="w-full h-full rounded-full bg-background overflow-hidden flex items-center justify-center">
                        {n.actor?.avatar_url ? <img src={n.actor.avatar_url} className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-primary">{n.actor?.name?.[0]?.toUpperCase() ?? "?"}</span>}
                      </div>
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-background flex items-center justify-center">
                      <I size={11} className="text-primary" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      <span className="font-bold">{n.actor?.name ?? "Alguém"}</span>{" "}
                      <span className="text-muted-foreground">{text}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}</p>
                  </div>
                </button>
                {n.type === "follow_request" && (
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => handleAccept(n)} className="bg-gradient-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"><Check size={12} /> Aceitar</button>
                    <button onClick={() => handleReject(n)} className="bg-secondary text-xs font-bold px-3 py-1.5 rounded-lg">Rejeitar</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
