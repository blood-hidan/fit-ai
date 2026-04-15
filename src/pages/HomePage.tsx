import { motion } from "framer-motion";
import { Dumbbell, Flame, Footprints, Timer, TrendingUp, Zap, Moon, Trophy } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import StatCard from "@/components/StatCard";
import StreakBadge from "@/components/StreakBadge";
import { useLocalProfile } from "@/hooks/useLocalProfile";
import { useNavigate } from "react-router-dom";

const quotes = [
  "O corpo alcança o que a mente acredita. 💪",
  "Disciplina é o que te move quando a motivação falha.",
  "Cada treino te aproxima do seu melhor. 🔥",
  "Não pare quando estiver cansado. Pare quando terminar.",
  "Seu único limite é você mesmo.",
];

export default function HomePage() {
  const { profile, isProfileComplete } = useLocalProfile();
  const navigate = useNavigate();
  const quote = quotes[Math.floor(Math.random() * quotes.length)];

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <p className="text-sm text-muted-foreground">Olá,</p>
          <h1 className="text-2xl font-bold font-display">
            {isProfileComplete ? profile.name : "Atleta"} <span className="text-gradient">MultiFit</span>
          </h1>
        </div>
        <StreakBadge days={7} />
      </motion.div>

      {/* Motivational Quote */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="glass glow-border rounded-2xl p-5 mb-6"
      >
        <p className="text-sm text-foreground/80 italic font-body leading-relaxed">{quote}</p>
      </motion.div>

      {/* Profile Setup CTA */}
      {!isProfileComplete && (
        <motion.button
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => navigate("/profile")}
          className="w-full bg-gradient-primary text-primary-foreground rounded-2xl p-5 mb-6 text-left"
        >
          <div className="flex items-center gap-3">
            <Zap size={24} />
            <div>
              <p className="font-bold font-display">Configure seu perfil</p>
              <p className="text-xs opacity-80">Para gerar treinos personalizados com IA</p>
            </div>
          </div>
        </motion.button>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard icon={Flame} label="Calorias" value="420" subtitle="queimadas hoje" variant="primary" />
        <StatCard icon={Footprints} label="Passos" value="6.230" subtitle="de 10.000" variant="accent" />
        <StatCard icon={Timer} label="Tempo Ativo" value="45 min" subtitle="hoje" />
        <StatCard icon={Moon} label="Sono" value={`${profile.sleepHours}h`} subtitle={profile.sleepQuality} />
      </div>

      {/* Quick Actions */}
      <h2 className="text-lg font-bold font-display mb-3">Acesso Rápido</h2>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { icon: Dumbbell, label: "Meu Treino", path: "/workouts", color: "primary" },
          { icon: TrendingUp, label: "Progresso", path: "/dashboard", color: "accent" },
          { icon: Trophy, label: "Conquistas", path: "/profile", color: "primary" },
          { icon: Zap, label: "Gerar Treino", path: "/workouts", color: "accent" },
        ].map((item, i) => (
          <motion.button
            key={item.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i }}
            onClick={() => navigate(item.path)}
            className="glass rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-primary/30 transition-all"
          >
            <div className={`p-3 rounded-xl ${item.color === "primary" ? "bg-primary/15" : "bg-accent/15"}`}>
              <item.icon size={22} className={item.color === "primary" ? "text-primary" : "text-accent"} />
            </div>
            <span className="text-xs font-medium">{item.label}</span>
          </motion.button>
        ))}
      </div>

      {/* Weekly Progress */}
      <h2 className="text-lg font-bold font-display mb-3">Esta Semana</h2>
      <div className="glass rounded-2xl p-4 mb-4">
        <div className="flex justify-between mb-3">
          {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">{d}</span>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < 5
                    ? "bg-gradient-primary text-primary-foreground"
                    : i === 5
                    ? "border-2 border-primary/50 text-primary"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {i < 5 ? "✓" : ""}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center">5 de 7 treinos completados</p>
      </div>

      <BottomNav />
    </div>
  );
}
