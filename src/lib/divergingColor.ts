/**
 * Scala di colore DIVERGENTE condivisa dalle mappe (15 set 2026).
 *
 * Prima viveva dentro EuropeFuelMap.tsx. Con la mappa delle province
 * italiane le mappe sono due, e devono parlare la stessa lingua: verde =
 * sotto la media, ruggine = sopra, neutro = alla media. Due copie della
 * formula sarebbero due occasioni di farle divergere — per questo un
 * modulo solo, puro (niente React), testato.
 *
 * Gli hex sono quelli dei token `system-*` di globals.css: il `fill` degli
 * SVG di react-simple-maps vuole un colore risolto, non una variabile CSS.
 */

export const NEUTRAL_HEX = "#e4dccb"; // system-border — centro della scala
export const BELOW_HEX = "#3f6f4a"; // system-signal-down — sotto la media
export const ABOVE_HEX = "#b0461f"; // system-signal-up — sopra la media
export const INK_HEX = "#191509"; // system-ink — bordo in evidenza
/**
 * "Nessun dato". Volutamente DIVERSO da NEUTRAL_HEX: altrimenti "manca il
 * dato" ed "esattamente alla media" sarebbero indistinguibili.
 */
export const NO_DATA_FILL = "#f0ebe0"; // system-border-subtle

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/** Colore a metà strada fra due hex: `t` = 0 → primo, 1 → secondo. */
export function interpolateColor(fromHex: string, toHex: string, t: number): string {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const r = Math.round(from.r + (to.r - from.r) * t);
  const g = Math.round(from.g + (to.g - from.g) * t);
  const b = Math.round(from.b + (to.b - from.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Colore di un valore sulla scala centrata sulla media.
 *
 * `span` è l'ampiezza del range (massimo − minimo). L'intensità è
 * `|scarto| * 2` limitata a 1: un valore a metà strada fra la media e un
 * estremo arriva già a colore pieno. Il fattore 2 è la manopola da girare
 * se la scala sembra accendersi troppo in fretta o troppo piano.
 */
export function divergingColor(value: number, average: number, span: number): string {
  if (span <= 0) return NEUTRAL_HEX;
  const scarto = (value - average) / span;
  const intensita = Math.min(Math.abs(scarto) * 2, 1);
  return scarto < 0
    ? interpolateColor(NEUTRAL_HEX, BELOW_HEX, intensita)
    : interpolateColor(NEUTRAL_HEX, ABOVE_HEX, intensita);
}
