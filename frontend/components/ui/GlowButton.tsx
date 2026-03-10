"use client";
import { motion } from "framer-motion";
import { ReactNode, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface GlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "success" | "danger";
  size?: "sm" | "md" | "lg";
  glow?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

const variants = {
  primary: {
    bg: "bg-gradient-to-r from-cyan-500 to-violet-500",
    glow: "shadow-[0_0_20px_rgba(56,189,248,0.4)]",
    hoverGlow: "hover:shadow-[0_0_30px_rgba(56,189,248,0.6)]",
    text: "text-white",
  },
  secondary: {
    bg: "bg-slate-800/80 border border-slate-700",
    glow: "",
    hoverGlow: "hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(56,189,248,0.2)]",
    text: "text-slate-200",
  },
  success: {
    bg: "bg-gradient-to-r from-emerald-500 to-green-500",
    glow: "shadow-[0_0_20px_rgba(34,197,94,0.4)]",
    hoverGlow: "hover:shadow-[0_0_30px_rgba(34,197,94,0.6)]",
    text: "text-white",
  },
  danger: {
    bg: "bg-gradient-to-r from-red-500 to-rose-500",
    glow: "shadow-[0_0_20px_rgba(239,68,68,0.4)]",
    hoverGlow: "hover:shadow-[0_0_30px_rgba(239,68,68,0.6)]",
    text: "text-white",
  },
};

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-8 py-4 text-base",
};

export function GlowButton({
  children,
  variant = "primary",
  size = "md",
  glow = true,
  loading = false,
  icon,
  className,
  disabled,
  ...props
}: GlowButtonProps) {
  const v = variants[variant];
  const s = sizes[size];

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-300",
        v.bg,
        v.text,
        glow && v.glow,
        !disabled && v.hoverGlow,
        s,
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {/* Shimmer overlay */}
      <div className="absolute inset-0 rounded-xl overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{
            duration: 2,
            repeat: Infinity,
            repeatDelay: 3,
            ease: "linear",
          }}
        />
      </div>

      {/* Content */}
      <span className="relative z-10 flex items-center gap-2">
        {loading ? (
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
          />
        ) : icon ? (
          icon
        ) : null}
        {children}
      </span>
    </motion.button>
  );
}

// Icon-only glow button
export function GlowIconButton({
  children,
  variant = "secondary",
  size = "md",
  className,
  ...props
}: Omit<GlowButtonProps, "icon" | "loading">) {
  const v = variants[variant];
  const iconSizes = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        "relative inline-flex items-center justify-center rounded-xl transition-all duration-300",
        v.bg,
        v.text,
        v.hoverGlow,
        iconSizes[size],
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
}
