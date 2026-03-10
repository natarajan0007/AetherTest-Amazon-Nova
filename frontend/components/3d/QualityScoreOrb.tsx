"use client";
import { useRef, useMemo } from "react";
import { Canvas, useFrame, ThreeElements } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Html } from "@react-three/drei";
import * as THREE from "three";

// Extend JSX for Three.js elements
declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

interface OrbProps {
  score: number;
}

function ScoreOrb({ score }: OrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);

  const color = useMemo(() => {
    if (score >= 80) return "#22C55E";
    if (score >= 50) return "#FBBF24";
    return "#EF4444";
  }, [score]);

  const particles = useMemo(() => {
    const count = 50;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const baseColor = new THREE.Color(color);

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 0.8 + Math.random() * 0.3;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      colors[i * 3] = baseColor.r;
      colors[i * 3 + 1] = baseColor.g;
      colors[i * 3 + 2] = baseColor.b;
    }

    return { positions, colors };
  }, [color]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.2;
      meshRef.current.rotation.x = Math.sin(t * 0.3) * 0.1;
    }

    if (glowRef.current) {
      const pulse = 1 + Math.sin(t * 2) * 0.1;
      glowRef.current.scale.setScalar(pulse);
    }

    if (particlesRef.current) {
      particlesRef.current.rotation.y = t * 0.1;
      particlesRef.current.rotation.x = t * 0.05;
    }
  });

  return (
    <group>
      {/* Outer glow */}
      <mesh ref={glowRef} scale={1.3}>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} />
      </mesh>

      {/* Main orb with distortion */}
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.3}>
        <mesh ref={meshRef}>
          <sphereGeometry args={[0.5, 64, 64]} />
          <MeshDistortMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.3}
            metalness={0.8}
            roughness={0.2}
            distort={0.2}
            speed={2}
          />
        </mesh>
      </Float>

      {/* Inner core */}
      <mesh scale={0.3}>
        <icosahedronGeometry args={[0.5, 2]} />
        <meshStandardMaterial
          color="white"
          emissive={color}
          emissiveIntensity={0.5}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Orbiting particles */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={particles.positions.length / 3}
            array={particles.positions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={particles.colors.length / 3}
            array={particles.colors}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.03}
          vertexColors
          transparent
          opacity={0.8}
          sizeAttenuation
        />
      </points>

      {/* Score display */}
      <Html center position={[0, 0, 0.6]}>
        <div className="flex flex-col items-center pointer-events-none">
          <span
            className="text-4xl font-black font-mono"
            style={{ color, textShadow: `0 0 20px ${color}` }}
          >
            {score.toFixed(0)}
          </span>
          <span className="text-xs text-slate-400 -mt-1">%</span>
        </div>
      </Html>
    </group>
  );
}

// Ring indicators around the orb
function ScoreRings({ score }: OrbProps) {
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);

  const color = useMemo(() => {
    if (score >= 80) return "#22C55E";
    if (score >= 50) return "#FBBF24";
    return "#EF4444";
  }, [score]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = t * 0.3;
      ring1Ref.current.rotation.y = t * 0.2;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x = -t * 0.2;
      ring2Ref.current.rotation.z = t * 0.3;
    }
  });

  return (
    <>
      <mesh ref={ring1Ref}>
        <torusGeometry args={[0.7, 0.01, 16, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>
      <mesh ref={ring2Ref}>
        <torusGeometry args={[0.85, 0.008, 16, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} />
      </mesh>
    </>
  );
}

function Scene({ score }: OrbProps) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={0.8} />
      <pointLight position={[-5, -5, 5]} intensity={0.4} color="#8B5CF6" />

      <ScoreOrb score={score} />
      <ScoreRings score={score} />
    </>
  );
}

export function QualityScoreOrb({ score, size = 200 }: { score: number; size?: number }) {
  const label = useMemo(() => {
    if (score >= 80) return { text: "Excellent", color: "text-success" };
    if (score >= 50) return { text: "Partial", color: "text-warning" };
    return { text: "Needs Work", color: "text-error" };
  }, [score]);

  return (
    <div className="flex flex-col items-center">
      <div
        style={{ width: size, height: size }}
        className="rounded-full overflow-hidden"
      >
        <Canvas
          camera={{ position: [0, 0, 2.5], fov: 50 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
        >
          <Scene score={score} />
        </Canvas>
      </div>
      <p className={`text-xs font-semibold mt-2 ${label.color}`}>
        {label.text} Coverage
      </p>
    </div>
  );
}

// Compact inline version
export function QualityScoreOrbInline({ score }: { score: number }) {
  const color = useMemo(() => {
    if (score >= 80) return "#22C55E";
    if (score >= 50) return "#FBBF24";
    return "#EF4444";
  }, [score]);

  return (
    <div className="inline-flex items-center gap-2">
      <div className="w-10 h-10 rounded-full overflow-hidden">
        <Canvas
          camera={{ position: [0, 0, 2], fov: 50 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.5} />
          <Float speed={3} rotationIntensity={0.5}>
            <mesh>
              <sphereGeometry args={[0.4, 32, 32]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.3}
              />
            </mesh>
          </Float>
        </Canvas>
      </div>
      <span
        className="text-lg font-bold font-mono"
        style={{ color }}
      >
        {score.toFixed(0)}%
      </span>
    </div>
  );
}
