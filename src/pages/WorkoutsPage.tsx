import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Dumbbell, Play, Clock, Zap, RefreshCw } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useLocalProfile } from "@/hooks/useLocalProfile";
import { generateWorkoutPlan, type WorkoutPlan, type WorkoutDay } from "@/lib/workout-generator";

function WorkoutDayCard({ day, index }: { day: WorkoutDay; index: number }) {
  const [open, setOpen] = useState(false);

  if (day.type === "descanso") {
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.05 }}
        className="glass rounded-2xl p-4 border-border/30"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">😴</div>
          <div>
            <p className="font-bold font-display text-sm">{day.day}</p>
            <p className="text-xs text-muted-foreground">Descanso ativo — alongamento e recuperação</p>
          </div>
        </div>
      </motion.div>
    );
  }

  const typeIcon = day.type === "cardio" ? "🏃" : day.type === "funcional" ? "⚡" : "🏋️";

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="glass rounded-2xl overflow-hidden glow-border"
    >
      <button onClick={() => setOpen(!open)} className="w-full p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-lg">{typeIcon}</div>
          <div className="text-left">
            <p className="font-bold font-display text-sm">{day.day}</p>
            <p className="text-xs text-muted-foreground">{day.focus} • {day.exercises.length} exercícios</p>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {day.warmup && (
                <div className="bg-accent/10 rounded-xl p-3">
                  <p className="text-xs font-bold text-accent mb-1">🔥 Aquecimento</p>
                  <p className="text-xs text-muted-foreground">{day.warmup}</p>
                </div>
              )}
              {day.exercises.map((ex, i) => (
                <div key={i} className="bg-secondary/50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold">{ex.name}</p>
                    <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full">{ex.muscleGroup}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{ex.description}</p>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Dumbbell size={12} /> {ex.sets}x{ex.reps}</span>
                    <span className="flex items-center gap-1"><Clock size={12} /> {ex.rest}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function WorkoutsPage() {
  const { profile, isProfileComplete } = useLocalProfile();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);

  const handleGenerate = () => {
    const newPlan = generateWorkoutPlan(profile);
    setPlan(newPlan);
  };

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display">Meus <span className="text-gradient">Treinos</span></h1>
        {plan && (
          <button onClick={handleGenerate} className="p-2 rounded-xl bg-secondary">
            <RefreshCw size={18} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {!plan ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-6">
            <Zap size={36} className="text-primary" />
          </div>
          <h2 className="text-xl font-bold font-display mb-2">Gere seu treino com IA</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            {isProfileComplete
              ? "Baseado no seu perfil, vamos criar o treino perfeito para você."
              : "Complete seu perfil primeiro para treinos personalizados."}
          </p>
          <button
            onClick={handleGenerate}
            className="bg-gradient-primary text-primary-foreground font-bold px-8 py-3 rounded-full flex items-center gap-2 mx-auto"
          >
            <Play size={18} />
            Gerar Treino Personalizado
          </button>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {/* Explanation */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass glow-border rounded-2xl p-4 mb-2">
            <p className="text-xs font-bold text-primary mb-1">🧠 Por que este treino?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{plan.explanation}</p>
          </motion.div>

          {/* Days */}
          {plan.weeklyPlan.map((day, i) => (
            <WorkoutDayCard key={day.day} day={day} index={i} />
          ))}

          {/* Tips */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-2xl p-4">
            <p className="text-sm font-bold font-display mb-2">💡 Dicas</p>
            <ul className="space-y-1.5">
              {plan.tips.map((tip, i) => (
                <li key={i} className="text-xs text-muted-foreground">• {tip}</li>
              ))}
            </ul>
          </motion.div>

          {/* Evolution */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-2xl p-4 border-accent/20">
            <p className="text-sm font-bold font-display mb-1">📈 Evolução</p>
            <p className="text-xs text-muted-foreground">{plan.evolution}</p>
          </motion.div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
