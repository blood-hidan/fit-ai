import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, ChevronDown, Loader2, MessageSquarePlus, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

type Msg = { role: "user" | "assistant"; content: string };
type CoachConversation = { id: string; title: string; updated_at: string };
const suggestions = [
  "Como melhorar minha postura no agachamento?",
  "O que comer antes do treino?",
  "Sugira um aquecimento de 10 minutos",
  "Como aumentar massa muscular com segurança?",
];

export default function ChatPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<CoachConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async (preferredId?: string | null) => {
    if (!user) return;
    const { data, error } = await supabase.from("coach_conversations")
      .select("id,title,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Não foi possível carregar as conversas", variant: "destructive" });
      return;
    }
    const list = (data || []) as CoachConversation[];
    setConversations(list);
    const selectedId = preferredId ?? activeId;
    const nextActive = list.find((item) => item.id === selectedId)?.id ?? list[0]?.id ?? null;
    setActiveId(nextActive);
  }, [user, activeId]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const initialize = async () => {
      setLoadingHistory(true);
      const { data, error } = await supabase.from("coach_conversations")
        .select("id,title,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        toast({ title: "Não foi possível carregar as conversas", variant: "destructive" });
        setLoadingHistory(false);
        return;
      }
      let list = (data || []) as CoachConversation[];
      if (list.length === 0) {
        const { data: created, error: createError } = await supabase.from("coach_conversations")
          .insert({ user_id: user.id, title: "Nova conversa" }).select("id,title,updated_at").single();
        if (createError) {
          toast({ title: "Não foi possível iniciar o Coach", variant: "destructive" });
          setLoadingHistory(false);
          return;
        }
        list = [created as CoachConversation];
      }
      if (!cancelled) {
        setConversations(list);
        setActiveId(list[0].id);
        setLoadingHistory(false);
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user || !activeId) { setMessages([]); return; }
    let cancelled = false;
    const load = async () => {
      setLoadingHistory(true);
      const { data, error } = await supabase.from("chat_messages")
        .select("role,content").eq("user_id", user.id).eq("conversation_id", activeId)
        .order("created_at", { ascending: true }).limit(100);
      if (!cancelled) {
        if (error) toast({ title: "Não foi possível abrir esta conversa", variant: "destructive" });
        setMessages((data || []) as Msg[]);
        setLoadingHistory(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [user, activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const createConversation = async () => {
    if (!user || loading) return;
    const { data, error } = await supabase.from("coach_conversations")
      .insert({ user_id: user.id, title: "Nova conversa" }).select("id,title,updated_at").single();
    if (error) {
      toast({ title: "Não foi possível criar uma conversa", variant: "destructive" });
      return;
    }
    const conversation = data as CoachConversation;
    setConversations((items) => [conversation, ...items]);
    setActiveId(conversation.id);
    setMessages([]);
    setHistoryOpen(false);
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || !user || !activeId) return;
    setMessages((items) => [...items, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);
    let answer = "";
    const updateAnswer = (chunk: string) => {
      answer += chunk;
      setMessages((items) => {
        const last = items[items.length - 1];
        return last?.role === "assistant"
          ? items.map((item, index) => index === items.length - 1 ? { ...item, content: answer } : item)
          : [...items, { role: "assistant", content: answer }];
      });
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sua sessão expirou. Entre novamente.");
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-fitness`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ conversation_id: activeId, message: trimmed }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || (response.status === 429 ? "Limite de uso atingido. Tente novamente mais tarde." : "Não foi possível obter uma resposta do Coach."));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamFailed = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const event of events) {
          const line = event.split("\n").find((entry) => entry.startsWith("data: "));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.type === "response.output_text.delta" && typeof payload.delta === "string") updateAnswer(payload.delta);
            if (payload.type === "error" || payload.type === "response.failed") streamFailed = true;
          } catch { /* Ignore incomplete or non-JSON SSE frames. */ }
        }
      }
      if (streamFailed || !answer.trim()) throw new Error("O Coach não concluiu a resposta. Tente novamente.");
      await loadConversations(activeId);
    } catch (error) {
      setMessages((items) => items.filter((item) => item.role !== "assistant" || item.content !== answer));
      toast({ title: "Erro no Coach", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const activeConversation = conversations.find((item) => item.id === activeId);

  return (
    <div className="min-h-screen flex flex-col pb-24 max-w-lg mx-auto">
      <header className="px-4 pt-6 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-primary flex items-center justify-center shadow-neon">
            <Bot size={20} className="text-primary-foreground" />
          </div>
          <button onClick={() => setHistoryOpen((open) => !open)} className="text-left min-w-0" aria-expanded={historyOpen}>
            <h1 className="font-bold font-display">MultiFit Coach</h1>
            <p className="text-[11px] text-muted-foreground truncate max-w-48 flex items-center gap-1">
              {activeConversation?.title || "Nova conversa"}<ChevronDown size={12} />
            </p>
          </button>
        </div>
        <button onClick={createConversation} disabled={loading} aria-label="Criar nova conversa" title="Nova conversa"
          className="p-2 rounded-xl text-primary hover:bg-secondary disabled:opacity-50">
          <MessageSquarePlus size={20} />
        </button>
      </header>

      {historyOpen && (
        <div className="mx-4 mb-2 max-h-56 overflow-y-auto rounded-xl border border-border bg-background shadow-lg" role="listbox" aria-label="Conversas do Coach">
          {conversations.map((conversation) => (
            <button key={conversation.id} onClick={() => { setActiveId(conversation.id); setHistoryOpen(false); }}
              className={`w-full text-left px-4 py-3 text-sm border-b last:border-0 border-border/60 truncate ${conversation.id === activeId ? "bg-secondary text-primary" : "hover:bg-secondary/60"}`}>
              {conversation.title}
            </button>
          ))}
          <button onClick={createConversation} className="w-full text-left px-4 py-3 text-sm text-primary flex items-center gap-2">
            <MessageSquarePlus size={15} /> Nova conversa
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
        {loadingHistory && <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-primary" /></div>}
        {!loadingHistory && messages.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-2xl p-5 mt-4">
            <Sparkles size={22} className="text-primary mb-2" />
            <p className="text-sm font-medium mb-1">Olá! Sou seu coach pessoal.</p>
            <p className="text-xs text-muted-foreground mb-4">Converse sobre treino, nutrição, sono e recuperação. Cada conversa fica salva no seu histórico.</p>
            <div className="space-y-2">
              {suggestions.map((suggestion) => <button key={suggestion} onClick={() => void send(suggestion)}
                className="w-full text-left text-xs bg-secondary hover:bg-secondary/80 px-3 py-2.5 rounded-xl transition-colors">{suggestion}</button>)}
            </div>
          </motion.div>
        )}
        {messages.map((message, index) => (
          <motion.div key={`${activeId}-${index}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${message.role === "user" ? "bg-gradient-primary text-primary-foreground rounded-br-sm" : "glass rounded-bl-sm"}`}>
              {message.role === "assistant" ? <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-strong:text-primary"><ReactMarkdown>{message.content}</ReactMarkdown></div> : <p>{message.content}</p>}
            </div>
          </motion.div>
        ))}
        {loading && <div className="flex justify-start"><div className="glass rounded-2xl px-4 py-3 flex items-center gap-2"><Loader2 size={14} className="animate-spin text-primary" /><span className="text-xs text-muted-foreground">Pensando...</span></div></div>}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void send(input); }} className="fixed bottom-[68px] left-0 right-0 z-40 px-4 py-2 bg-background/95 backdrop-blur-xl border-t border-border/50">
        <div className="max-w-lg mx-auto flex gap-2">
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Pergunte ao seu coach..." disabled={loading || loadingHistory || !activeId}
            maxLength={4000} className="flex-1 bg-secondary rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60" />
          <button type="submit" disabled={!input.trim() || loading || loadingHistory || !activeId} aria-label="Enviar mensagem"
            className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center disabled:opacity-50 shadow-neon">
            {loading ? <Loader2 size={18} className="animate-spin text-primary-foreground" /> : <Send size={18} className="text-primary-foreground" />}
          </button>
        </div>
      </form>
      <BottomNav />
    </div>
  );
}
