import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { SourceNote } from "@/components/SourceNote";
import {
  formatFigureValue,
  formatFigureValueShort,
  otherFigures,
  type AnnualFigure,
} from "@/lib/annualFigures";
import { formatCommodityPrice, formatDate, formatPercent, shortUnit } from "@/lib/format";
import type { PriceMover } from "@/lib/priceHistory";

/**
 * Fascia di sintesi della panoramica: "cosa è cambiato", "maggiori
 * variazioni" e "il numero del giorno", a riquadri su desktop.
 * Estratta da `app/page.tsx` il 16 set 2026 (home divisa in pagine).
 */
export function SummaryBand({
  narratives,
  topMovers,
  figure,
  euRunAt,
}: {
  narratives: { kind: string; text: string; weekOf: Date }[];
  topMovers: (PriceMover & { windowDays: number })[];
  figure: AnnualFigure;
  euRunAt: Date | null;
}) {
  // "26,7 miliardi di €" → "26,7" + "miliardi di €"; "57%" resta intero.
  const [figureHead, ...rest] = formatFigureValue(figure.value).split(" ");
  const figureTail = rest.join(" ");

  return (
        <div className="mb-12 grid gap-x-8 gap-y-12 lg:grid-cols-3">
        {narratives.length > 0 && (
          <section className="lg:col-span-2">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-system-ink-muted">✎</span>
              <h2 className="text-lg font-semibold text-system-ink">
                Cosa è cambiato questa settimana
              </h2>
            </div>
            <p className="mt-1 text-sm text-system-ink-secondary">
              Settimana del {formatDate(narratives[0].weekOf)}, rispetto
              alla precedente.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {narratives.map((n) => (
                <li
                  key={n.kind}
                  className="rounded-lg border border-system-border bg-system-surface p-4 text-sm leading-relaxed text-system-ink"
                >
                  {n.text}
                </li>
              ))}
            </ul>
            <SourceNote
              sources={["eu-commission"]}
              checks={[
                { label: "UE", cadence: "ogni giorno", checkedAt: euRunAt },
              ]}
            >
              Fonte: Bollettino Petrolifero Settimanale, Commissione Europea ·
              confronto tra le due rilevazioni settimanali più recenti
            </SourceNote>
          </section>
        )}

        {/* "Maggiori variazioni": riepilogo in cima, senza numero di
            sezione — è una sintesi dei dati delle pagine di sezione. */}
        {topMovers.length > 0 && (
          <section className="lg:col-span-2">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-system-ink-muted">◆</span>
              <h2 className="text-lg font-semibold text-system-ink">
                Maggiori variazioni
              </h2>
            </div>
            <p className="mt-1 text-sm text-system-ink-secondary">
              Scostamento tra la prima e l&apos;ultima rilevazione nella
              finestra dei grafici delle rispettive pagine — materie prime
              90 giorni, carburanti 30 giorni.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {topMovers.map((m) => {
                // In salita = ruggine, in discesa = verde: stessa lettura
                // del colore usata nella mappa ("più caro" ruggine) e
                // documentata in globals.css.
                const up = m.changePct >= 0;
                return (
                  <div
                    key={m.key}
                    className="rounded-lg border border-system-border bg-system-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-system-ink">
                          {m.label}
                        </div>
                        <div className="mt-0.5 font-mono text-xs tabular-nums text-system-ink-muted">
                          {formatCommodityPrice(m.first)} →{" "}
                          {formatCommodityPrice(m.last)} {shortUnit(m.unit)}
                        </div>
                      </div>
                      <div
                        className={`flex shrink-0 items-center gap-1 font-mono font-semibold tabular-nums ${
                          up
                            ? "text-system-signal-up"
                            : "text-system-signal-down"
                        }`}
                      >
                        {up ? (
                          <ArrowUpRight size={16} />
                        ) : (
                          <ArrowDownRight size={16} />
                        )}
                        {formatPercent(m.changePct)}
                      </div>
                    </div>
                    <div className="mt-2 font-mono text-[11px] uppercase tracking-wider text-system-ink-muted">
                      {m.windowDays} giorni · {m.points} rilevazioni
                    </div>
                  </div>
                );
              })}
            </div>
            <SourceNote sources={["alpha-vantage", "eu-commission", "eia"]}>
              Fonte: come le rispettive sezioni (Alpha Vantage per le materie
              prime, Commissione Europea ed EIA per i carburanti) · variazione
              calcolata sui soli dati disponibili nella finestra, non
              sull&apos;intero storico
            </SourceNote>
          </section>
        )}

        {/* "Il numero del giorno": Fase 3, l'ultima voce della roadmap del
            3 settembre. Diverso da ogni altra sezione della pagina — non
            un cron, non ricalcolato a ogni visita: una cifra che l'Agenzia
            delle Dogane pubblica una volta l'anno nel proprio bilancio
            dell'attività (vedi src/lib/annualFigures.ts). Dal 15 set 2026
            ruota ogni giorno fra le cifre della raccolta /numeri. L'anno
            in etichetta ("dati {figure.year}") è deliberato: se questo
            file non viene toccato per anni, l'etichetta lo dice invece di
            far sembrare il numero più fresco di quanto sia — l'errore
            isolato nell'analisi competitor (un numero statico spacciato
            per vivo). */}
        {/* Riquadro a destra. `row-start-1` lo tiene in alto anche se nel
            codice viene dopo; `row-span-2` solo quando a sinistra ci sono
            DAVVERO due sintesi — con una sola, la seconda riga sarebbe
            vuota e aggiungerebbe comunque uno spazio. */}
        <section
          className={`flex flex-col lg:col-start-3 lg:row-start-1 ${
            narratives.length > 0 && topMovers.length > 0 ? "lg:row-span-2" : ""
          }`}
        >
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-xs text-system-ink-muted">§</span>
            <h2 className="text-lg font-semibold text-system-ink">
              Il numero del giorno
            </h2>
          </div>
          {/* Il riquadro si allunga per pareggiare la colonna di sinistra
              (`flex-1`). Prima il numero stava centrato in verticale e
              sopra e sotto restava un grande vuoto (visto il 15/9 su
              desktop): ora il numero sta in alto e lo spazio sotto lo
              riempiono le altre cifre della raccolta. */}
          <div className="mt-4 flex flex-1 flex-col rounded-lg border-t-4 border-x border-b border-system-border border-t-system-mark bg-system-surface p-6">
            {/* Cifra grande e unità più piccola sulla stessa linea di base,
                come nella fascia in alto ("98,97 $/barile"). Tutto alla
                stessa dimensione, nella colonna stretta di `lg` andava a
                capo lasciando "€" da solo sull'ultima riga. */}
            <p className="flex flex-wrap items-baseline gap-x-2 font-mono font-semibold tabular-nums text-system-ink">
              <span className="text-3xl sm:text-4xl lg:text-5xl">{figureHead}</span>
              {figureTail && <span className="text-lg sm:text-xl">{figureTail}</span>}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-system-ink-secondary">
              {figure.headline}
            </p>
            {/* "Altri numeri": SOLO da `lg` (`hidden lg:block`). Su
                telefono il riquadro non è allungato e l'elenco sarebbe
                solo altra pagina da scorrere; lì basta il link. */}
            <div className="mt-6 hidden border-t border-system-border pt-4 lg:block">
              <p className="font-mono text-[11px] uppercase tracking-wider text-system-ink-muted">
                Nei prossimi giorni
              </p>
              <ul className="mt-2 divide-y divide-system-border-subtle">
                {otherFigures(figure).map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/numeri#${f.id}`}
                      className="flex items-baseline gap-3 py-2 hover:text-system-accent"
                    >
                      {/* Larghezza fissa del valore: le frasi partono
                          tutte dalla stessa colonna e si leggono in fila. */}
                      <span className="w-28 shrink-0 font-mono text-sm font-semibold tabular-nums text-system-ink">
                        {formatFigureValueShort(f.value)}
                      </span>
                      <span className="text-xs leading-snug text-system-ink-secondary">
                        {f.shortLabel} · {f.year}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {/* `mt-auto` spinge il link in fondo al riquadro su desktop. */}
            <Link
              href={`/numeri#${figure.id}`}
              className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-system-accent hover:underline lg:mt-auto lg:pt-4"
            >
              Tutti i numeri →
            </Link>
          </div>
          <SourceNote sources={[figure.sourceId]}>
            Fonte: {figure.sourceTitle} · dati {figure.year} · dato annuale,
            cambia ogni giorno la cifra mostrata, non il suo valore
          </SourceNote>
        </section>
        </div>
  );
}
