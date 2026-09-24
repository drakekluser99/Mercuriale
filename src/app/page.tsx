import { SummaryBand } from "@/components/sections/SummaryBand";
import { SectionPreview } from "@/components/site/SectionPreview";
import { PageShell } from "@/components/site/PageShell";
import { TickerBand } from "@/components/TickerBand";
import { localizedCountryName } from "@/lib/countryNames";
import {
  getNow,
  loadCalculator,
  loadCommodities,
  loadFuel,
  loadItaly,
  loadShipping,
  loadSummary,
} from "@/lib/dashboard";
import { formatDecimal, formatFuelPrice, formatPercent } from "@/lib/format";
import { sectionPage } from "@/lib/siteNav";

export const dynamic = "force-dynamic";

/**
 * PANORAMICA (home) — 16 set 2026.
 *
 * Fino al 15 settembre la home conteneva TUTTO: cinque sezioni lunghe una
 * dopo l'altra. Una recensione l'ha detto chiaramente: "tanto testo per
 * una sola pagina", meglio "più route, una per sezione". Ora:
 * - qui restano la fascia dei valori, la sintesi della settimana e una
 *   cifra chiave per ogni sezione, con il link alla sua pagina;
 * - il dettaglio (mappe, tabelle, grafici, calcolatore) vive in /europa,
 *   /calcolatore, /materie-prime, /italia e /traffico-marittimo (elenco in
 *   src/lib/siteNav.ts).
 *
 * I dati arrivano da src/lib/dashboard.ts, lo stesso modulo che usano le
 * pagine di sezione: i numeri in anteprima sono per costruzione gli stessi
 * che si trovano aprendo la pagina.
 */
export default async function Home() {
  const [summary, fuel, commodities, italy, calc, shipping] = await Promise.all([
    loadSummary(),
    loadFuel(),
    loadCommodities(),
    loadItaly(),
    loadCalculator(),
    loadShipping(),
  ]);
  const now = getNow();

  const europa = sectionPage("/europa");
  const calcolatore = sectionPage("/calcolatore");
  const materiePrime = sectionPage("/materie-prime");
  const italia = sectionPage("/italia");
  const traffico = sectionPage("/traffico-marittimo");
  const ship = shipping.headline;
  const { italyGap, countrySpread } = fuel;
  const mover = commodities.topMover;

  return (
    <PageShell
      title="Prezzi di materie prime e carburanti"
      intro="Dati raccolti da fonti pubbliche — Commissione Europea, EIA, Ministero delle Imprese, Alpha Vantage, IMF PortWatch — aggiornati alla cadenza di ciascuna fonte, con fonte, data e limiti dichiarati."
      consultedOn={now}
      backdropPoints={summary.heroSeries}
      headerExtra={summary.lastUpdated && <TickerBand stats={summary.headerStats} />}
    >
      <SummaryBand
        narratives={summary.narratives}
        topMovers={summary.topMovers}
        figure={summary.figure}
        euRunAt={fuel.runs.eu?.startedAt ?? null}
      />

      {/* Le sezioni: una cifra per pagina. Due colonne su desktop, una su
          telefono. */}
      <section aria-labelledby="sezioni-titolo" className="mb-12">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs text-system-ink-muted">▦</span>
          <h2 id="sezioni-titolo" className="text-lg font-semibold text-system-ink">
            Le sezioni
          </h2>
        </div>
        <p className="mt-1 text-sm text-system-ink-secondary">
          Ogni sezione ha la sua pagina, con mappe, tabelle e grafici.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <SectionPreview
            href={europa.href}
            number={europa.number}
            title={europa.label}
            value={
              italyGap
                ? `${italyGap.diff >= 0 ? "+" : "−"}${formatFuelPrice(Math.abs(italyGap.diff))} €/L`
                : null
            }
            tone={italyGap ? (italyGap.diff >= 0 ? "up" : "down") : "neutral"}
          >
            {italyGap
              ? `La benzina in Italia rispetto alla media dei 27 paesi UE. Mappa, paesi confinanti, tabelle e andamento${countrySpread ? `; fra ${localizedCountryName(countrySpread.highest.countryName)} e ${localizedCountryName(countrySpread.lowest.countryName)} ci sono ${formatFuelPrice(countrySpread.gap)} €/L` : ""}.`
              : "Mappa dei 27 paesi UE, paesi confinanti, tabelle e andamento."}
          </SectionPreview>
          <SectionPreview
            href={calcolatore.href}
            number={calcolatore.number}
            title={calcolatore.label}
            value={calc.euTaxShare !== null ? formatPercent(calc.euTaxShare).replace("+", "") : null}
          >
            Del prezzo medio della benzina nei 27 paesi UE è imposta. Quanto
            costa un pieno oggi, un mese fa e un anno fa, e quanto pesa sui
            trasporti.
          </SectionPreview>
          <SectionPreview
            href={materiePrime.href}
            number={materiePrime.number}
            title={materiePrime.label}
            value={mover ? formatPercent(mover.changePct) : null}
            tone={mover ? (mover.changePct >= 0 ? "up" : "down") : "neutral"}
          >
            {mover
              ? `${mover.label} negli ultimi 90 giorni, la variazione più ampia. Petrolio, gas, metalli e agricole con storico fino a 10 anni.`
              : "Petrolio, gas, metalli e agricole con storico fino a 10 anni."}
          </SectionPreview>
          <SectionPreview
            href={italia.href}
            number={italia.number}
            title={italia.label}
            value={italy.spread ? `${formatFuelPrice(italy.spread.gap)} €/L` : null}
          >
            {italy.spread
              ? `Di differenza sulla benzina self fra ${italy.spread.highest.provinceName} e ${italy.spread.lowest.provinceName}. Mappa e classifica delle 107 province.`
              : "Mappa e classifica delle 107 province italiane."}
          </SectionPreview>
          {/* Quinta anteprima: su due colonne resterebbe sola a metà riga,
              quindi occupa tutta la larghezza. */}
          <div className="md:col-span-2">
            <SectionPreview
              href={traffico.href}
              number={traffico.number}
              title={traffico.label}
              value={
                ship && ship.deviationPct !== null ? formatPercent(ship.deviationPct, 0) : null
              }
            >
              {ship && ship.mean7 !== null
                ? `${ship.name}: ${formatDecimal(ship.mean7)} navi al giorno negli ultimi 7 giorni, contro le ${formatDecimal(ship.baseline)} del ${ship.baselineLabel}. Mappa, schede e grafico con il Brent per Hormuz e Bab el-Mandeb.`
                : "Navi in transito negli stretti di Hormuz e Bab el-Mandeb: mappa, schede e grafico con il Brent."}
            </SectionPreview>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
