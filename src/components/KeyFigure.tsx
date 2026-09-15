import type { ReactNode } from "react";

/**
 * La "cifra chiave" che apre una sezione: un numero grande e una frase che
 * dice cosa significa (15 set 2026, dai feedback dei primi visitatori —
 * vedi src/lib/sectionHighlights.ts per come si calcolano i numeri).
 *
 * Scelte di forma:
 * - il numero è in IBM Plex Mono come ogni altro numero del sito, solo più
 *   grande: stessa voce, volume più alto;
 * - il filo verticale a sinistra è cremisi (`system-mark`), lo stesso
 *   colore dell'etichetta di sezione: lega la cifra alla sua sezione;
 * - il COLORE DEL NUMERO lo decide il chiamante con `tone`: "neutral"
 *   (inchiostro) per un valore, "up"/"down" solo quando il numero è una
 *   variazione — stessa lettura ruggine/verde del resto del sito. Mai
 *   cremisi sul numero.
 * - su mobile numero e frase vanno uno sotto l'altro, da `sm` in su
 *   affiancati e allineati sulla linea di base del testo.
 */
export function KeyFigure({
  value,
  tone = "neutral",
  children,
}: {
  value: string;
  tone?: "neutral" | "up" | "down";
  /** La frase che spiega il numero. */
  children: ReactNode;
}) {
  const toneClass = {
    neutral: "text-system-ink",
    up: "text-system-signal-up",
    down: "text-system-signal-down",
  }[tone];

  return (
    <div className="mt-4 flex flex-col gap-1 border-l-2 border-system-mark pl-4 sm:flex-row sm:items-baseline sm:gap-4">
      <p
        className={`shrink-0 font-mono text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl ${toneClass}`}
      >
        {value}
      </p>
      <p className="max-w-2xl text-sm leading-relaxed text-system-ink-secondary">
        {children}
      </p>
    </div>
  );
}
