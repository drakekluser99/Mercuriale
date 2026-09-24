import { FreshnessBadge } from "@/components/FreshnessBadge";
import type { ChokepointSummary } from "@/lib/chokepointStatus";
import { TRANSIT_STATE_LABELS, type TransitState } from "@/lib/chokepointHistory";
import type { FreshnessState } from "@/lib/freshness/config";
import { formatDecimal, formatIsoDay, formatPercent } from "@/lib/format";

/**
 * Scheda di un passaggio marittimo (24 set 2026, pagina
 * /traffico-marittimo). Server Component senza stato: riceve la
 * situazione già calcolata (src/lib/chokepointStatus.ts).
 *
 * Scelte:
 * - il numero grande è la MEDIA DEI 7 GIORNI, non l'ultimo giorno: un
 *   giorno solo oscilla troppo (Hormuz in un settembre normale va da 61 a
 *   129 navi). L'ultimo giorno resta scritto sotto, piccolo;
 * - lo stato è una PAROLA in un'etichetta, con tre colori: neutro,
 *   ocra (`signal-wait`), ruggine (`signal-up`). Mai il verde: nel sito il
 *   verde vuol dire "in discesa / sotto la media" ed è una buona notizia
 *   per un prezzo, mentre un passaggio chiuso non lo è. Lo scostamento
 *   percentuale resta in inchiostro per lo stesso motivo;
 * - la capacità stimata NON è ancora in scheda: l'unità del campo
 *   `capacity` va confermata sulla documentazione PortWatch (vedi
 *   schema.ts), e un numero senza unità certa non si pubblica.
 */

const STATE_CLASSES: Record<TransitState, string> = {
  normale: "border-system-border text-system-ink-secondary",
  ridotto: "border-system-signal-wait/40 text-system-signal-wait",
  fortemente_ridotto: "border-system-signal-up/40 text-system-signal-up",
};

export type ChokepointCardData = ChokepointSummary & {
  freshness: FreshnessState;
  ageDays: number;
};

export function ChokepointCard({ data }: { data: ChokepointCardData }) {
  const {
    name,
    mean7,
    baseline,
    baselineLabel,
    deviationPct,
    state,
    latestDate,
    latestTransits,
    windowFrom,
    freshness,
    ageDays,
  } = data;

  return (
    <article className="flex flex-col rounded-lg border border-system-border bg-system-surface p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{name}</h3>
        {state && (
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none tracking-wider ${STATE_CLASSES[state]}`}
          >
            {TRANSIT_STATE_LABELS[state]}
          </span>
        )}
      </header>

      {mean7 === null ? (
        <p className="mt-4 text-sm leading-relaxed text-system-ink-secondary">
          Media degli ultimi 7 giorni non disponibile: nella settimana fino al{" "}
          {formatIsoDay(latestDate)} manca almeno un giorno nei dati della
          fonte. Senza tutti e sette i giorni la media non si calcola.
        </p>
      ) : (
        <>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight">
              {formatDecimal(mean7)}
            </span>
            <span className="text-sm text-system-ink-secondary">navi al giorno</span>
          </p>
          <p className="mt-1 text-xs text-system-ink-muted">
            media dal {formatIsoDay(windowFrom)} al {formatIsoDay(latestDate)}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-system-border-subtle pt-4 text-sm">
            <div>
              {/* "Normale di settembre" per Hormuz, "normale" per Bab
                  el-Mandeb: stessa etichetta della cifra chiave, qui con la
                  maiuscola. */}
              <dt className="text-xs text-system-ink-muted first-letter:uppercase">
                {baselineLabel}
              </dt>
              <dd className="font-mono tabular-nums">{formatDecimal(baseline)} navi/g</dd>
            </div>
            <div>
              <dt className="text-xs text-system-ink-muted">Scostamento</dt>
              <dd className="font-mono tabular-nums">
                {deviationPct !== null ? formatPercent(deviationPct) : "—"}
              </dd>
            </div>
          </dl>
        </>
      )}

      <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-system-border-subtle pt-3 text-xs text-system-ink-muted">
        <span>
          Ultimo dato: {formatIsoDay(latestDate)} ·{" "}
          {latestTransits === 1 ? "1 nave" : `${latestTransits} navi`}
        </span>
        <FreshnessBadge
          state={freshness}
          title={`Ultimo dato ${ageDays} giorni fa. La fonte pubblica una volta a settimana i dati fino alla domenica precedente.`}
        />
      </p>
    </article>
  );
}
