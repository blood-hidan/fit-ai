import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  subtitle?: string;
  variant?: "default" | "primary" | "accent";
}

export default function StatCard({ icon: Icon, label, value, subtitle, variant = "default" }: StatCardProps) {
  const borderClass = variant === "primary" ? "glow-border" : variant === "accent" ? "shadow-neon-blue border-accent/30" : "border-border/50";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass rounded-2xl p-4 ${borderClass}`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${variant === "primary" ? "bg-primary/15" : variant === "accent" ? "bg-accent/15" : "bg-secondary"}`}>
          <Icon size={20} className={variant === "primary" ? "text-primary" : variant === "accent" ? "text-accent" : "text-foreground"} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold font-display">{value}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </motion.div>
  );
}
