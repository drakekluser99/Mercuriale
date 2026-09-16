import type { Metadata } from "next";
import { ItalyProvinceFuelTable } from "@/components/ItalyProvinceFuelTable";
import { ItalyProvinceMap } from "@/components/ItalyProvinceMap";
import { KeyFigure } from "@/components/KeyFigure";
import { SectionHeading } from "@/components/SectionHeading";
import { SourceNote } from "@/components/SourceNote";
import { EmptyState, NO_DATA_YET, PageShell } from "@/components/site/PageShell";
import { getNow, loadItaly } from "@/lib/dashboard";
import { formatFuelPrice } from "@/lib/format";
import { sectionPage } from "@/lib/siteNav";

export const dynamic = "force-dynamic";

const PAGE = sectionPage("/italia");

export const metadata: Metadata = {
  title: `${PAGE.title} — Mercuriale`,
  description:
    "Benzina e gasolio self in tutte le 107 province italiane: mappa, classifica e pagina di dettaglio per ciascuna. Fonte: MIMIT, aggiornamento giornaliero.",
};

/**
 * /italia — ex sezione 05 della home (16 set 2026). Collega alla UI le
 * 107 pagine /provincia/[slug] (mappa e tabella portano lì).
 */
export default async function ItaliaPage() {
  const { rows, average, spread, run } = await loadItaly();
  const now = getNow();

  return (
    <PageShell
      title={PAGE.title}
      intro="Benzina e gasolio self-service nelle 107 province italiane, dai prezzi che ogni distributore comunica al Ministero. Clicca una provincia per il dettaglio."
      consultedOn={now}
    >
      <section>
        <SectionHeading number={PAGE.number} title="Mappa e classifica delle province" />
        {spread && (
          <KeyFigure value={`${formatFuelPrice(spread.gap)} €/L`}>
            di differenza sulla benzina self fra la provincia più cara,{" "}
            {spread.highest.provinceName} ({formatFuelPrice(spread.highValue)} €/L),
            e la più economica, {spread.lowest.provinceName} (
            {formatFuelPrice(spread.lowValue)} €/L).
          </KeyFigure>
        )}
        {rows.length === 0 ? (
          <EmptyState label={NO_DATA_YET} />
        ) : (
          <>
            {average.petrolSelf !== null && (
              <p className="mt-4 text-sm leading-relaxed text-system-ink-secondary">
                Media nazionale self:{" "}
                <strong className="text-system-ink">
                  {formatFuelPrice(average.petrolSelf)} €/L
                </strong>{" "}
                benzina
                {average.dieselSelf !== null && (
                  <>
                    {" "}·{" "}
                    <strong className="text-system-ink">
                      {formatFuelPrice(average.dieselSelf)} €/L
                    </strong>{" "}
                    gasolio
                  </>
                )}
                , pesata sul numero di impianti di ciascuna provincia.
              </p>
            )}
            {/* Mappa e tabella affiancate su schermi larghi: dove costa di
                più, e l'elenco da cercare. */}
            <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
              <ItalyProvinceMap
                rows={rows}
                average={{ petrolSelf: average.petrolSelf, dieselSelf: average.dieselSelf }}
              />
              <ItalyProvinceFuelTable rows={rows} />
            </div>
          </>
        )}
        <SourceNote
          sources={["mimit"]}
          checks={[{ label: "MIMIT", cadence: "ogni giorno", checkedAt: run?.startedAt ?? null }]}
        >
          Fonte: MIMIT, anagrafica e prezzi stazione per stazione, aggregati
          per provincia · aggiornamento giornaliero · confini provinciali:
          ISTAT (CC-BY 4.0), versione ottobre 2025 via geojson-italy
        </SourceNote>
      </section>
    </PageShell>
  );
}
