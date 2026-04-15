import { useState } from "react";
import { motion } from "framer-motion";
import { Heart, MessageCircle, Send, Users, Plus, Image } from "lucide-react";
import BottomNav from "@/components/BottomNav";

interface Post {
  id: number;
  user: string;
  avatar: string;
  content: string;
  likes: number;
  comments: number;
  liked: boolean;
  time: string;
  image?: boolean;
}

const initialPosts: Post[] = [
  { id: 1, user: "Ana Fitness", avatar: "🏋️‍♀️", content: "Acabei de completar meu treino de pernas! 🔥 Leg press 4x15 + Agachamento livre 4x12. Estou destruída mas feliz!", likes: 24, comments: 5, liked: false, time: "2h atrás", image: true },
  { id: 2, user: "Carlos Runner", avatar: "🏃", content: "10km em 48min hoje de manhã. Novo recorde pessoal! 🏆 O treino do MultiFit está fazendo diferença.", likes: 42, comments: 12, liked: true, time: "4h atrás" },
  { id: 3, user: "Maria Strong", avatar: "💪", content: "Semana 4 do programa de hipertrofia. Já sinto diferença no shape! Obrigada pela comunidade incrível ❤️", likes: 18, comments: 3, liked: false, time: "6h atrás", image: true },
  { id: 4, user: "Pedro Coach", avatar: "🎯", content: "Dica: Não pule o aquecimento! 5 minutos podem prevenir meses de lesão. Cuidem-se! 🙏", likes: 67, comments: 21, liked: false, time: "8h atrás" },
];

export default function CommunityPage() {
  const [posts, setPosts] = useState(initialPosts);
  const [newPost, setNewPost] = useState("");

  const toggleLike = (id: number) => {
    setPosts(prev =>
      prev.map(p =>
        p.id === id ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 } : p
      )
    );
  };

  const addPost = () => {
    if (!newPost.trim()) return;
    setPosts(prev => [
      {
        id: Date.now(),
        user: "Você",
        avatar: "🙂",
        content: newPost,
        likes: 0,
        comments: 0,
        liked: false,
        time: "agora",
      },
      ...prev,
    ]);
    setNewPost("");
  };

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display"><span className="text-gradient">Comunidade</span></h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">1.2k online</span>
          <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
        </div>
      </div>

      {/* New Post */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-2xl p-4 mb-6">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-lg shrink-0">🙂</div>
          <div className="flex-1">
            <textarea
              value={newPost}
              onChange={e => setNewPost(e.target.value)}
              placeholder="Compartilhe seu treino..."
              rows={2}
              className="w-full bg-transparent text-sm resize-none focus:outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between mt-2">
              <button className="p-2 rounded-lg bg-secondary">
                <Image size={16} className="text-muted-foreground" />
              </button>
              <button onClick={addPost} className="bg-gradient-primary text-primary-foreground text-xs font-bold px-4 py-2 rounded-full flex items-center gap-1.5">
                <Send size={14} /> Postar
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Feed */}
      <div className="space-y-4">
        {posts.map((post, i) => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-2xl p-4"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg">{post.avatar}</div>
              <div className="flex-1">
                <p className="text-sm font-bold">{post.user}</p>
                <p className="text-[10px] text-muted-foreground">{post.time}</p>
              </div>
              <button className="text-xs bg-primary/15 text-primary px-3 py-1 rounded-full font-medium">Seguir</button>
            </div>
            <p className="text-sm leading-relaxed mb-3">{post.content}</p>
            {post.image && (
              <div className="w-full h-40 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 mb-3 flex items-center justify-center">
                <span className="text-3xl">📸</span>
              </div>
            )}
            <div className="flex items-center gap-6">
              <button onClick={() => toggleLike(post.id)} className="flex items-center gap-1.5 text-xs">
                <Heart size={16} className={post.liked ? "text-neon-pink fill-neon-pink" : "text-muted-foreground"} />
                <span className={post.liked ? "text-neon-pink" : "text-muted-foreground"}>{post.likes}</span>
              </button>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MessageCircle size={16} /> {post.comments}
              </button>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
                <Send size={14} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
