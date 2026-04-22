import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Apple, Flame, Beef, Wheat, Droplet, Sparkles, Loader2, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import BottomNav from "@/components/BottomNav";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

function calcBMR(weight: number, height: number, age: number) {
  // Mifflin-St Jeor (men)
  return 10 * weight + 6.25 * height - 5 * age + 5;
}

function activityFactor(freq: number) {
  if (freq <= 3) return 1.375;
  if (freq <= 4) return 1.55;
  return 1.725;
}

function goalAdjust(goal: string, tdee: number) {
  switch (goal) {
    case "emagrecimento": return tdee - 400;
    case "hipertrofia": return tdee + 350;
    case "alta_performance": return tdee + 200;
    default: return tdee;
  }
}

function macros(calories: number, weight: number, goal: string) {
  const proteinPerKg = goal === "hipertrofia" ? 2.0 : goal === "emagrecimento" ? 2.2 : 1.6;
  const protein = Math.round(weight * proteinPerKg);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
  return { protein, carbs, fat };
}

const recommendations: Record<string, string[]> = {
  emagrecimento: [
    "Priorize proteínas magras em todas refeições (frango, peixe, ovos)",
    "Beba 35ml de água por kg de peso por dia",
    "Reduza ultraprocessados e açúcares simples",
    "Inclua vegetais em pelo menos 2 refeições",
  ],
  hipertrofia: [
    "Distribua proteína em 4-5 refeições (~30g cada)",
    "Coma carboidratos complexos antes e depois do treino",
    "Não pule refeições — superávit calórico é essencial",
    "Inclua gorduras boas: castanhas, abacate, azeite",
  ],
  condicionamento: [
    "Carboidratos como combustível principal",
    "Hidrate-se com isotônicos em treinos longos",
    "Frutas como pré-treino rápido",
    "Equilibre macros sem extremos",
  ],
  saude_mental: [
    "Inclua ômega-3: salmão, sardinha, chia",
    "Reduza cafeína após 14h",
    "Magnésio: folhas verdes, banana, chocolate amargo 70%+",
    "Mantenha horários regulares de refeição",
  ],
  alta_performance: [
    "Periodize carboidratos conforme intensidade do treino",
    "Suplementação básica: creatina e whey",
    "Janela anabólica: refeição 1h pós-treino",
    "Monitore HRV e ajuste calorias semanalmente",
  ],
};

export default function NutritionPage() {
  const { profile, updateProfile, loading } = useProfile();
  const [allergies, setAllergies] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [aiPlan, setAiPlan] = useState<string>("");
  const [generating, setGenerating] = useState(false);

  // Initialize from DB
  useMemo(() => {
    if (profile) {
      setAllergies(profile.allergies || "");
      setRestrictions(profile.dietary_restrictions || "");
    }
  }, [profile?.id]);

  const data = useMemo(() => {
    if (!profile) return null;
    const bmr = calcBMR(profile.weight, profile.height, profile.age);
    const tdee = bmr * activityFactor(profile.weekly_frequency);
    const target = Math.round(goalAdjust(profile.goal, tdee));
    const m = macros(target, profile.weight, profile.goal);
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), target, ...m };
  }, [profile]);

  const generatePlan = async () => {
    if (!profile || !data) return;
    setGenerating(true);
    setAiPlan("");
    try {
      // Save dietary fields first
      await updateProfile({ allergies, dietary_restrictions: restrictions });

      const { data: res, error } = await supabase.functions.invoke("generate-nutrition", {
        body: {
          profile: { ...profile, allergies, dietary_restrictions: restrictions },
          calories: data.target,
          macros: { protein: data.protein, carbs: data.carbs, fat: data.fat },
        },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);
      setAiPlan(res?.plan || "");
      toast({ title: "Plano gerado! 🥗" });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Não foi possível gerar o plano.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (loading || !profile || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-gradient-primary flex items-center justify-center shadow-neon">
          <Apple size={22} className="text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display">
            <span className="text-gradient">Nutrição</span> Inteligente
          </h1>
          <p className="text-xs text-muted-foreground">Calculado a partir do seu perfil</p>
        </div>
      </div>

      {/* Calories card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass glow-border rounded-2xl p-5 mb-4 text-center"
      >
        <Flame size={22} className="text-primary mx-auto mb-1" />
        <p className="text-xs text-muted-foreground">Meta calórica diária</p>
        <p className="text-4xl font-bold font-display text-gradient my-1">{data.target}</p>
        <p className="text-xs text-muted-foreground">kcal • TDEE base {data.tdee}</p>
      </motion.div>

      {/* Macros */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { icon: Beef, label: "Proteína", val: data.protein, unit: "g", color: "primary" },
          { icon: Wheat, label: "Carbo", val: data.carbs, unit: "g", color: "accent" },
          { icon: Droplet, label: "Gordura", val: data.fat, unit: "g", color: "primary" },
        ].map(m => (
          <div key={m.label} className="glass rounded-2xl p-3 text-center">
            <m.icon size={18} className={`mx-auto mb-1 ${m.color === "primary" ? "text-primary" : "text-accent"}`} />
            <p className="text-lg font-bold font-display">{m.val}{m.unit}</p>
            <p className="text-[10px] text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      <h2 className="text-sm font-bold font-display mb-2 text-muted-foreground uppercase tracking-wide">
        Recomendações para {profile.goal.replace("_", " ")}
      </h2>
      <div className="glass rounded-2xl p-4 mb-6 space-y-2">
        {(recommendations[profile.goal] || []).map((r, i) => (
          <div key={i} className="flex gap-2 text-sm">
            <span className="text-primary">•</span>
            <p className="text-foreground/85 leading-relaxed">{r}</p>
          </div>
        ))}
      </div>

      {/* Dietary inputs */}
      <h2 className="text-sm font-bold font-display mb-2 text-muted-foreground uppercase tracking-wide">
        Suas restrições
      </h2>
      <div className="space-y-3 mb-4">
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Alergias</label>
          <input
            type="text"
            value={allergies}
            onChange={e => setAllergies(e.target.value.slice(0, 200))}
            placeholder="Ex: amendoim, lactose..."
            className="w-full bg-secondary rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Restrições alimentares</label>
          <input
            type="text"
            value={restrictions}
            onChange={e => setRestrictions(e.target.value.slice(0, 200))}
            placeholder="Ex: vegetariano, sem glúten..."
            className="w-full bg-secondary rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={generatePlan}
        disabled={generating}
        className="w-full bg-gradient-primary text-primary-foreground font-bold py-3.5 rounded-xl shadow-neon disabled:opacity-60 flex items-center justify-center gap-2 mb-4"
      >
        {generating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
        {generating ? "Gerando plano..." : "Gerar plano alimentar com IA"}
      </motion.button>

      {aiPlan && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass glow-border rounded-2xl p-5 mb-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-primary" />
            <h3 className="font-bold font-display">Seu plano personalizado</h3>
          </div>
          <div className="prose prose-sm prose-invert max-w-none prose-headings:font-display prose-strong:text-primary">
            <ReactMarkdown>{aiPlan}</ReactMarkdown>
          </div>
        </motion.div>
      )}

      <div className="flex gap-2 text-xs text-muted-foreground p-3 bg-secondary/50 rounded-xl">
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        <p>Esses cálculos são estimativas. Para acompanhamento personalizado, consulte um nutricionista.</p>
      </div>

      <BottomNav />
    </div>
  );
}
