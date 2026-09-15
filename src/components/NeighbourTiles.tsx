import Link from "next/link";
import { routeForCountry } from "@/lib/countries";
import { localizedCountryName } from "@/lib/countryNames";
import { formatFuelPrice } from "@/lib/format";
import type { NeighbourComparison } from "@/lib/sectionHighlights";
import { formatMonthLabel, type SwissFuelSummary } from "@/lib/swissFuel";

/**
 * "Italia e paesi confinanti" — blocco D, 15 set 2026.
 *
 * Server Component (niente "use client"): non c'è interazione, sono
 * quattro riquadri statici. Così non aggiunge JavaScript alla pagina.
 *
 * Il riquadro dell'Italia viene per primo ed è il riferimento; ogni
 * confinante mostra il suo prezzo in grande e, sotto, la differenza con
 * l'Italia. Il colore segue la regola del sito: ruggine = più caro,
 * verde = più economico. Il segno (+/−) e la parola ("in più" / "in
 * meno") dicono la stessa cosa, così il colore non è mai l'unico indizio.
 */
export function NeighbourTiles({
  italy,
  neighbours,
  swiss,
}: {
  italy: number;
  neighbours: NeighbourComparison[];
  /**
   * Svizzera (blocco D, parte 3): fonte, valuta e cadenza diverse dagli
   * altri, quindi un riquadro a parte che lo dichiara. Compare solo se c'è
   * il prezzo in euro, cioè se c'è anche il cambio del mese.
   */
  swiss?: SwissFuelSummary | null;
}) {
  const showSwiss = swiss != null && swiss.petrolEur !== null;
  // Una colonna per riquadro su desktop: 4 senza Svizzera, 5 con.
  // Classi scritte per intero (non `lg:grid-cols-${n}`): Tailwind trova le
  // classi leggendo il codice come testo, e una classe costruita a pezzi
  // non la vedrebbe, quindi non genererebbe il CSS.
  const columns = showSwiss ? "lg:grid-cols-5" : "lg:grid-cols-4";
  return (
    <div className="mt-6">
      <h3 className="font-mono text-xs uppercase tracking-wider text-system-ink-secondary">
        {showSwiss ? "Benzina · Italia e paesi confinanti" : "Benzina · Italia e paesi UE confinanti"}
      </h3>
      {/* Tutti in riga su desktop, due per riga su tablet, in colonna su
          telefono. */}
      <ul className={`mt-2 grid gap-px overflow-hidden rounded-md border border-system-border bg-system-border sm:grid-cols-2 ${columns}`}>
        <li className="bg-system-surface p-4">
          <p className="text-sm font-medium text-system-ink">Italia</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-system-ink">
            {formatFuelPrice(italy)} <span className="text-sm font-normal">€/L</span>
          </p>
          <p className="mt-1 text-xs text-system-ink-muted">riferimento</p>
        </li>
        {neighbours.map((n) => {
          const cheaper = n.diffVsItaly < 0;
          const route = routeForCountry(n.countryName);
          const name = localizedCountryName(n.countryName);
          return (
            <li key={n.countryName} className="bg-system-surface p-4">
              <p className="text-sm font-medium text-system-ink">
                {route ? (
                  <Link href={`/paese/${route.slug}`} className="underline-offset-2 hover:underline">
                    {name}
                  </Link>
                ) : (
                  name
                )}
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-system-ink">
                {formatFuelPrice(n.petrol)} <span className="text-sm font-normal">€/L</span>
              </p>
              <p
                className={`mt-1 font-mono text-xs tabular-nums ${
                  cheaper ? "text-system-signal-down" : "text-system-signal-up"
                }`}
              >
                {cheaper ? "−" : "+"}
                {formatFuelPrice(Math.abs(n.diffVsItaly))} €/L{" "}
                {cheaper ? "in meno" : "in più"} dell&apos;Italia
              </p>
            </li>
          );
        })}
        {/* Controllo ripetuto qui (e non solo `showSwiss`) perché così
            TypeScript "vede" che petrolEur non è null: un booleano salvato
            in una variabile non restringe il tipo dell'oggetto. */}
        {swiss && swiss.petrolEur !== null && (
          <SwissTile italy={italy} swiss={swiss} petrolEur={swiss.petrolEur} />
        )}
      </ul>
      <p className="mt-2 text-xs text-system-ink-muted">
        {swiss && showSwiss
          ? `Svizzera: media mensile dell'Ufficio federale di statistica (${formatMonthLabel(swiss.month)}), in franchi, convertita con il cambio medio BCE dello stesso mese. Gli altri paesi sono dati settimanali della Commissione Europea: il confronto è indicativo.`
          : "La Svizzera confina con l'Italia ma non è nell'UE: il bollettino della Commissione non la copre, e il dato mensile svizzero non è ancora disponibile."}
      </p>
    </div>
  );
}

/**
 * Il riquadro svizzero. Stessa struttura degli altri, con due righe in
 * più: il prezzo in franchi (il dato originale) e il mese a cui si
 * riferisce, perché non è la stessa settimana degli altri paesi.
 */
function SwissTile({
  italy,
  swiss,
  petrolEur,
}: {
  italy: number;
  swiss: SwissFuelSummary;
  petrolEur: number;
}) {
  const diff = petrolEur - italy;
  const cheaper = diff < 0;
  return (
    <li className="bg-system-surface p-4">
      <p className="text-sm font-medium text-system-ink">
        Svizzera{" "}
        <span className="font-mono text-[10px] uppercase tracking-wider text-system-ink-muted">
          mensile
        </span>
      </p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-system-ink">
        {formatFuelPrice(petrolEur)} <span className="text-sm font-normal">€/L</span>
      </p>
      <p
        className={`mt-1 font-mono text-xs tabular-nums ${
          cheaper ? "text-system-signal-down" : "text-system-signal-up"
        }`}
      >
        {cheaper ? "−" : "+"}
        {formatFuelPrice(Math.abs(diff))} €/L {cheaper ? "in meno" : "in più"}{" "}
        dell&apos;Italia
      </p>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-system-ink-muted">
        {swiss.petrolChf?.toFixed(2).replace(".", ",")} CHF/L ·{" "}
        {formatMonthLabel(swiss.month)}
      </p>
    </li>
  );
}
