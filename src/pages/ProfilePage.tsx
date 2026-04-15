import { useState } from "react";
import { motion } from "framer-motion";
import { User, Save, ChevronRight } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useLocalProfile } from "@/hooks/useLocalProfile";
import { toast } from "@/hooks/use-toast";

const levels = [
  { value: "iniciante", label: "🌱 Iniciante" },
  { value: "intermediario", label: "💪 Intermediário" },
  { value: "avancado", label: "🔥 Avançado" },
] as const;

const goals = [
  { value: "emagrecimento", label: "⚖️ Emagrecimento" },
  { value: "hipertrofia", label: "🏋️ Hipertrofia" },
  { value: "condicionamento", label: "🏃 Condicionamento" },
  { value: "saude_mental", label: "🧘 Saúde Mental" },
  { value: "alta_performance", label: "🏆 Alta Performance" },
] as const;

const bodyTypes = [
  { value: "ectomorfo", label: "Ectomorfo", desc: "Magro, dificuldade para ganhar peso" },
  { value: "mesomorfo", label: "Mesomorfo", desc: "Atlético, ganha músculo fácil" },
  { value: "endomorfo", label: "Endomorfo", desc: "Tendência a acumular gordura" },
] as const;

const sleepQualities = [
  { value: "ruim", label: "😫 Ruim" },
  { value: "regular", label: "😐 Regular" },
  { value: "boa", label: "😊 Boa" },
  { value: "excelente", label: "😴 Excelente" },
] as const;

const trainingTimes = [
  { value: "manha", label: "🌅 Manhã" },
  { value: "tarde", label: "☀️ Tarde" },
  { value: "noite", label: "🌙 Noite" },
] as const;

function SelectChips<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string; desc?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
            value === opt.value
              ? "bg-gradient-primary text-primary-foreground shadow-neon"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const { profile, updateProfile } = useLocalProfile();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    toast({ title: "Perfil salvo! ✅", description: "Seus dados foram atualizados." });
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold font-display mb-6">Meu <span className="text-gradient">Perfil</span></h1>

      {/* Avatar */}
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center mb-8">
        <div className="w-24 h-24 rounded-full bg-gradient-primary flex items-center justify-center mb-3 shadow-neon">
          <User size={40} className="text-primary-foreground" />
        </div>
        <p className="font-bold font-display text-lg">{profile.name || "Configure seu perfil"}</p>
        <p className="text-xs text-muted-foreground">{profile.level === "iniciante" ? "Iniciante" : profile.level === "intermediario" ? "Intermediário" : "Avançado"} • {profile.bodyType}</p>
      </motion.div>

      <div className="space-y-6">
        {/* Name */}
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Nome</label>
          <input
            type="text"
            value={profile.name}
            onChange={e => updateProfile({ name: e.target.value })}
            placeholder="Seu nome"
            className="w-full bg-secondary rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Idade", key: "age" as const, suffix: "anos" },
            { label: "Peso", key: "weight" as const, suffix: "kg" },
            { label: "Altura", key: "height" as const, suffix: "cm" },
          ].map(field => (
            <div key={field.key}>
              <label className="text-xs font-bold text-muted-foreground mb-2 block">{field.label}</label>
              <input
                type="number"
                value={profile[field.key]}
                onChange={e => updateProfile({ [field.key]: Number(e.target.value) })}
                className="w-full bg-secondary rounded-xl px-3 py-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          ))}
        </div>

        {/* Level */}
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Nível</label>
          <SelectChips options={levels} value={profile.level} onChange={v => updateProfile({ level: v })} />
        </div>

        {/* Goal */}
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Objetivo</label>
          <SelectChips options={goals} value={profile.goal} onChange={v => updateProfile({ goal: v })} />
        </div>

        {/* Body Type */}
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Biotipo</label>
          <SelectChips options={bodyTypes} value={profile.bodyType} onChange={v => updateProfile({ bodyType: v })} />
        </div>

        {/* Sleep */}
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Horas de Sono</label>
          <input
            type="range"
            min={4}
            max={10}
            value={profile.sleepHours}
            onChange={e => updateProfile({ sleepHours: Number(e.target.value) })}
            className="w-full accent-primary"
          />
          <p className="text-xs text-muted-foreground text-center mt-1">{profile.sleepHours} horas</p>
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Qualidade do Sono</label>
          <SelectChips options={sleepQualities} value={profile.sleepQuality} onChange={v => updateProfile({ sleepQuality: v })} />
        </div>

        {/* Training */}
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Frequência Semanal: {profile.weeklyFrequency}x</label>
          <input
            type="range"
            min={3}
            max={6}
            value={profile.weeklyFrequency}
            onChange={e => updateProfile({ weeklyFrequency: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Horário do Treino</label>
          <SelectChips options={trainingTimes} value={profile.trainingTime} onChange={v => updateProfile({ trainingTime: v })} />
        </div>

        {/* Save */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          className="w-full bg-gradient-primary text-primary-foreground font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-neon"
        >
          <Save size={18} />
          {saved ? "Salvo! ✅" : "Salvar Perfil"}
        </motion.button>
      </div>

      <BottomNav />
    </div>
  );
}
