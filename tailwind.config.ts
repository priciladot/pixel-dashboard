import type { Config } from "tailwindcss";

/**
 * Paleta validada para visualización de datos (contraste y separación CVD
 * verificadas). Los tonos de estado nunca se reutilizan como color de serie.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: "#fcfcfb", page: "#f9f9f7", sunk: "#f2f1ed" },
        ink: { DEFAULT: "#0b0b0b", soft: "#52514e", muted: "#898781" },
        line: { DEFAULT: "#e1e0d9", strong: "#c3c2b7" },
        serie: {
          1: "#2a78d6", 2: "#eb6834", 3: "#1baf7a", 4: "#eda100",
          5: "#e87ba4", 6: "#008300", 7: "#4a3aa7", 8: "#e34948",
        },
        estado: {
          bueno: "#0ca30c", alerta: "#fab219", serio: "#ec835a", critico: "#d03b3b",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: { card: "10px" },
    },
  },
  plugins: [],
};
export default config;
