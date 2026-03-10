/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ── New semantic tokens (component rewrites) ── */
        background: "#080C14",
        charcoal:   "#E2E8F0",   // "strong text" = near-white in dark mode
        accent: {
          DEFAULT: "#38BDF8",    // Sky blue — vibrant on dark
          hover:   "#7DD3FC",
        },
        border:  "#1C2B40",
        success: "#22C55E",
        error:   "#F87171",
        warning: "#FBBF24",
        text: {
          primary:   "#CBD5E1",  // Body text (slate-300)
          secondary: "#94A3B8",  // Secondary text (slate-400)
        },

        /* ── Surface (new card bg + old surface.card / surface.border) ── */
        surface: {
          DEFAULT:     "#0D1525",  // Panel / sidebar bg
          card:        "#111E30",  // Card surfaces
          elevated:    "#16253A",  // Elevated dialogs
          border:      "#1C2B40",  // Border (old token)
          "border-hi": "#243652",  // High-contrast border
        },

        /* ── Brand (legacy pages still reference brand-*; now sky blue) ── */
        brand: {
          50:  "#e0f7ff",
          100: "#b8ecff",
          200: "#7dd8f8",
          300: "#67E8F9",
          400: "#38BDF8",
          500: "#0EA5E9",
          600: "#0284C7",
          700: "#0369A1",
          800: "#075985",
          900: "#0c4a6e",
        },
      },

      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
      },

      boxShadow: {
        subtle:       "0 1px 3px rgba(0,0,0,0.4)",
        card:         "0 4px 20px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset",
        "brand-glow": "0 0 20px rgba(56,189,248,0.2)",
        "green-glow": "0 0 16px rgba(34,197,94,0.25)",
        "accent-ring":"0 0 0 3px rgba(56,189,248,0.15)",
      },

      animation: {
        "spin-slow": "spin-slow 3s linear infinite",
      },
      keyframes: {
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to:   { transform: "rotate(360deg)" },
        },
      },
    },
  },
  plugins: [],
};
