import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MessageCircle, Search } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ConvRow {
  id: string;
  user1_id: string;
  user2_id: string;
  last_message_at: string;
  other?: { user_id: string; username: string; name: string; avatar_url: string | null };
  lastMsg?: { content: string; sender_id: string; created_at: string; read_at: string | null };
  unread?: number;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [convs, setConvs] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: rows } = await supabase
      .from("conversations").select("*")
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order("last_message_at", { ascending: false });
    const list = (rows ?? []) as ConvRow[];
    if (list.length === 0) { setConvs([]); setLoading(false); return; }

    const otherIds = list.map(c => c.user1_id === user.id ? c.user2_id : c.user1_id);
    const { data: profs } = await supabase.from("profiles").select("user_id, username, name, avatar_url").in("user_id", otherIds);
    const profMap = new Map((profs ?? []).map(p => [p.user_id, p]));

    // last message per conversation
    const enriched = await Promise.all(list.map(async (c) => {
      const other = profMap.get(c.user1_id === user.id ? c.user2_id : c.user1_id) as any;
      const { data: lm } = await supabase.from("messages")
        .select("content, sender_id, created_at, read_at")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { count } = await supabase.from("messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", c.id)
        .neq("sender_id", user.id)
        .is("read_at", null);
      return { ...c, other, lastMsg: lm ?? undefined, unread: count ?? 0 };
    }));
    setConvs(enriched);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  // realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("convs-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const filtered = convs.filter(c => !q || c.other?.username?.includes(q.toLowerCase()) || c.other?.name?.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen pb-24 max-w-lg mx-auto">
      <div className="px-4 pt-6 mb-4">
        <h1 className="text-2xl font-bold font-display mb-3"><span className="text-gradient">Mensagens</span></h1>
        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2.5">
          <Search size={16} className="text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar conversas" className="bg-transparent flex-1 text-sm focus:outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageCircle size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhuma conversa</p>
          <p className="text-xs">Siga alguém que também te segue para conversar</p>
        </div>
      ) : (
        <div className="px-2 space-y-0.5">
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => navigate(`/messages/${c.id}`)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary/60 transition text-left"
            >
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-primary p-[2px]">
                  <div className="w-full h-full rounded-full bg-background overflow-hidden flex items-center justify-center">
                    {c.other?.avatar_url ? <img src={c.other.avatar_url} className="w-full h-full object-cover" /> : <span className="text-sm font-bold text-primary">{c.other?.name?.[0]?.toUpperCase()}</span>}
                  </div>
                </div>
                {(c.unread ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{c.unread}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-sm truncate">{c.other?.name}</p>
                  {c.lastMsg && <span className="text-[10px] text-muted-foreground shrink-0">{formatDistanceToNow(new Date(c.lastMsg.created_at), { locale: ptBR })}</span>}
                </div>
                <p className={`text-xs truncate ${(c.unread ?? 0) > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {c.lastMsg ? (c.lastMsg.sender_id === user?.id ? "Você: " : "") + c.lastMsg.content : "Nova conversa"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
