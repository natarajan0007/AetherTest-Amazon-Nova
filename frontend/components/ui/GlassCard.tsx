"use client";
import { motion } from "framer-motion";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: "cyan" | "violet" | "success" | "warning" | "error" | "none";
  padding?: "none" | "sm" | "md" | "lg";
  onClick?: () => void;
}

const glowColors = {
  cyan: "hover:shadow-[0_0_30px_rgba(56,189,248,0.15)] hover:border-cyan-500/30",
  violet: "hover:shadow-[0_0_30px_rgba(139,92,246,0.15)] hover:border-violet-500/30",
  success: "hover:shadow-[0_0_30px_rgba(34,197,94,0.15)] hover:border-green-500/30",
  warning: "hover:shadow-[0_0_30px_rgba(251,191,36,0.15)] hover:border-yellow-500/30",
  error: "hover:shadow-[0_0_30px_rgba(239,68,68,0.15)] hover:border-red-500/30",
  none: "",
};

const paddings = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-8",
};

export function GlassCard({
  children,
  className,
  hover = true,
  glow = "cyan",
  padding = "md",
  onClick,
}: GlassCardProps) {
  const Component = onClick ? motion.button : motion.div;

  return (
    <Component
      whileHover={hover ? { y: -2, scale: 1.01 } : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      onClick={onClick}
      className={cn(
        "relative rounded-2xl",
        "bg-slate-900/50 backdrop-blur-xl",
        "border border-slate-700/50",
        "transition-all duration-300",
        hover && glowColors[glow],
        paddings[padding],
        onClick && "cursor-pointer",
        className
      )}
    >
      {/* Glass reflection effect */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </Component>
  );
}

// Stat card variant
export function StatCard({
  label,
  value,
  icon,
  trend,
  color = "cyan",
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: { value: number; label: string };
  color?: "cyan" | "violet" | "success" | "warning" | "error";
}) {
  const colorClasses = {
    cyan: "text-cyan-400",
    violet: "text-violet-400",
    success: "text-green-400",
    warning: "text-yellow-400",
    error: "text-red-400",
  };

  return (
    <GlassCard glow={color} padding="md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">
            {label}
          </p>
          <p className={cn("text-2xl font-bold font-mono mt-1", colorClasses[color])}>
            {value}
          </p>
          {trend && (
            <p className={cn(
              "text-xs mt-1",
              trend.value >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            "bg-slate-800/50 border border-slate-700/50",
            colorClasses[color]
          )}>
            {icon}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// Feature card variant
export function FeatureCard({
  title,
  description,
  icon,
  color = "cyan",
}: {
  title: string;
  description: string;
  icon: ReactNode;
  color?: "cyan" | "violet" | "success" | "warning";
}) {
  const colorClasses = {
    cyan: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/30",
    violet: "from-violet-500/20 to-violet-500/5 border-violet-500/30",
    success: "from-green-500/20 to-green-500/5 border-green-500/30",
    warning: "from-yellow-500/20 to-yellow-500/5 border-yellow-500/30",
  };

  const iconColors = {
    cyan: "text-cyan-400",
    violet: "text-violet-400",
    success: "text-green-400",
    warning: "text-yellow-400",
  };

  return (
    <GlassCard glow={color} padding="lg" hover>
      <div className={cn(
        "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
        "bg-gradient-to-br border",
        colorClasses[color]
      )}>
        <span className={iconColors[color]}>{icon}</span>
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </GlassCard>
  );
}

// Timeline card for agent steps
export function TimelineCard({
  step,
  title,
  description,
  status,
  isLast = false,
}: {
  step: number;
  title: string;
  description: string;
  status: "pending" | "active" | "completed" | "error";
  isLast?: boolean;
}) {
  const statusStyles = {
    pending: {
      dot: "bg-slate-700 border-slate-600",
      line: "bg-slate-700",
      text: "text-slate-500",
    },
    active: {
      dot: "bg-cyan-500 border-cyan-400 animate-pulse",
      line: "bg-gradient-to-b from-cyan-500 to-slate-700",
      text: "text-cyan-400",
    },
    completed: {
      dot: "bg-green-500 border-green-400",
      line: "bg-green-500/50",
      text: "text-green-400",
    },
    error: {
      dot: "bg-red-500 border-red-400",
      line: "bg-red-500/50",
      text: "text-red-400",
    },
  };

  const s = statusStyles[status];

  return (
    <div className="flex gap-4">
      {/* Timeline indicator */}
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold",
          s.dot
        )}>
          {status === "completed" ? "✓" : step}
        </div>
        {!isLast && (
          <div className={cn("w-0.5 flex-1 min-h-[40px]", s.line)} />
        )}
      </div>

      {/* Content */}
      <GlassCard
        className="flex-1 mb-4"
        glow={status === "active" ? "cyan" : status === "completed" ? "success" : "none"}
        padding="sm"
      >
        <h4 className={cn("font-semibold", s.text)}>{title}</h4>
        <p className="text-xs text-slate-500 mt-1">{description}</p>
      </GlassCard>
    </div>
  );
}
