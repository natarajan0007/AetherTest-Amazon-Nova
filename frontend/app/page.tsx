"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import {
  Zap, ChevronRight, Activity, CheckCircle2, XCircle,
  Clock, Film, Bot, Rocket, Cpu, Eye, Globe, FileCheck,
  ArrowRight, Sparkles, MousePointer,
} from "lucide-react";
import Link from "next/link";
import { GlowButton } from "@/components/ui/GlowButton";
import { GlassCard, FeatureCard } from "@/components/ui/GlassCard";
import { FadeInView, StaggerContainer, StaggerItem, FloatAnimation } from "@/components/animations";

// Dynamic imports for 3D components (client-side only)
const NeuralNetworkBackground = dynamic(
  () => import("@/components/3d/NeuralNetworkBackground").then(mod => ({ default: mod.NeuralNetworkBackground })),
  { ssr: false, loading: () => <div className="fixed inset-0 bg-slate-950" /> }
);

const PainPointTransformation = dynamic(
  () => import("@/components/3d/PainPointTransformation").then(mod => ({ default: mod.PainPointTransformation })),
  { ssr: false, loading: () => <div className="h-[400px] bg-slate-900/50 rounded-2xl animate-pulse" /> }
);

/* ── Five Elements Data ──────────────────────────────────────────────────── */
const FIVE_ELEMENTS = [
  { emoji: "🌍", name: "Earth",  color: "#78716C", desc: "Physical form" },
  { emoji: "💧", name: "Water",  color: "#60A5FA", desc: "Fluid state" },
  { emoji: "🔥", name: "Fire",   color: "#F97316", desc: "Energy force" },
  { emoji: "💨", name: "Air",    color: "#94A3B8", desc: "Ephemeral flow" },
  { emoji: "✨", name: "Aether", color: "#38BDF8", desc: "Divine & Autonomous", highlight: true },
];

const FEATURES = [
  {
    icon: <Cpu className="w-6 h-6" />,
    title: "Claude Sonnet 4.6",
    description: "Advanced reasoning for intelligent test generation and execution",
    color: "cyan" as const,
  },
  {
    icon: <Eye className="w-6 h-6" />,
    title: "Vision AI Validation",
    description: "Visual verification using NVIDIA's multimodal AI capabilities",
    color: "violet" as const,
  },
  {
    icon: <Globe className="w-6 h-6" />,
    title: "Browser Automation",
    description: "Real browser testing with Browseruse - no selectors needed",
    color: "success" as const,
  },
  {
    icon: <FileCheck className="w-6 h-6" />,
    title: "Auto Reports",
    description: "Comprehensive test reports with quality scores and recordings",
    color: "warning" as const,
  },
];

const AGENT_PIPELINE = [
  { emoji: "🧠", name: "Orchestrator", desc: "Manages the full pipeline" },
  { emoji: "📋", name: "Analyst", desc: "Structures requirements" },
  { emoji: "🏗️", name: "Architect", desc: "Generates BDD test cases" },
  { emoji: "🌐", name: "Browser", desc: "Executes via automation" },
  { emoji: "👁️", name: "Monitor", desc: "Vision-based validation" },
  { emoji: "📊", name: "Reporter", desc: "Compiles final report" },
];

/* ════════════════════════════════════════════════════════════════════════════
   HERO SECTION
   ════════════════════════════════════════════════════════════════════════════ */
