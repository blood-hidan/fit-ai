import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Send, Loader2, Check, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";

interface Msg {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}
interface Other { user_id: string; username: string; name: string; avatar_url: string | null }

export default function ChatThreadPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [other, setOther] = useState<Other | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // initial load
  useEffect(() => {
    if (!user || !conversationId) return;
    let cancel = false;
    (async () => {
      const { data: conv } = await supabase.from("conversations").select("*").eq("id", conversationId).maybeSingle();
      if (!conv || cancel) { setLoading(false); return; }
      const otherId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id;
      const { data: prof } = await supabase.from("profiles").select("user_id, username, name, avatar_url").eq("user_id", otherId).maybeSingle();
      if (!cancel) setOther(prof as Other);
      const { data: m } = await supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(200);
      if (!cancel) setMsgs((m ?? []) as Msg[]);
      // mark theirs as read
      await supabase.from("messages").update({ read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId).neq("sender_id", user.id).is("read_at", null);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [conversationId, user?.id]);

  // realtime subscription
  useEffect(() => {
    if (!conversationId || !user) return;
    const ch = supabase.channel(`thread-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const m = payload.new as Msg;
          setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
          if (m.sender_id !== user.id) {
            await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
          }
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs(prev => prev.map(x => x.id === m.id ? m : x));
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, user?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user || !conversationId || sending) return;
    setSending(true);
    const content = text.trim().slice(0, 2000);
    setText("");
    const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, content });
    setSending(false);
    if (error) setText(content);
  };

  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto">
      <header className="px-3 pt-5 pb-3 flex items-center gap-2 border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur-xl z-10">
        <button onClick={() => navigate("/messages")} className="p-2 rounded-xl bg-secondary"><ChevronLeft size={18} /></button>
        {other && (
          <button onClick={() => navigate(`/u/${other.username}`)} className="flex items-center gap-2 flex-1 text-left">
            <div className="w-9 h-9 rounded-full bg-gradient-primary p-[2px]">
              <div className="w-full h-full rounded-full bg-background overflow-hidden flex items-center justify-center">
                {other.avatar_url ? <img src={other.avatar_url} className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-primary">{other.name?.[0]?.toUpperCase()}</span>}
              </div>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">{other.name}</p>
              <p className="text-[10px] text-muted-foreground">@{other.username}</p>
            </div>
          </button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
        ) : msgs.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-10">Diga olá 👋</p>
        ) : msgs.map(m => {
          const mine = m.sender_id === user?.id;
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                mine ? "bg-gradient-primary text-primary-foreground rounded-br-sm" : "bg-secondary rounded-bl-sm"
              }`}>
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                <div className={`flex items-center gap-1 justify-end text-[10px] mt-0.5 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {mine && (m.read_at ? <CheckCheck size={11} /> : <Check size={11} />)}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <form onSubmit={send} className="px-3 py-2.5 border-t border-border/50 flex gap-2 bg-background/95 backdrop-blur-xl sticky bottom-0">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Mensagem..."
          maxLength={2000}
          className="flex-1 bg-secondary rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button type="submit" disabled={!text.trim() || sending} className="w-11 h-11 bg-gradient-primary rounded-xl flex items-center justify-center disabled:opacity-50 shadow-neon">
          {sending ? <Loader2 size={16} className="animate-spin text-primary-foreground" /> : <Send size={16} className="text-primary-foreground" />}
        </button>
      </form>
    </div>
  );
}
