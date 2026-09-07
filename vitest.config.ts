import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Config minimale: serve solo a far risolvere a vitest l'alias "@/..."
 * (che punta a "src/*") esattamente come fa Next.js tramite tsconfig.json —
 * il plugin tsconfigPaths legge lo stesso file, invece di duplicare qui a
 * mano il mapping "@/* -> src/*" e rischiare che i due si disallineino.
 *
 * Nessun ambiente browser/jsdom configurato: le funzioni testate (formato
 * numeri, calcolo freschezza, statistiche carburante) sono pure — prendono
 * input, restituiscono output, non toccano il DOM. Il default "node" di
 * vitest basta e parte più veloce di jsdom.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
