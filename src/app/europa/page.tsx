import type { Metadata } from "next";
import EuropeFuelMap from "@/components/EuropeFuelMap";
import { FuelPriceTable } from "@/components/FuelPriceTable";
import { KeyFigure } from "@/components/KeyFigure";
import { NeighbourTiles } from "@/components/NeighbourTiles";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { SectionHeading } from "@/components/SectionHeading";
import { SourceNote } from "@/components/SourceNote";
import { EmptyState, NO_DATA_YET, PageShell } from "@/components/site/PageShell";
import { localizedCountryName } from "@/lib/countryNames";
import { getNow, loadFuel } from "@/lib/dashboard";
import { formatFuelPrice } from "@/lib/format";
import { sectionPage } from "@/lib/siteNav";

export const dynamic = "force-dynamic";

const PAGE = sectionPage("/europa");

export const metadata: Metadata = {
  title: `${PAGE.title} — Mercuriale`,
  description:
    "Benzina e diesel nei 27 paesi UE: mappa, confronto con i paesi confinanti, tabelle e andamento. Fonte: Commissione Europea, con la media ponderata ufficiale.",
};

/**
 * /europa — ex sezioni 01 (mappa) e 04 (tabelle carburanti) della home,
 * riunite il 16 set 2026 quando la home è stata divisa in pagine: parlano
 * degli stessi prezzi, e su una pagina dedicata stanno meglio insieme.
 */
export default async function EuropaPage() {
  const fuel = await loadFuel();
  const now = getNow();
  const { italyGap, euWeighted, swiss, neighbours, countrySpread, runs } = fuel;

  return (
    <PageShell
      title={PAGE.title}
      intro="Quanto costano benzina e diesel nei 27 paesi dell'Unione Europea, quanta parte del prezzo è imposta, e come si colloca l'Italia rispetto alla media e ai paesi confinanti."
      consultedOn={now}
    >
      {fuel.countries.length > 0 && (
        <section>
          {/* "Carburanti" e non "benzina": la mappa si commuta sul diesel. */}
          <SectionHeading number="01·A" title="Mappa e paesi confinanti" />
          {italyGap && (
            <KeyFigure
              value={`${italyGap.diff >= 0 ? "+" : "−"}${formatFuelPrice(Math.abs(italyGap.diff))} €/L`}
              tone={italyGap.diff >= 0 ? "up" : "down"}
            >
              La benzina in Italia ({formatFuelPrice(italyGap.italy)} €/L)
              rispetto alla media dei 27 paesi UE ({formatFuelPrice(italyGap.average)} €/L
              {euWeighted?.petrol != null &&
                `; ${formatFuelPrice(euWeighted.petrol)} €/L la media ponderata sui consumi della Commissione`}
              ). Passa sulla mappa per vedere quanto di ogni prezzo è imposta.
            </KeyFigure>
          )}
          <div className="mt-4 rounded-lg border border-system-border bg-system-surface p-4">
            {/* Ogni metrica ha la PROPRIA media come centro della scala:
                per questo passano entrambi i carburanti, lordo e netto.
                Solo numeri: è un Client Component. */}
            <EuropeFuelMap
              prices={fuel.countries}
              euAverage={{
                petrol: fuel.average.petrol,
                diesel: fuel.average.diesel,
                petrolNet: fuel.average.petrolNet,
                dieselNet: fuel.average.dieselNet,
              }}
              euWeighted={euWeighted}
            />
          </div>
          {neighbours && (
            <NeighbourTiles
              italy={neighbours.italy}
              neighbours={neighbours.neighbours}
              swiss={swiss}
            />
          )}
          <SourceNote
            sources={swiss ? ["eu-commission", "bfs", "ecb"] : ["eu-commission"]}
            checks={[
              { label: "UE", cadence: "ogni giorno", checkedAt: runs.eu?.startedAt ?? null },
              ...(swiss
                ? [{ label: "Svizzera", cadence: "ogni mese", checkedAt: runs.swiss?.startedAt ?? null }]
                : []),
            ]}
          >
            Fonte: Bollettino Petrolifero Settimanale, Commissione Europea ·
            dato settimanale (di norma il giovedì), controllato ogni giorno ·
            confini amministrativi: Natural Earth (dominio pubblico)
            {swiss &&
              " · Svizzera: Ufficio federale di statistica (media mensile, licenza OPEN-BY), cambio di riferimento BCE"}
          </SourceNote>
        </section>
      )}

      <section className="mt-12">
        <SectionHeading number="01·B" title="Prezzi paese per paese e andamento" />
        {countrySpread && (
          <KeyFigure value={`${formatFuelPrice(countrySpread.gap)} €/L`}>
            di differenza sulla benzina fra il paese UE più caro,{" "}
            {localizedCountryName(countrySpread.highest.countryName)} (
            {formatFuelPrice(countrySpread.highValue)} €/L), e il più economico,{" "}
            {localizedCountryName(countrySpread.lowest.countryName)} (
            {formatFuelPrice(countrySpread.lowValue)} €/L).
          </KeyFigure>
        )}
        {/* Tabelle e grafico affiancati sugli schermi larghi: ora che la
            pagina è dedicata c'è spazio per vederli insieme. `min-w-0`
            impedisce alle tabelle di allargare la griglia. */}
        {fuel.tables.length === 0 ? (
          <EmptyState label={NO_DATA_YET} />
        ) : (
          <div className="mt-4 grid gap-6 xl:grid-cols-2">
            <div className="min-w-0 space-y-6">
              {fuel.tables.map((t) => (
                <FuelPriceTable key={t.continent} continentLabel={t.label} fuels={t.fuels} />
              ))}
            </div>
            <div className="min-w-0">
              <PriceHistoryChart
                title="Andamento carburanti"
                series={fuel.series}
                historyKind="fuel"
                initialWindow="1m"
              />
            </div>
          </div>
        )}
        <SourceNote
          sources={["eu-commission", "eia"]}
          checks={[
            { label: "UE", cadence: "ogni giorno", checkedAt: runs.eu?.startedAt ?? null },
            { label: "USA", cadence: "ogni giorno", checkedAt: runs.us?.startedAt ?? null },
          ]}
        >
          Fonte: Bollettino Petrolifero Settimanale (UE, di norma il giovedì) ·
          EIA (USA, dato settimanale) · entrambi controllati ogni giorno ·
          prezzi medi nazionali, non punti vendita specifici
        </SourceNote>
      </section>
    </PageShell>
  );
}
