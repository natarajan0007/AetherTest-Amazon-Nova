"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export function PainPointTransformation() {
  const [sliderValue, setSliderValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);

  // Auto-animate on mount
  useEffect(() => {
    if (!isAnimating) return;

    const interval = setInterval(() => {
      setSliderValue((prev) => {
        if (prev >= 100) {
          setTimeout(() => setSliderValue(0), 2000);
          return 100;
        }
        return prev + 2;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isAnimating]);

  const showManual = sliderValue < 80;
  const showAI = sliderValue > 20;
  const transitionProgress = Math.min(100, Math.max(0, (sliderValue - 20) / 60 * 100));

  return (
    <div className="relative w-full">
      {/* Main visualization */}
      <div className="h-[350px] w-full rounded-2xl overflow-hidden bg-gradient-to-b from-slate-900/80 to-slate-900/40 border border-slate-700/30 relative">
        
        {/* Manual Testing Side */}
        <motion.div
          animate={{ 
            opacity: showManual ? 1 : 0.2,
            x: showManual ? 0 : -50,
            scale: showManual ? 1 : 0.9
          }}
          className="absolute left-8 top-1/2 -translate-y-1/2 flex flex-col items-center"
        >
          {/* Frustrated developer */}
          <motion.div
            animate={showManual ? { x: [-2, 2, -2], rotate: [-1, 1, -1] } : {}}
            transition={{ duration: 0.3, repeat: Infinity }}
            className="relative"
          >
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20 border-2 border-red-500/40 flex items-center justify-center">
              <span className="text-5xl">😤</span>
            </div>
            
            {/* Error particles */}
            {showManual && Array.from({ length: 6 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full bg-red-500"
                animate={{
                  x: [0, Math.cos(i * 60 * Math.PI / 180) * 50],
                  y: [0, Math.sin(i * 60 * Math.PI / 180) * 50],
                  opacity: [0.8, 0],
                  scale: [1, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
                style={{
                  left: "50%",
                  top: "50%",
                }}
              />
            ))}
          </motion.div>

          <span className="mt-4 text-red-400 font-semibold text-sm">Manual Testing</span>

          {/* Error messages */}
          <div className="mt-4 space-y-2">
            {["NoSuchElement", "StaleReference", "Timeout"].map((err, i) => (
              <motion.div
                key={err}
                animate={{ opacity: showManual ? [0.5, 1, 0.5] : 0.2 }}
                transition={{ duration: 2, delay: i * 0.3, repeat: Infinity }}
                className="bg-red-500/10 border border-red-500/30 rounded px-2 py-1 text-[10px] font-mono text-red-400"
              >
                ✗ {err}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Transformation beam */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            animate={{ opacity: transitionProgress / 100 }}
            className="relative"
          >
            {/* Energy beam */}
            <div className="w-32 h-1 bg-gradient-to-r from-red-500 via-yellow-500 to-cyan-500 rounded-full" />
            
            {/* Particles */}
            {Array.from({ length: 5 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-cyan-400"
                animate={{ x: [-64, 64] }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: "linear",
                }}
              />
            ))}
          </motion.div>
        </div>

        {/* AI Agent Side */}
        <motion.div
          animate={{ 
            opacity: showAI ? 1 : 0.2,
            x: showAI ? 0 : 50,
            scale: showAI ? 1 : 0.9
          }}
          className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col items-center"
        >
          {/* AI Agent */}
          <motion.div
            animate={showAI ? { y: [-5, 5, -5] } : {}}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="relative"
          >
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border-2 border-cyan-500/40 flex items-center justify-center">
              <span className="text-5xl">🤖</span>
            </div>
            
            {/* Success particles */}
            {showAI && (
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-cyan-500/50"
                animate={{ scale: [1, 1.3], opacity: [0.5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </motion.div>

          <span className="mt-4 text-cyan-400 font-semibold text-sm">AI-Powered</span>

          {/* Success messages */}
          <div className="mt-4 space-y-2">
            {["Auto-heal", "Self-adapt", "Zero scripts"].map((msg, i) => (
              <motion.div
                key={msg}
                animate={{ opacity: showAI ? 1 : 0.2 }}
                transition={{ delay: i * 0.1 }}
                className="bg-green-500/10 border border-green-500/30 rounded px-2 py-1 text-[10px] font-mono text-green-400"
              >
                ✓ {msg}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Labels */}
        <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
          <motion.div
            animate={{ opacity: showManual ? 1 : 0.3 }}
            className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5"
          >
            <span className="text-red-400 text-xs font-bold">😤 Manual Testing</span>
          </motion.div>
          <motion.div
            animate={{ opacity: showAI ? 1 : 0.3 }}
            className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-1.5"
          >
            <span className="text-cyan-400 text-xs font-bold">🤖 AI-Powered</span>
          </motion.div>
        </div>
      </div>

      {/* Interactive slider */}
      <div className="mt-4 px-4">
        <input
          type="range"
          min="0"
          max="100"
          value={sliderValue}
          onChange={(e) => {
            setIsAnimating(false);
            setSliderValue(Number(e.target.value));
          }}
          className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-gradient-to-r
            [&::-webkit-slider-thumb]:from-cyan-400
            [&::-webkit-slider-thumb]:to-violet-500
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(56,189,248,0.5)]"
        />
        <div className="flex justify-between mt-2 text-[10px] text-slate-500">
          <span>Hours of scripting</span>
          <span>Drag to transform →</span>
          <span>90 seconds with AI</span>
        </div>
      </div>

      {/* Stats comparison */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <motion.div
          animate={{ opacity: showManual ? 1 : 0.5, scale: showManual ? 1 : 0.95 }}
          className="bg-red-500/5 border border-red-500/20 rounded-xl p-4"
        >
          <h4 className="text-red-400 text-xs font-bold mb-2">Manual Pain Points</h4>
          <ul className="space-y-1 text-[11px] text-red-300/70">
            <li>✗ 4+ hours per test suite</li>
            <li>✗ Constant selector maintenance</li>
            <li>✗ Flaky tests on every deploy</li>
            <li>✗ No self-healing capability</li>
          </ul>
        </motion.div>
        <motion.div
          animate={{ opacity: showAI ? 1 : 0.5, scale: showAI ? 1 : 0.95 }}
          className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4"
        >
          <h4 className="text-cyan-400 text-xs font-bold mb-2">AI Advantages</h4>
          <ul className="space-y-1 text-[11px] text-cyan-300/70">
            <li>✓ 90 seconds end-to-end</li>
            <li>✓ Zero selectors needed</li>
            <li>✓ Self-adapting to UI changes</li>
            <li>✓ Vision-based validation</li>
          </ul>
        </motion.div>
      </div>
    </div>
  );
}
