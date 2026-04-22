import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { User, Save, Loader2 } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useProfile } from "@/hooks/useProfile";
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
  { value: "ectomorfo", label: "Ectomorfo" },
  { value: "mesomorfo", label: "Mesomorfo" },
  { value: "endomorfo", label: "Endomorfo" },
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

function SelectChips<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
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
  const { profile, updateProfile, loading } = useProfile();
  const [local, setLocal] = useState(profile);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) setLocal(profile);
  }, [profile]);

  if (loading || !local) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  const set = (updates: Partial<typeof local>) => setLocal({ ...local!, ...updates });

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({
      name: local.name,
      bio: local.bio,
      age: local.age,
      weight: local.weight,
      height: local.height,
      level: local.level,
      goal: local.goal,
      body_type: local.body_type,
      sleep_hours: local.sleep_hours,
      sleep_quality: local.sleep_quality,
      weekly_frequency: local.weekly_frequency,
      training_time: local.training_time,
    });
    setSaving(false);
    toast({ title: "Perfil salvo! ✅" });
  };

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold font-display mb-6">Meu <span className="text-gradient">Perfil</span></h1>

      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center mb-8">
        <div className="w-24 h-24 rounded-full bg-gradient-primary flex items-center justify-center mb-3 shadow-neon overflow-hidden">
          {local.avatar_url ? (
            <img src={local.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <User size={40} className="text-primary-foreground" />
          )}
        </div>
        <p className="font-bold font-display text-lg">{local.name || "Sem nome"}</p>
        <p className="text-xs text-muted-foreground capitalize">{local.level} • {local.body_type}</p>
      </motion.div>

      <div className="space-y-6">
        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Nome</label>
          <input
            type="text"
            value={local.name}
            onChange={e => set({ name: e.target.value.slice(0, 60) })}
            placeholder="Seu nome"
            className="w-full bg-secondary rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Bio</label>
          <textarea
            value={local.bio || ""}
            onChange={e => set({ bio: e.target.value.slice(0, 200) })}
            placeholder="Conte um pouco sobre você..."
            rows={2}
            className="w-full bg-secondary rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Idade", key: "age" as const },
            { label: "Peso (kg)", key: "weight" as const },
            { label: "Altura (cm)", key: "height" as const },
          ].map(field => (
            <div key={field.key}>
              <label className="text-xs font-bold text-muted-foreground mb-2 block">{field.label}</label>
              <input
                type="number"
                value={local[field.key] as number}
                onChange={e => set({ [field.key]: Number(e.target.value) } as any)}
                className="w-full bg-secondary rounded-xl px-3 py-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          ))}
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Nível</label>
          <SelectChips options={levels} value={local.level} onChange={v => set({ level: v })} />
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Objetivo</label>
          <SelectChips options={goals} value={local.goal} onChange={v => set({ goal: v })} />
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Biotipo</label>
          <SelectChips options={bodyTypes} value={local.body_type} onChange={v => set({ body_type: v })} />
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Horas de Sono: {local.sleep_hours}h</label>
          <input
            type="range"
            min={4}
            max={10}
            value={local.sleep_hours}
            onChange={e => set({ sleep_hours: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Qualidade do Sono</label>
          <SelectChips options={sleepQualities} value={local.sleep_quality} onChange={v => set({ sleep_quality: v })} />
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Frequência Semanal: {local.weekly_frequency}x</label>
          <input
            type="range"
            min={3}
            max={6}
            value={local.weekly_frequency}
            onChange={e => set({ weekly_frequency: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-muted-foreground mb-2 block">Horário do Treino</label>
          <SelectChips options={trainingTimes} value={local.training_time} onChange={v => set({ training_time: v })} />
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-gradient-primary text-primary-foreground font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-neon disabled:opacity-60"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? "Salvando..." : "Salvar Perfil"}
        </motion.button>
      </div>

      <BottomNav />
    </div>
  );
}
