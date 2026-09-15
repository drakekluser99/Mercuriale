import Link from "next/link";
import { ProvenanceStamp } from "@/components/ProvenanceStamp";
import { SourceNote } from "@/components/SourceNote";
import { ANNUAL_FIGURES, formatFigureValue } from "@/lib/annualFigures";

export const metadata = {
  title: "Numeri — Mercuriale",
  description:
    "Cifre annuali su energia, carburanti e imposte, ciascuna con fonte istituzionale, anno di riferimento e link al documento originale.",
};

/**
 * /numeri — la raccolta dei "fatti-cifra" (blocco D, 15 set 2026).
 *
 * Pagina STATICA: niente database, i dati sono in src/lib/annualFigures.ts.
 * Senza `force-dynamic` Next.js la genera una volta sola durante la build
 * e la serve già pronta: è la scelta giusta per contenuti che cambiano
 * quando cambia il codice, non a ogni visita.
 *
 * Ogni cifra ha un `id` usato come ancora (`/numeri#dipendenza-energetica-ue`):
 * il link "Tutti i numeri" della home porta direttamente alla cifra del
 * giorno, e chi scrive può citare la singola voce.
 */
export default function Numeri() {
  return (
    <div className="min-h-screen bg-system-bg text-system-ink">
      <header className="border-b border-system-border bg-system-surface">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <Link
            href="/"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-system-accent hover:underline"
          >
            ← Torna alla dashboard
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <ProvenanceStamp size={20} className="text-system-accent" />
            Numeri
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-system-ink-secondary">
            Cifre che le fonti pubbliche aggiornano una volta l&apos;anno. In
            home ne compare una al giorno; qui ci sono tutte, ciascuna con
            l&apos;anno a cui si riferisce e il link al documento da cui è
            presa. I valori sono copiati dalla fonte, non ricalcolati.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-6 py-10">
        {ANNUAL_FIGURES.map((f, i) => (
          // `scroll-mt-8`: arrivando da un'ancora, la cifra non finisce
          // attaccata al bordo superiore della finestra.
          <section key={f.id} id={f.id} className="scroll-mt-8">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-system-ink-muted">
                {String(i + 1).padStart(2, "0")} /
              </span>
              <p className="font-mono text-xs uppercase tracking-wider text-system-ink-muted">
                dati {f.year}
              </p>
            </div>
            <div className="mt-3 border-l-2 border-system-mark pl-4">
              <p className="font-mono text-3xl font-semibold tabular-nums text-system-ink sm:text-4xl">
                {formatFigureValue(f.value)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-system-ink-secondary">
                {f.headline}
              </p>
            </div>
            <SourceNote sources={[f.sourceId]}>
              Fonte:{" "}
              <a
                href={f.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-system-accent hover:underline"
              >
                {f.sourceTitle}
              </a>{" "}
              · pubblicato {formatMonth(f.publishedIn)}
            </SourceNote>
          </section>
        ))}
      </main>
    </div>
  );
}

/** "2026-03" → "marzo 2026". */
function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}
