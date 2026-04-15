import { Flame } from "lucide-react";
import { motion } from "framer-motion";

interface StreakBadgeProps {
  days: number;
}

export default function StreakBadge({ days }: StreakBadgeProps) {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="flex items-center gap-2 bg-gradient-primary px-4 py-2 rounded-full"
    >
      <Flame size={18} className="text-primary-foreground animate-pulse-neon" />
      <span className="text-sm font-bold text-primary-foreground font-display">
        {days} dias seguidos! 🔥
      </span>
    </motion.div>
  );
}
