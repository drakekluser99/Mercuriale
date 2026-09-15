import Link from "next/link";
import { routeForCountry } from "@/lib/countries";
import { localizedCountryName } from "@/lib/countryNames";
import { formatFuelPrice } from "@/lib/format";
import type { NeighbourComparison } from "@/lib/sectionHighlights";

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
}: {
  italy: number;
  neighbours: NeighbourComparison[];
}) {
  return (
    <div className="mt-6">
      <h3 className="font-mono text-xs uppercase tracking-wider text-system-ink-secondary">
        Benzina · Italia e paesi UE confinanti
      </h3>
      {/* `sm:grid-cols-2 lg:grid-cols-4`: quattro riquadri in riga su
          desktop, due per due su tablet, in colonna su telefono. */}
      <ul className="mt-2 grid gap-px overflow-hidden rounded-md border border-system-border bg-system-border sm:grid-cols-2 lg:grid-cols-4">
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
      </ul>
      <p className="mt-2 text-xs text-system-ink-muted">
        La Svizzera confina con l&apos;Italia ma non è nell&apos;UE: il
        bollettino della Commissione non la copre, e per ora non la
        mostriamo.
      </p>
    </div>
  );
}
