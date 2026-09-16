import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Riquadro di anteprima di una pagina di sezione, per la panoramica
 * (16 set 2026). Una cifra, una frase, un link: è il "numero grande" che
 * i primi visitatori chiedevano, senza tutto il dettaglio che ora sta
 * nella pagina dedicata.
 *
 * Tutto il riquadro è cliccabile (il link copre la card), ma il testo del
 * link è il titolo: uno screen reader legge "Carburanti in Europa", non
 * "clicca qui".
 */
export function SectionPreview({
  href,
  number,
  title,
  value,
  tone = "neutral",
  children,
}: {
  href: string;
  number: string;
  title: string;
  /** La cifra; `null` se il dato non c'è ancora. */
  value: string | null;
  tone?: "neutral" | "up" | "down";
  /** Frase che spiega la cifra. */
  children: ReactNode;
}) {
  const toneClass = {
    neutral: "text-system-ink",
    up: "text-system-signal-up",
    down: "text-system-signal-down",
  }[tone];

  return (
    <article className="group relative flex flex-col rounded-lg border border-system-border bg-system-surface p-5 transition-colors hover:border-system-accent">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="rounded-sm bg-system-mark px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-system-surface"
        >
          {number}
        </span>
        <h2 className="text-base font-semibold text-system-ink">
          {/* `after:absolute after:inset-0`: il link si allarga a tutta la
              card senza annidare elementi interattivi. */}
          <Link href={href} className="after:absolute after:inset-0">
            {title}
          </Link>
        </h2>
      </div>
      <p
        className={`mt-4 font-mono text-3xl font-semibold tabular-nums tracking-tight ${toneClass}`}
      >
        {value ?? "—"}
      </p>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-system-ink-secondary">
        {children}
      </p>
      <p
        aria-hidden="true"
        className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-system-accent group-hover:underline"
      >
        Apri la sezione →
      </p>
    </article>
  );
}
