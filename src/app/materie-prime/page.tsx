import type { Metadata } from "next";
import { DownloadDataButtons } from "@/components/DownloadDataButtons";
import { FreshnessBadge } from "@/components/FreshnessBadge";
import { KeyFigure } from "@/components/KeyFigure";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { SectionHeading } from "@/components/SectionHeading";
import { SourceNote } from "@/components/SourceNote";
import { EmptyState, NO_DATA_YET, PageShell } from "@/components/site/PageShell";
import { localizedCommodityName } from "@/lib/commodityNames";
import {
  CATEGORY_LABELS,
  COMMODITY_EXPORT_COLUMNS,
  getNow,
  loadCommodities,
} from "@/lib/dashboard";
import { formatCommodityPrice, formatPercent, shortUnit } from "@/lib/format";
import { sectionPage } from "@/lib/siteNav";

export const dynamic = "force-dynamic";

const PAGE = sectionPage("/materie-prime");

export const metadata: Metadata = {
  title: `${PAGE.title} — Mercuriale`,
  description:
    "Petrolio, gas, metalli e materie prime agricole: ultimo prezzo, variazioni e storico fino a 10 anni, con fonte e freschezza di ogni dato.",
};

/** /materie-prime — ex sezione 03 della home (16 set 2026). */
export default async function MateriePrimePage() {
  const { rows, exportRows, series, topMover } = await loadCommodities();
  const now = getNow();

  return (
    <PageShell
      title={PAGE.title}
      intro="Petrolio, gas naturale, metalli e materie prime agricole: gli ultimi prezzi pubblicati e il loro andamento, fino a dieci anni indietro."
      consultedOn={now}
    >
      <section>
        <SectionHeading number={PAGE.number} title="Ultimi prezzi e andamento">
          {rows.length > 0 && (
            <DownloadDataButtons
              filenameBase="mercuriale-materie-prime"
              columns={COMMODITY_EXPORT_COLUMNS}
              rows={exportRows}
            />
          )}
        </SectionHeading>
        {topMover && (
          <KeyFigure
            value={formatPercent(topMover.changePct)}
            tone={topMover.changePct >= 0 ? "up" : "down"}
          >
            {topMover.label} negli ultimi 90 giorni (
            {formatCommodityPrice(topMover.first)} →{" "}
            {formatCommodityPrice(topMover.last)} {shortUnit(topMover.unit)}): la
            variazione più ampia fra le materie prime seguite.
          </KeyFigure>
        )}
        {rows.length === 0 ? (
          <EmptyState label={NO_DATA_YET} />
        ) : (
          // Tabella e grafico affiancati sugli schermi larghi.
          <div className="mt-4 grid gap-6 xl:grid-cols-2">
            <div className="min-w-0 overflow-x-auto rounded-lg border border-system-border bg-system-surface xl:self-start">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-system-border text-left font-mono text-xs uppercase tracking-wider text-system-ink-secondary">
                    <th className="px-4 py-3 font-medium">Materia prima</th>
                    <th className="px-4 py-3 font-medium">Categoria</th>
                    <th className="px-4 py-3 text-right font-medium">Prezzo</th>
                    <th className="px-4 py-3 text-right font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr
                      key={c.symbol}
                      className="border-b border-system-border-subtle transition-colors last:border-0 hover:bg-system-bg"
                    >
                      <td className="px-4 py-3">
                        {/* Nome italiano solo in pagina; database, export e
                            API restano con quello della fonte. */}
                        <div className="font-medium">
                          {localizedCommodityName(c.symbol, c.name)}
                        </div>
                        <div className="text-xs text-system-ink-muted">{c.symbol}</div>
                      </td>
                      <td className="px-4 py-3 text-system-ink-secondary">
                        {CATEGORY_LABELS[c.category] ?? c.category}
                      </td>
                      <td
                        className="px-4 py-3 text-right font-mono tabular-nums"
                        title={`Valore grezzo della fonte: ${c.displayPrice} ${c.displayUnit}`}
                      >
                        {formatCommodityPrice(parseFloat(c.displayPrice))}{" "}
                        <span className="text-xs text-system-ink-muted">
                          {shortUnit(c.displayUnit)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-system-ink-muted">
                        <span className="inline-flex items-center gap-2">
                          <FreshnessBadge
                            state={c.freshnessState}
                            title={`Ultimo dato ${c.ageDays} giorni fa. ${c.freshnessLabel}: il valore mostrato potrebbe non essere quello corrente.`}
                          />
                          {c.recordedAtFormatted}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="min-w-0">
              <PriceHistoryChart
                title="Andamento materie prime"
                series={series}
                historyKind="commodities"
                initialWindow="3m"
              />
            </div>
          </div>
        )}
        <SourceNote sources={["alpha-vantage"]}>
          Fonte: Alpha Vantage (dati di mercato, da EIA e FMI) · petrolio e
          gas: prezzi giornalieri pubblicati una volta a settimana · metalli e
          agricole: medie mensili, con circa due mesi di ritardo (la data
          01/07 indica la media di luglio) · l&apos;etichetta &quot;non
          aggiornato&quot; segnala una serie ferma oltre il ritardo atteso
        </SourceNote>
      </section>
    </PageShell>
  );
}