function HeroSection({ onLaunch }: { onLaunch: () => void }) {
  const [phase, setPhase] = useState(0);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 300);
    const t2 = setTimeout(() => setPhase(2), 800);
    const t3 = setTimeout(() => setPhase(3), 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const handleLaunch = () => {
    setLaunching(true);
    setTimeout(onLaunch, 600);
  };

  return (
    <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 pt-16 pb-20 text-center">
      {/* Pulsing logo */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: "backOut" }}
        className="relative mb-8"
      >
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[0, 0.9, 1.8].map((delay, i) => (
            <motion.div
              key={i}
              className="absolute w-24 h-24 rounded-full border border-cyan-500/40"
              animate={{ scale: [1, 2.5], opacity: [0.5, 0] }}
              transition={{ duration: 2.5, delay, repeat: Infinity, ease: "easeOut" }}
            />
          ))}
        </div>
        <FloatAnimation>
          <div className="relative w-24 h-24 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 flex items-center justify-center backdrop-blur-sm">
            <Activity className="w-12 h-12 text-cyan-400" />
          </div>
        </FloatAnimation>
      </motion.div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 20 }}
        transition={{ duration: 0.6 }}
        className="mb-2"
      >
        <h1 className="text-6xl md:text-7xl font-black tracking-tight">
          <span className="bg-gradient-to-r from-cyan-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(56,189,248,0.5)]">
            AETHER
          </span>
          <span className="text-white">TEST</span>
        </h1>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 1 ? 1 : 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="text-slate-400 text-sm tracking-[0.25em] uppercase font-semibold mb-10"
      >
        The Fifth Element of Software Testing
      </motion.p>

      {/* Five Elements */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 20 }}
        transition={{ duration: 0.6 }}
        className="flex flex-wrap items-end justify-center gap-3 mb-12"
      >
        {FIVE_ELEMENTS.map((el, i) => (
          <motion.div
            key={el.name}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 + 0.5 }}
            className={`flex flex-col items-center gap-2 px-4 py-3 rounded-2xl border transition-all ${
              el.highlight
                ? "border-cyan-500/50 bg-cyan-500/10 scale-110 shadow-[0_0_30px_rgba(56,189,248,0.2)]"
                : "border-slate-700/50 bg-slate-800/30 opacity-60"
            }`}
          >
            <span className={`text-2xl ${el.highlight ? "animate-bounce" : ""}`}>{el.emoji}</span>
            <span className="text-xs font-bold" style={{ color: el.color }}>{el.name}</span>
            <span className="text-[10px] text-slate-500 max-w-[70px] text-center">{el.desc}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* Etymology card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 20 }}
        transition={{ duration: 0.6 }}
      >
        <GlassCard className="max-w-lg mb-10" padding="md">
          <p className="text-slate-400 text-sm leading-relaxed">
            In ancient Greek philosophy, <span className="text-cyan-400 font-semibold">Aether (αἰθήρ)</span> was
            the pure, divine substance that filled the heavens — <em>invisible, ever-present, self-sustaining</em>.
            Just as Aether permeated the cosmos,{" "}
            <span className="text-white font-medium">AetherTest permeates your entire STLC</span> —
            silently, autonomously, zero human intervention.
          </p>
        </GlassCard>
      </motion.div>

      {/* CTA Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 20 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="flex flex-col items-center gap-4"
      >
        <GlowButton
          onClick={handleLaunch}
          disabled={launching}
          size="lg"
          icon={<Rocket className={`w-5 h-5 ${launching ? "animate-bounce" : ""}`} />}
        >
          {launching ? "Launching…" : "Get Started"}
          <ChevronRight className="w-5 h-5" />
        </GlowButton>
        <p className="text-xs text-slate-500">
          No scripts · No selectors · Just describe what to test
        </p>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-px h-8 bg-gradient-to-b from-cyan-500/50 to-transparent"
        />
        <span className="text-[10px] text-slate-600 tracking-widest uppercase">Scroll</span>
      </motion.div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   AGENT PIPELINE SECTION
   ════════════════════════════════════════════════════════════════════════════ */
function AgentPipelineSection() {
  const [hoveredAgent, setHoveredAgent] = useState<number | null>(null);

  return (
    <section className="relative z-10 px-6 py-20 max-w-6xl mx-auto">
      <FadeInView>
        <div className="text-center mb-12">
          <motion.span 
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-400 text-xs font-semibold mb-4"
            whileHover={{ scale: 1.05 }}
          >
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            >
              <Bot className="w-3.5 h-3.5" />
            </motion.div>
            Multi-Agent Architecture
          </motion.span>
          <h2 className="text-3xl font-bold text-white mb-3">
            6 Specialized AI Agents
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Each agent handles a specific phase of the testing lifecycle, working together seamlessly
          </p>
        </div>
      </FadeInView>

      <StaggerContainer className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {AGENT_PIPELINE.map((agent, i) => (
          <StaggerItem key={agent.name}>
            <motion.div
              onHoverStart={() => setHoveredAgent(i)}
              onHoverEnd={() => setHoveredAgent(null)}
              whileHover={{ scale: 1.08, y: -8 }}
              whileTap={{ scale: 0.95 }}
            >
              <GlassCard
                className="text-center h-full cursor-pointer"
                glow={i === 0 ? "cyan" : i === 5 ? "success" : "violet"}
                padding="md"
              >
                <motion.div 
                  className="text-3xl mb-2"
                  animate={hoveredAgent === i ? { 
                    scale: [1, 1.2, 1],
                    rotate: [0, 10, -10, 0]
                  } : {}}
                  transition={{ duration: 0.5 }}
                >
                  {agent.emoji}
                </motion.div>
                <h3 className="text-sm font-semibold text-white mb-1">{agent.name}</h3>
                <p className="text-[10px] text-slate-500">{agent.desc}</p>
              </GlassCard>
            </motion.div>
          </StaggerItem>
        ))}
      </StaggerContainer>

      {/* Animated connection line */}
      <div className="hidden lg:flex items-center justify-center mt-6">
        <div className="flex items-center gap-2">
          {AGENT_PIPELINE.map((_, i) => (
            <div key={i} className="flex items-center">
              <motion.div 
                className="w-3 h-3 rounded-full bg-cyan-500/30 border border-cyan-500/50"
                animate={{
                  scale: hoveredAgent === i ? 1.5 : 1,
                  backgroundColor: hoveredAgent === i ? "rgba(56,189,248,0.6)" : "rgba(56,189,248,0.3)",
                }}
                transition={{ duration: 0.3 }}
              />
              {i < AGENT_PIPELINE.length - 1 && (
                <motion.div 
                  className="w-12 h-0.5 bg-gradient-to-r from-cyan-500/50 to-violet-500/50 relative overflow-hidden"
                >
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                  />
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   TRANSFORMATION SECTION
   ════════════════════════════════════════════════════════════════════════════ */
function TransformationSection() {
  return (
    <section className="relative z-10 px-6 py-20 max-w-5xl mx-auto">
      <FadeInView>
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            The Transformation
          </span>
          <h2 className="text-3xl font-bold text-white mb-3">
            From Manual Hell to AI Bliss
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            See how AetherTest transforms the painful manual testing experience into effortless automation
          </p>
        </div>
      </FadeInView>

      <FadeInView delay={0.2}>
        <Suspense fallback={<div className="h-[400px] bg-slate-900/50 rounded-2xl animate-pulse" />}>
          <PainPointTransformation />
        </Suspense>
      </FadeInView>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   FEATURES SECTION
   ════════════════════════════════════════════════════════════════════════════ */
function FeaturesSection() {
  return (
    <section className="relative z-10 px-6 py-20 max-w-6xl mx-auto">
      <FadeInView>
        <div className="text-center mb-12">
          <motion.span 
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs font-semibold mb-4"
            whileHover={{ scale: 1.05 }}
          >
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Zap className="w-3.5 h-3.5" />
            </motion.div>
            Powered By
          </motion.span>
          <h2 className="text-3xl font-bold text-white mb-3">
            Cutting-Edge Technology
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Built on the latest AI and automation technologies for unmatched testing capabilities
          </p>
        </div>
      </FadeInView>

      <StaggerContainer className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {FEATURES.map((feature, i) => (
          <StaggerItem key={feature.title}>
            <motion.div
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <FeatureCard {...feature} />
            </motion.div>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   CTA SECTION
   ════════════════════════════════════════════════════════════════════════════ */
function CTASection() {
  return (
    <section className="relative z-10 px-6 py-20">
      <FadeInView>
        <motion.div
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 200 }}
        >
          <GlassCard className="max-w-3xl mx-auto text-center relative overflow-hidden" padding="lg" glow="cyan">
            {/* Animated background gradient */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-violet-500/10 to-cyan-500/10"
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            />
            
            <div className="relative z-10">
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <h2 className="text-2xl font-bold text-white mb-4">
                  Ready to Transform Your Testing?
                </h2>
              </motion.div>
              <p className="text-slate-400 mb-8 max-w-lg mx-auto">
                Join the future of software testing. No more flaky scripts, no more selector maintenance.
                Just describe what to test and let AI handle the rest.
              </p>
              <Link href="/launch">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <GlowButton size="lg" icon={<Rocket className="w-5 h-5" />}>
                    Launch Your First Test
                    <motion.div
                      animate={{ x: [0, 5, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      <ArrowRight className="w-5 h-5" />
                    </motion.div>
                  </GlowButton>
                </motion.div>
              </Link>
            </div>
          </GlassCard>
        </motion.div>
      </FadeInView>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════════════ */
export default function HomePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-950 overflow-x-hidden">
      {/* 3D Background */}
      <Suspense fallback={<div className="fixed inset-0 bg-slate-950" />}>
        <NeuralNetworkBackground />
      </Suspense>

      {/* Content */}
      <HeroSection onLaunch={() => router.push("/launch")} />
      <AgentPipelineSection />
      <TransformationSection />
      <FeaturesSection />
      <CTASection />

      {/* Footer */}
      <motion.footer 
        className="relative z-10 flex flex-col items-center gap-2 py-8 border-t border-slate-800/50"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        <motion.p 
          className="text-xs text-slate-600"
          whileHover={{ color: "#94A3B8" }}
        >
          Powered by Claude Sonnet 4.6 · NVIDIA Nemotron · Browseruse
        </motion.p>
        <p className="text-xs text-slate-600">
          Built with{" "}
          <motion.span 
            className="text-cyan-500"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Three.js
          </motion.span>
          {" & "}
          <motion.span 
            className="text-violet-500"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Framer Motion
          </motion.span>
        </p>
      </motion.footer>
    </div>
  );
}
