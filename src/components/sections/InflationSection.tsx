import { FreshnessBadge } from "@/components/FreshnessBadge";
import { InflationCard } from "@/components/InflationCard";
import { InflationChart } from "@/components/InflationChart";
import { KeyFigure } from "@/components/KeyFigure";
import { SectionHeading } from "@/components/SectionHeading";
import { SourceNote } from "@/components/SourceNote";
import { EmptyState, NO_DATA_YET } from "@/components/site/PageShell";
import type { FreshnessState } from "@/lib/freshness/config";
import type { InflationSummary } from "@/lib/inflation";
import type { InflationChartPoint } from "@/lib/inflationChart";
import { formatAtMonth, formatMonthYear, formatPercent } from "@/lib/format";
import {
  CALCULATED_SPLICE_2015_TO_2025,
  OFFICIAL_SPLICE_2015_TO_2025,
} from "@/lib/nicSplice";

/**
 * Contenuto della pagina /inflazione (24 set 2026), separato dalla pagina
 * che legge il database: così si mostra anche con dati finti per la
 * verifica visiva dal cloud, come ShippingSection.
 */
export function InflationSection({
  number,
  series,
  headline,
  latestMonth,
  freshness,
  checkedAt,
  chartPoints,
}: {
  number: string;
  series: InflationSummary[];
  /** L'indice generale, per la cifra chiave. */
  headline: InflationSummary | null;
  latestMonth: string | null;
  freshness: FreshnessState | null;
  /** Ultima esecuzione del cron, per la nota "Fonte". */
  checkedAt: Date | null;
  /** Punti del grafico, uno per mese (inflationChart.ts). */
  chartPoints: InflationChartPoint[];
}) {
  // La voce che cresce di più fra le altre, da citare accanto al generale.
  const fastest = series
    .filter((s) => s.code !== "00" && s.yoyChangePct !== null)
    .sort((a, b) => (b.yoyChangePct ?? 0) - (a.yoyChangePct ?? 0))[0];

  return (
    <section>
      <SectionHeading number={number} title="Quanto aumentano i prezzi" />
      {headline?.yoyChangePct != null && (
        <KeyFigure
          value={formatPercent(headline.yoyChangePct)}
          tone={headline.yoyChangePct > 0 ? "up" : headline.yoyChangePct < 0 ? "down" : "neutral"}
        >
          Prezzi al consumo in Italia {formatAtMonth(headline.month)} rispetto
          a un anno prima (indice generale NIC di ISTAT).
          {fastest && fastest.yoyChangePct !== null && (
            <>
              {" "}
              La voce che cresce di più fra quelle seguite qui: {fastest.name},{" "}
              {formatPercent(fastest.yoyChangePct)}.
            </>
          )}
        </KeyFigure>
      )}
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-system-ink-secondary">
        Ogni mese ISTAT rileva i prezzi di un paniere di beni e servizi
        acquistati dalle famiglie e ne calcola l&apos;indice. Il numero grande
        di ogni scheda è la variazione rispetto allo stesso mese dell&apos;anno
        prima: è il dato che i comunicati chiamano &quot;inflazione&quot;.
        Sotto, l&apos;indice (la media del 2025 vale 100) dice di quanto sono
        cambiati i prezzi in un periodo più lungo.
      </p>

      {series.length === 0 ? (
        <EmptyState label={NO_DATA_YET} />
      ) : (
        <>
          {latestMonth && (
            <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-system-ink-muted">
              Ultimo mese pubblicato: {formatMonthYear(latestMonth)}
              {freshness && <FreshnessBadge state={freshness} />}
            </p>
          )}
          {/* Quattro schede in riga da `lg`, due per riga da `sm`. */}
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {series.map((s) => (
              <InflationCard key={s.code} data={s} />
            ))}
          </div>
        </>
      )}
      {chartPoints.length > 0 && (
        <div className="mt-6">
          <InflationChart points={chartPoints} />
        </div>
      )}

      <SourceNote
        sources={["istat"]}
        checks={[{ label: "ISTAT", cadence: "ogni giorno", checkedAt }]}
      >
        Fonte: ISTAT, indice dei prezzi al consumo per l&apos;intera collettività
        (NIC), mensile · variazioni annue come pubblicate da ISTAT · indice dal
        2016 riportato alla base 2025 (2025 = 100): indice generale e
        alimentari con i coefficienti di raccordo di ISTAT (
        {OFFICIAL_SPLICE_2015_TO_2025["00"].toLocaleString("it-IT")} e{" "}
        {OFFICIAL_SPLICE_2015_TO_2025["01"].toLocaleString("it-IT")}), carrello
        della spesa e beni energetici con coefficienti calcolati da Mercuriale
        con lo stesso metodo (
        {CALCULATED_SPLICE_2015_TO_2025.FOODHPC?.toLocaleString("it-IT") ?? "—"} e{" "}
        {CALCULATED_SPLICE_2015_TO_2025.ENRGY?.toLocaleString("it-IT") ?? "—"}),
        perché ISTAT non li pubblica per questi aggregati
      </SourceNote>
    </section>
  );
}
