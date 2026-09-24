import type { InflationSummary } from "@/lib/inflation";
import { formatDecimal, formatMonthYear, formatPercent } from "@/lib/format";

/**
 * Scheda di una serie dell'inflazione (24 set 2026, pagina /inflazione).
 * Server Component senza stato: riceve la sintesi già calcolata
 * (src/lib/inflation.ts).
 *
 * Scelte:
 * - il numero grande è la VARIAZIONE ANNUA dell'ultimo mese, come la
 *   pubblica ISTAT: è il numero dei comunicati ("inflazione al 3,3%");
 * - colore col segno, come ogni variazione del sito: ruggine se i prezzi
 *   salgono, verde se scendono. Qui la lettura coincide con quella
 *   intuitiva (prezzi in salita = notizia peggiore per chi compra);
 * - sotto, piccolo, l'INDICE nella base 2025 e la variazione dal primo
 *   mese dello storico: servono ai confronti nel tempo, non sono la
 *   notizia. Se il raccordo non c'è, quella riga non compare.
 */
export function InflationCard({ data }: { data: InflationSummary }) {
  const { name, detail, month, yoyChangePct, index, since, sinceChangePct } = data;
  const tone =
    yoyChangePct === null || yoyChangePct === 0
      ? "text-system-ink"
      : yoyChangePct > 0
        ? "text-system-signal-up"
        : "text-system-signal-down";

  return (
    <article className="flex flex-col rounded-lg border border-system-border bg-system-surface p-5">
      <h3 className="text-base font-semibold">{name}</h3>
      {/* Due righe riservate da `sm`: la descrizione del carrello va a capo e
          senza questo spingerebbe il suo numero più in basso degli altri. */}
      <p className="mt-0.5 text-xs leading-snug text-system-ink-muted sm:min-h-[2lh]">{detail}</p>

      {yoyChangePct === null ? (
        <p className="mt-4 text-sm leading-relaxed text-system-ink-secondary">
          Variazione annua non pubblicata per {formatMonthYear(month)}.
        </p>
      ) : (
        <>
          <p
            className={`mt-4 font-mono text-4xl font-semibold tabular-nums tracking-tight ${tone}`}
          >
            {formatPercent(yoyChangePct)}
          </p>
          <p className="mt-1 text-sm text-system-ink-secondary">
            {formatMonthYear(month)} rispetto a {formatMonthYear(yearBefore(month))}
          </p>
        </>
      )}

      {index !== null && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-system-border-subtle pt-3 text-xs">
          <dt className="text-system-ink-muted">Indice (2025 = 100)</dt>
          <dd className="text-right font-mono tabular-nums text-system-ink">
            {formatDecimal(index)}
          </dd>
          {sinceChangePct !== null && (
            <>
              <dt className="text-system-ink-muted">Da {formatMonthYear(since)}</dt>
              <dd className="text-right font-mono tabular-nums text-system-ink">
                {formatPercent(sinceChangePct)}
              </dd>
            </>
          )}
        </dl>
      )}
    </article>
  );
}

/** "2026-08" → "2025-08". */
function yearBefore(month: string): string {
  const [y, m] = month.split("-");
  return `${Number(y) - 1}-${m}`;
}
