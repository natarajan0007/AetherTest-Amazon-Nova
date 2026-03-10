"use client";
import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";

// Five Elements Colors
const ELEMENTS = {
  earth: { color: "#78716C", glow: "rgba(120,113,108,0.4)", emoji: "🌍" },
  water: { color: "#60A5FA", glow: "rgba(96,165,250,0.5)", emoji: "💧" },
  fire: { color: "#F97316", glow: "rgba(249,115,22,0.5)", emoji: "🔥" },
  air: { color: "#94A3B8", glow: "rgba(148,163,184,0.4)", emoji: "💨" },
  aether: { color: "#38BDF8", glow: "rgba(56,189,248,0.6)", emoji: "✨" },
};

// Galaxy star field
function StarField() {
  const stars = useMemo(() => 
    Array.from({ length: 150 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 0.5,
      twinkleDelay: Math.random() * 5,
      twinkleDuration: 2 + Math.random() * 3,
      brightness: 0.3 + Math.random() * 0.7,
    })),
  []);

  return (
    <>
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full bg-white animate-twinkle"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: `${star.twinkleDelay}s`,
            animationDuration: `${star.twinkleDuration}s`,
            opacity: star.brightness,
          }}
        />
      ))}
    </>
  );
}

// Fire particles - rising flames
function FireParticles() {
  const [particles, setParticles] = useState<Array<{
    id: number;
    x: number;
    size: number;
    delay: number;
    duration: number;
  }>>([]);

  useEffect(() => {
    setParticles(
      Array.from({ length: 25 }, (_, i) => ({
        id: i,
        x: 5 + Math.random() * 20, // Left side
        size: 3 + Math.random() * 6,
        delay: Math.random() * 8,
        duration: 4 + Math.random() * 4,
      }))
    );
  }, []);

  return (
    <>
      {particles.map((p) => (
        <div
          key={`fire-${p.id}`}
          className="absolute rounded-full animate-fire-rise"
          style={{
            left: `${p.x}%`,
            bottom: "0",
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: `radial-gradient(circle, ${ELEMENTS.fire.color} 0%, #EF4444 50%, transparent 100%)`,
            boxShadow: `0 0 ${p.size * 2}px ${ELEMENTS.fire.glow}`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </>
  );
}

// Water particles - flowing droplets
function WaterParticles() {
  const [particles, setParticles] = useState<Array<{
    id: number;
    x: number;
    size: number;
    delay: number;
    duration: number;
  }>>([]);

  useEffect(() => {
    setParticles(
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: 75 + Math.random() * 20, // Right side
        size: 4 + Math.random() * 8,
        delay: Math.random() * 10,
        duration: 6 + Math.random() * 6,
      }))
    );
  }, []);

  return (
    <>
      {particles.map((p) => (
        <div
          key={`water-${p.id}`}
          className="absolute rounded-full animate-water-fall"
          style={{
            left: `${p.x}%`,
            top: "-20px",
            width: `${p.size}px`,
            height: `${p.size * 1.5}px`,
            background: `linear-gradient(180deg, ${ELEMENTS.water.color} 0%, #3B82F6 100%)`,
            boxShadow: `0 0 ${p.size}px ${ELEMENTS.water.glow}`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
          }}
        />
      ))}
    </>
  );
}

// Air particles - swirling wisps
function AirParticles() {
  const [particles, setParticles] = useState<Array<{
    id: number;
    startX: number;
    startY: number;
    size: number;
    delay: number;
    duration: number;
  }>>([]);

  useEffect(() => {
    setParticles(
      Array.from({ length: 15 }, (_, i) => ({
        id: i,
        startX: 30 + Math.random() * 40,
        startY: 20 + Math.random() * 60,
        size: 20 + Math.random() * 40,
        delay: Math.random() * 8,
        duration: 8 + Math.random() * 8,
      }))
    );
  }, []);

  return (
    <>
      {particles.map((p) => (
        <div
          key={`air-${p.id}`}
          className="absolute animate-air-swirl opacity-20"
          style={{
            left: `${p.startX}%`,
            top: `${p.startY}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: `radial-gradient(ellipse, ${ELEMENTS.air.glow} 0%, transparent 70%)`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            borderRadius: "40% 60% 70% 30% / 40% 50% 60% 50%",
          }}
        />
      ))}
    </>
  );
}

// Earth particles - floating rocks/crystals
function EarthParticles() {
  const [particles, setParticles] = useState<Array<{
    id: number;
    x: number;
    y: number;
    size: number;
    rotation: number;
    delay: number;
  }>>([]);

  useEffect(() => {
    setParticles(
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        x: 10 + Math.random() * 80,
        y: 60 + Math.random() * 35,
        size: 8 + Math.random() * 15,
        rotation: Math.random() * 360,
        delay: Math.random() * 4,
      }))
    );
  }, []);

  return (
    <>
      {particles.map((p) => (
        <div
          key={`earth-${p.id}`}
          className="absolute animate-earth-float"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: `linear-gradient(135deg, ${ELEMENTS.earth.color} 0%, #57534E 50%, #44403C 100%)`,
            boxShadow: `0 0 ${p.size / 2}px ${ELEMENTS.earth.glow}`,
            animationDelay: `${p.delay}s`,
            transform: `rotate(${p.rotation}deg)`,
            clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
          }}
        />
      ))}
    </>
  );
}

// Aether particles - divine glowing orbs (center, most prominent)
function AetherParticles() {
  const [particles, setParticles] = useState<Array<{
    id: number;
    x: number;
    y: number;
    size: number;
    delay: number;
    duration: number;
  }>>([]);

  useEffect(() => {
    setParticles(
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: 20 + Math.random() * 60,
        y: Math.random() * 100,
        size: 2 + Math.random() * 5,
        delay: Math.random() * 6,
        duration: 10 + Math.random() * 10,
      }))
    );
  }, []);

  return (
    <>
      {particles.map((p) => (
        <div
          key={`aether-${p.id}`}
          className="absolute rounded-full animate-aether-pulse"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: `radial-gradient(circle, #fff 0%, ${ELEMENTS.aether.color} 50%, transparent 100%)`,
            boxShadow: `0 0 ${p.size * 3}px ${ELEMENTS.aether.glow}, 0 0 ${p.size * 6}px ${ELEMENTS.aether.glow}`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </>
  );
}

// Nebula clouds
function NebulaClouds() {
  return (
    <>
      {/* Fire nebula - bottom left */}
      <motion.div
        className="absolute -bottom-20 -left-20 w-[500px] h-[400px] rounded-full opacity-20 blur-3xl"
        style={{ 
          background: `radial-gradient(ellipse, ${ELEMENTS.fire.glow} 0%, rgba(239,68,68,0.2) 40%, transparent 70%)` 
        }}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.15, 0.25, 0.15],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      
      {/* Water nebula - top right */}
      <motion.div
        className="absolute -top-20 -right-20 w-[450px] h-[450px] rounded-full opacity-20 blur-3xl"
        style={{ 
          background: `radial-gradient(ellipse, ${ELEMENTS.water.glow} 0%, rgba(59,130,246,0.2) 40%, transparent 70%)` 
        }}
        animate={{
          scale: [1.1, 1, 1.1],
          opacity: [0.2, 0.3, 0.2],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      
      {/* Aether nebula - center (most prominent) */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-15 blur-3xl"
        style={{ 
          background: `radial-gradient(circle, ${ELEMENTS.aether.glow} 0%, rgba(139,92,246,0.15) 50%, transparent 70%)` 
        }}
        animate={{
          scale: [1, 1.15, 1],
          rotate: [0, 180, 360],
        }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
      />
      
      {/* Air nebula - top left */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-[350px] h-[350px] rounded-full opacity-10 blur-3xl"
        style={{ 
          background: `radial-gradient(ellipse, ${ELEMENTS.air.glow} 0%, transparent 60%)` 
        }}
        animate={{
          x: [0, 30, 0],
          y: [0, -20, 0],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      
      {/* Earth nebula - bottom right */}
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full opacity-15 blur-3xl"
        style={{ 
          background: `radial-gradient(ellipse, ${ELEMENTS.earth.glow} 0%, rgba(87,83,78,0.2) 50%, transparent 70%)` 
        }}
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

// Shooting stars
function ShootingStars() {
  const [stars, setStars] = useState<Array<{
    id: number;
    startX: number;
    startY: number;
    delay: number;
  }>>([]);

  useEffect(() => {
    setStars(
      Array.from({ length: 5 }, (_, i) => ({
        id: i,
        startX: 20 + Math.random() * 60,
        startY: Math.random() * 40,
        delay: i * 4 + Math.random() * 3,
      }))
    );
  }, []);

  return (
    <>
      {stars.map((star) => (
        <div
          key={`shooting-${star.id}`}
          className="absolute w-1 h-1 bg-white rounded-full animate-shooting-star"
          style={{
            left: `${star.startX}%`,
            top: `${star.startY}%`,
            animationDelay: `${star.delay}s`,
            boxShadow: `
              0 0 4px #fff,
              0 0 8px ${ELEMENTS.aether.color},
              -20px 0 15px ${ELEMENTS.aether.glow},
              -40px 0 10px rgba(56,189,248,0.3),
              -60px 0 5px rgba(56,189,248,0.1)
            `,
          }}
        />
      ))}
    </>
  );
}

// Main component
export function NeuralNetworkBackground() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="fixed inset-0 -z-10 bg-slate-950" />;
  }

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Galaxy star field */}
      <StarField />
      
      {/* Nebula clouds for each element */}
      <NebulaClouds />
      
      {/* Element particles */}
      <FireParticles />
      <WaterParticles />
      <AirParticles />
      <EarthParticles />
      <AetherParticles />
      
      {/* Shooting stars */}
      <ShootingStars />
      
      {/* Central Aether glow */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, rgba(56,189,248,0.3) 0%, transparent 70%)`,
        }}
        animate={{
          scale: [1, 1.5, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/30 to-slate-950/80 pointer-events-none" />

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.5); }
        }
        @keyframes fire-rise {
          0% { 
            transform: translateY(0) scale(1); 
            opacity: 0; 
          }
          10% { opacity: 0.8; }
          50% { 
            transform: translateY(-40vh) scale(0.8); 
            opacity: 0.6; 
          }
          100% { 
            transform: translateY(-80vh) scale(0.3); 
            opacity: 0; 
          }
        }
        @keyframes water-fall {
          0% { 
            transform: translateY(0) translateX(0); 
            opacity: 0; 
          }
          10% { opacity: 0.7; }
          100% { 
            transform: translateY(110vh) translateX(-30px); 
            opacity: 0; 
          }
        }
        @keyframes air-swirl {
          0% { 
            transform: translateX(0) translateY(0) rotate(0deg) scale(1); 
          }
          25% { 
            transform: translateX(50px) translateY(-30px) rotate(90deg) scale(1.1); 
          }
          50% { 
            transform: translateX(0) translateY(-60px) rotate(180deg) scale(0.9); 
          }
          75% { 
            transform: translateX(-50px) translateY(-30px) rotate(270deg) scale(1.1); 
          }
          100% { 
            transform: translateX(0) translateY(0) rotate(360deg) scale(1); 
          }
        }
        @keyframes earth-float {
          0%, 100% { 
            transform: translateY(0) rotate(var(--rotation, 0deg)); 
          }
          50% { 
            transform: translateY(-15px) rotate(calc(var(--rotation, 0deg) + 10deg)); 
          }
        }
        @keyframes aether-pulse {
          0%, 100% { 
            transform: scale(1); 
            opacity: 0.4; 
          }
          50% { 
            transform: scale(1.5); 
            opacity: 0.8; 
          }
        }
        @keyframes shooting-star {
          0% { 
            transform: translateX(0) translateY(0); 
            opacity: 0; 
          }
          5% { opacity: 1; }
          100% { 
            transform: translateX(300px) translateY(200px); 
            opacity: 0; 
          }
        }
        .animate-twinkle {
          animation: twinkle ease-in-out infinite;
        }
        .animate-fire-rise {
          animation: fire-rise ease-out infinite;
        }
        .animate-water-fall {
          animation: water-fall linear infinite;
        }
        .animate-air-swirl {
          animation: air-swirl ease-in-out infinite;
        }
        .animate-earth-float {
          animation: earth-float 4s ease-in-out infinite;
        }
        .animate-aether-pulse {
          animation: aether-pulse ease-in-out infinite;
        }
        .animate-shooting-star {
          animation: shooting-star 3s ease-out infinite;
        }
      `}</style>
    </div>
  );
}
