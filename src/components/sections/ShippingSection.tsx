import Link from "next/link";
import { ChokepointCard, type ChokepointCardData } from "@/components/ChokepointCard";
import { ChokepointMap } from "@/components/ChokepointMap";
import { KeyFigure } from "@/components/KeyFigure";
import { ShippingHistoryChart } from "@/components/ShippingHistoryChart";
import { SectionHeading } from "@/components/SectionHeading";
import { SourceNote } from "@/components/SourceNote";
import { EmptyState, NO_DATA_YET } from "@/components/site/PageShell";
import { CHOKEPOINT_BASELINES, STRONGLY_REDUCED_BELOW_PCT } from "@/lib/chokepointHistory";
import type { ChokepointSummary } from "@/lib/chokepointStatus";
import { formatDecimal, formatIsoDay, formatPercent } from "@/lib/format";
import type { HistoryWindowKey } from "@/lib/historyWindows";
import type { ShippingChartSeries } from "@/lib/shippingChart";

/**
 * Contenuto della pagina /traffico-marittimo (24 set 2026), separato dalla
 * pagina che legge il database: così si può mostrare anche con dati finti
 * per una verifica visiva, dal cloud dove il database non si raggiunge.
 */
export function ShippingSection({
  number,
  chokepoints,
  headline,
  checkedAt,
  chart,
  chartWindow,
}: {
  number: string;
  chokepoints: ChokepointCardData[];
  headline: ChokepointSummary | null;
  /** Ultima esecuzione del cron, per la nota "Fonte". */
  checkedAt: Date | null;
  /** Serie del grafico transiti + Brent per il periodo iniziale. */
  chart: ShippingChartSeries[];
  chartWindow: HistoryWindowKey;
}) {
  return (
    <section>
      <SectionHeading number={number} title="Situazione nei passaggi obbligati" />
      {headline && headline.mean7 !== null && headline.deviationPct !== null && (
        // Tono neutro: il verde "in discesa" qui direbbe una buona notizia.
        <KeyFigure value={formatPercent(headline.deviationPct, 0)}>
          {headline.name}: {formatDecimal(headline.mean7)} navi al giorno in
          media nei 7 giorni fino al {formatIsoDay(headline.latestDate)},
          contro le {formatDecimal(headline.baseline)} del {headline.baselineLabel}.
        </KeyFigure>
      )}
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-system-ink-secondary">
        Da questi due stretti passa una parte importante del petrolio e delle
        merci fra Asia, Golfo ed Europa. Ogni scheda confronta le navi
        transitate negli ultimi 7 giorni con il traffico di un periodo
        normale, fissato sui dati dal 2019: lo stato dice quanto la
        settimana si allontana da quello che succede di solito.
      </p>
      {chokepoints.length === 0 ? (
        <EmptyState label={NO_DATA_YET} />
      ) : (
        <>
          {/* Prima DOVE (la mappa), poi i numeri (le schede). */}
          <div className="mt-4">
            <ChokepointMap chokepoints={chokepoints} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {chokepoints.map((c) => (
              <ChokepointCard key={c.key} data={c} />
            ))}
          </div>
        </>
      )}
      {chart.length > 0 && (
        <div className="mt-6">
          <ShippingHistoryChart series={chart} initialWindow={chartWindow} />
        </div>
      )}
      <SourceNote
        sources={["imf-portwatch", "alpha-vantage"]}
        checks={[{ label: "PortWatch", cadence: "ogni giorno", checkedAt }]}
      >
        Fonte: IMF PortWatch (Fondo Monetario Internazionale), transiti
        giornalieri stimati dai segnali AIS delle navi · la fonte pubblica una
        volta a settimana, di norma il martedì, i giorni fino alla domenica
        precedente · stati: &quot;ridotto&quot; sotto l&apos;oscillazione
        normale della media a 7 giorni (Hormuz{" "}
        {formatPercent(CHOKEPOINT_BASELINES.hormuz.reducedBelowPct)}, Bab
        el-Mandeb {formatPercent(CHOKEPOINT_BASELINES.bab_el_mandeb.reducedBelowPct)}),
        &quot;fortemente ridotto&quot; sotto{" "}
        {formatPercent(STRONGLY_REDUCED_BELOW_PCT, 0)} · Brent: Alpha
        Vantage (dati EIA), prezzi giornalieri pubblicati una volta a settimana
        · confini: Natural Earth (dominio pubblico) ·{" "}
        <Link
          href="/metodologia#traffico-marittimo"
          className="text-system-accent underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          come sono calcolati normale e stati
        </Link>
      </SourceNote>
    </section>
  );
}
