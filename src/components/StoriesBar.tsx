import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, ImagePlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type StoryRow = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
};
type Author = { user_id: string; username: string | null; name: string; avatar_url: string | null };
type Group = { author: Author; stories: StoryRow[] };

export default function StoriesBar() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [viewer, setViewer] = useState<{ groupIdx: number; storyIdx: number } | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data: stories } = await supabase
      .from("stories")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });
    if (!stories) return;
    const ids = Array.from(new Set(stories.map((s) => s.user_id)));
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, username, name, avatar_url")
      .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const byUser = new Map<string, Author>();
    (profs ?? []).forEach((p) => byUser.set(p.user_id, p as Author));
    const map = new Map<string, Group>();
    (stories as StoryRow[]).forEach((s) => {
      const author = byUser.get(s.user_id) ?? { user_id: s.user_id, username: null, name: "Atleta", avatar_url: null };
      if (!map.has(s.user_id)) map.set(s.user_id, { author, stories: [] });
      map.get(s.user_id)!.stories.push(s);
    });
    // current user first
    const arr = Array.from(map.values());
    arr.sort((a, b) => (a.author.user_id === user?.id ? -1 : b.author.user_id === user?.id ? 1 : 0));
    setGroups(arr);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("stories-bar")
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const handleUpload = async () => {
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/stories/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("community-media").upload(path, file);
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("community-media").getPublicUrl(path);
      const isVideo = file.type.startsWith("video");
      const { error } = await supabase.from("stories").insert({
        user_id: user.id, media_url: pub.publicUrl,
        media_type: isVideo ? "video" : "image", caption,
      });
      if (error) throw error;
      toast.success("Story publicado! Some em 24h.");
      setComposerOpen(false); setFile(null); setCaption("");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setUploading(false); }
  };

  const myGroup = groups.find((g) => g.author.user_id === user?.id);
  const otherGroups = groups.filter((g) => g.author.user_id !== user?.id);

  return (
    <>
      <div className="mb-4 -mx-4 px-4 overflow-x-auto scrollbar-none">
        <div className="flex gap-3">
          <button
            onClick={() => myGroup ? setViewer({ groupIdx: 0, storyIdx: 0 }) : setComposerOpen(true)}
            className="flex flex-col items-center gap-1 shrink-0"
          >
            <div className={`relative w-16 h-16 rounded-full p-[2px] ${myGroup ? "bg-gradient-primary" : "bg-secondary"}`}>
              <div className="w-full h-full rounded-full bg-background flex items-center justify-center overflow-hidden">
                {myGroup?.author.avatar_url ? (
                  <img src={myGroup.author.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Plus size={20} className="text-primary" />
                )}
              </div>
              {!myGroup && (
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold border-2 border-background">+</span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">Seu story</span>
          </button>

          {otherGroups.map((g, idx) => {
            const realIdx = myGroup ? idx + 1 : idx;
            return (
              <button
                key={g.author.user_id}
                onClick={() => setViewer({ groupIdx: realIdx, storyIdx: 0 })}
                className="flex flex-col items-center gap-1 shrink-0"
              >
                <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-primary">
                  <div className="w-full h-full rounded-full bg-background overflow-hidden flex items-center justify-center">
                    {g.author.avatar_url ? (
                      <img src={g.author.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold">{(g.author.name || "A")[0]}</span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground truncate max-w-[64px]">{g.author.username ?? g.author.name.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Composer */}
      <AnimatePresence>
        {composerOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/90 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => !uploading && setComposerOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="glass rounded-3xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">Novo Story (24h)</h3>
                <button onClick={() => setComposerOpen(false)}><X size={18} /></button>
              </div>
              <input ref={fileInput} type="file" accept="image/*,video/*" hidden
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file ? (
                file.type.startsWith("video")
                  ? <video src={URL.createObjectURL(file)} className="w-full rounded-xl mb-2" controls />
                  : <img src={URL.createObjectURL(file)} className="w-full rounded-xl mb-2" alt="preview" />
              ) : (
                <button onClick={() => fileInput.current?.click()}
                  className="w-full aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 mb-2 text-muted-foreground">
                  <ImagePlus size={28} />
                  <span className="text-xs">Selecionar foto/vídeo</span>
                </button>
              )}
              <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Legenda (opcional)"
                className="w-full bg-secondary rounded-xl px-3 py-2 text-sm mb-3" />
              <button onClick={handleUpload} disabled={!file || uploading}
                className="w-full bg-gradient-primary text-primary-foreground rounded-xl py-2.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {uploading ? <Loader2 size={16} className="animate-spin" /> : "Publicar"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Viewer */}
      <AnimatePresence>
        {viewer && groups[viewer.groupIdx] && (
          <StoryViewer
            groups={groups}
            start={viewer}
            onClose={() => setViewer(null)}
            onDelete={async (id) => {
              await supabase.from("stories").delete().eq("id", id);
              await load();
            }}
            currentUserId={user?.id}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function StoryViewer({
  groups, start, onClose, onDelete, currentUserId,
}: {
  groups: Group[];
  start: { groupIdx: number; storyIdx: number };
  onClose: () => void;
  onDelete: (id: string) => void;
  currentUserId?: string;
}) {
  const [gi, setGi] = useState(start.groupIdx);
  const [si, setSi] = useState(start.storyIdx);
  const [progress, setProgress] = useState(0);

  const group = groups[gi];
  const story = group?.stories[si];

  useEffect(() => {
    setProgress(0);
    if (!story) return;
    if (currentUserId && story.user_id !== currentUserId) {
      supabase.from("story_views").insert({ story_id: story.id, viewer_id: currentUserId }).then(() => {});
    }
    const dur = story.media_type === "video" ? 15000 : 5000;
    const start = Date.now();
    const t = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / dur) * 100);
      setProgress(p);
      if (p >= 100) { clearInterval(t); next(); }
    }, 60);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gi, si]);

  const next = () => {
    if (!group) return;
    if (si + 1 < group.stories.length) setSi(si + 1);
    else if (gi + 1 < groups.length) { setGi(gi + 1); setSi(0); }
    else onClose();
  };
  const prev = () => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) { setGi(gi - 1); setSi(groups[gi - 1].stories.length - 1); }
  };

  if (!group || !story) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
    >
      <div className="relative w-full h-full max-w-md mx-auto flex flex-col">
        <div className="flex gap-1 p-2">
          {group.stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div className="h-full bg-white" style={{ width: `${i < si ? 100 : i === si ? progress : 0}%` }} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden">
              {group.author.avatar_url && <img src={group.author.avatar_url} alt="" className="w-full h-full object-cover" />}
            </div>
            <div>
              <div className="text-sm font-bold text-white">{group.author.username ?? group.author.name}</div>
              <div className="text-[10px] text-white/60">
                {Math.max(0, Math.round((new Date(story.expires_at).getTime() - Date.now()) / 3600000))}h restantes
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {story.user_id === currentUserId && (
              <button onClick={() => { onDelete(story.id); onClose(); }} className="text-white/80 text-xs">Excluir</button>
            )}
            <button onClick={onClose} className="text-white"><X size={22} /></button>
          </div>
        </div>

        <div className="flex-1 relative flex items-center justify-center">
          {story.media_type === "video" ? (
            <video src={story.media_url} autoPlay playsInline className="max-h-full max-w-full" />
          ) : (
            <img src={story.media_url} alt="" className="max-h-full max-w-full object-contain" />
          )}
          {story.caption && (
            <div className="absolute bottom-6 left-4 right-4 bg-black/50 rounded-xl p-3 text-white text-sm text-center">{story.caption}</div>
          )}
          <button onClick={prev} className="absolute left-0 top-0 w-1/3 h-full" aria-label="Anterior" />
          <button onClick={next} className="absolute right-0 top-0 w-1/3 h-full" aria-label="Próximo" />
        </div>
      </div>
    </motion.div>
  );
}
