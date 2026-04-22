import { motion } from "framer-motion";
import { TrendingUp, Flame, Target, Calendar, Award, Zap } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import StatCard from "@/components/StatCard";
import { useProfile } from "@/hooks/useProfile";
import { calculateCalories } from "@/lib/workout-generator";

export default function DashboardPage() {
  const { profile } = useProfile();
  const weight = Number(profile?.weight ?? 70);
  const height = Number(profile?.height ?? 170);
  const age = profile?.age ?? 25;
  const goal = profile?.goal ?? "hipertrofia";
  const calories = calculateCalories(weight, height, age, goal);

  const weekData = [65, 80, 45, 90, 70, 85, 0];
  const maxVal = Math.max(...weekData);

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold font-display mb-6">
        <span className="text-gradient">Dashboard</span>
      </h1>

      {/* Calorie Target */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass glow-border rounded-2xl p-5 mb-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-muted-foreground">Meta calórica diária</p>
            <p className="text-3xl font-bold font-display text-gradient">{calories}</p>
            <p className="text-xs text-muted-foreground">kcal estimadas</p>
          </div>
          <div className="w-20 h-20 rounded-full border-4 border-primary/30 flex items-center justify-center relative">
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="40" cy="40" r="36" fill="none" stroke="hsl(265 90% 60% / 0.3)" strokeWidth="4" />
              <circle cx="40" cy="40" r="36" fill="none" stroke="hsl(265 90% 60%)" strokeWidth="4" strokeDasharray={`${226 * 0.7} 226`} strokeLinecap="round" />
            </svg>
            <span className="text-sm font-bold">70%</span>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard icon={Flame} label="Queimadas" value="2.940" subtitle="esta semana" variant="primary" />
        <StatCard icon={Target} label="Objetivo" value={goal === "hipertrofia" ? "Hipertrofia" : goal === "emagrecimento" ? "Emagrecer" : "Condição"} variant="accent" />
        <StatCard icon={Calendar} label="Treinos" value="5/7" subtitle="esta semana" />
        <StatCard icon={Award} label="Recorde" value="12 dias" subtitle="melhor sequência" />
      </div>

      {/* Weekly Chart */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl p-5 mb-6"
      >
        <h2 className="text-sm font-bold font-display mb-4">Intensidade Semanal</h2>
        <div className="flex items-end justify-between gap-2 h-32">
          {weekData.map((val, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${(val / maxVal) * 100}%` }}
                transition={{ delay: 0.3 + i * 0.05, duration: 0.5 }}
                className={`w-full rounded-lg min-h-[4px] ${
                  val > 0 ? "bg-gradient-primary" : "bg-secondary"
                }`}
              />
              <span className="text-[10px] text-muted-foreground">
                {["S", "T", "Q", "Q", "S", "S", "D"][i]}
              </span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Body Stats */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-2xl p-5 mb-4">
        <h2 className="text-sm font-bold font-display mb-3">Dados Corporais</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold font-display text-gradient">{weight}</p>
            <p className="text-[10px] text-muted-foreground">kg</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-display text-gradient">{height}</p>
            <p className="text-[10px] text-muted-foreground">cm</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-display text-gradient">{(weight / (height / 100) ** 2).toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground">IMC</p>
          </div>
        </div>
      </motion.div>

      <BottomNav />
    </div>
  );
}
