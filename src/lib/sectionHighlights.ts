/**
 * "Cifra chiave" in apertura di ogni sezione della home (15 set 2026).
 *
 * PERCHÉ: un feedback reale diceva "farei qualcosa più con numeri grandi",
 * un altro "dopo il primo scroll ho notato un calo di attenzione". Ogni
 * sezione apriva direttamente con una tabella o una mappa: chi scorre
 * veloce non si portava a casa niente. Ora ognuna apre con UNA cifra e UNA
 * frase che dice cosa significa.
 *
 * Regole, le stesse del resto del sito:
 * - nessun dato nuovo: tutto si ricava da ciò che la pagina calcola già
 *   (europeFuelStats, italianFuelStats, priceMovers);
 * - nessuna stima: se manca un pezzo la funzione ritorna `null` e la
 *   sezione semplicemente non mostra la cifra;
 * - funzioni PURE (niente database, niente React), così i test Vitest le
 *   chiamano con dati finti.
 */

import { taxSharePercent, type CountryFuelPoint, type EuropeFuelAverage } from "./europeFuelStats";
import type { ProvinceFuelPoint } from "./italianFuelStats";
import type { PriceMover } from "./priceHistory";

/** Chiave grezza dell'Italia in `regions.name` (vedi countries.ts). */
const ITALY_KEY = "Italy";

/**
 * 01 — Italia contro la media dei 27, sulla benzina.
 * `diff` positivo = l'Italia costa di più.
 */
export function italyVsEuAverage(
  countries: CountryFuelPoint[],
  average: EuropeFuelAverage,
): { italy: number; average: number; diff: number } | null {
  const italy = countries.find((c) => c.countryName === ITALY_KEY)?.petrol ?? null;
  if (italy === null || average.petrol === null) return null;
  return { italy, average: average.petrol, diff: italy - average.petrol };
}

/**
 * 02 — Quota di imposte nel prezzo medio della benzina dei 27. Stessa
 * formula (e stessa media) usata come centro della scala nella mappa:
 * "quota della media", non "media delle quote" — vedi EuropeFuelMap.tsx.
 */
export function euPetrolTaxShare(average: EuropeFuelAverage): number | null {
  if (average.petrol === null) return null;
  return taxSharePercent(average.petrol, average.petrolNet);
}

/**
 * 03 — La variazione più ampia (in valore assoluto) fra le materie prime.
 * Riceve i `priceMovers` già calcolati sulle sole materie prime.
 */
export function biggestMover(movers: PriceMover[]): PriceMover | null {
  if (movers.length === 0) return null;
  return movers.reduce((best, m) =>
    Math.abs(m.changePct) > Math.abs(best.changePct) ? m : best,
  );
}

/**
 * Il più caro e il più economico di una lista, e la distanza fra i due.
 * Generica: la usano sia i paesi (04) sia le province (05). Gli elementi
 * con valore `null` si scartano — un paese senza dato non è "il più
 * economico" con prezzo zero.
 */
export function priceSpread<T>(
  items: T[],
  valueOf: (item: T) => number | null,
): { highest: T; lowest: T; highValue: number; lowValue: number; gap: number } | null {
  let highest: T | null = null;
  let lowest: T | null = null;
  let highValue = -Infinity;
  let lowValue = Infinity;
  for (const item of items) {
    const v = valueOf(item);
    if (v === null) continue;
    if (v > highValue) {
      highValue = v;
      highest = item;
    }
    if (v < lowValue) {
      lowValue = v;
      lowest = item;
    }
  }
  // Serve almeno un elemento valido. Con uno solo il "divario" è zero:
  // vero, ma non racconta niente — lo tratta come assenza di dato.
  if (highest === null || lowest === null || highest === lowest) return null;
  return { highest, lowest, highValue, lowValue, gap: highValue - lowValue };
}

/** 04 — Paese più caro e più economico sulla benzina. */
export function euPetrolSpread(countries: CountryFuelPoint[]) {
  return priceSpread(countries, (c) => c.petrol);
}

/** 05 — Provincia più cara e più economica sulla benzina self. */
export function provincePetrolSelfSpread(provinces: ProvinceFuelPoint[]) {
  return priceSpread(provinces, (p) => p.petrolSelf);
}

/**
 * Paesi UE che confinano con l'Italia (blocco D, 15 set 2026), nell'ordine
 * in cui si incontrano lungo l'arco alpino da ovest a est. La Svizzera
 * confina ma non è nell'UE, quindi non è nel bollettino della Commissione:
 * mescolarla qui vorrebbe dire un'altra fonte, un'altra valuta (CHF) e
 * un'altra cadenza (mensile), e un confronto che sembra omogeneo ma non lo
 * è. San Marino e Vaticano non hanno dati propri.
 */
export const ITALY_EU_NEIGHBOURS = ["France", "Austria", "Slovenia"] as const;

export interface NeighbourComparison {
  countryName: string;
  petrol: number;
  /** Paese meno Italia: negativo = lì la benzina costa meno. */
  diffVsItaly: number;
}

/**
 * 01 — La benzina in Italia contro i paesi confinanti: la domanda di chi
 * vive vicino a un confine ("conviene fare il pieno di là?"). Restituisce
 * `null` se manca l'Italia; i confinanti senza dato vengono saltati, non
 * mostrati a zero.
 */
export function italyVsNeighbours(
  countries: CountryFuelPoint[],
): { italy: number; neighbours: NeighbourComparison[] } | null {
  const byName = new Map(countries.map((c) => [c.countryName, c]));
  const italy = byName.get(ITALY_KEY)?.petrol ?? null;
  if (italy === null) return null;

  const neighbours: NeighbourComparison[] = [];
  for (const name of ITALY_EU_NEIGHBOURS) {
    const petrol = byName.get(name)?.petrol ?? null;
    if (petrol === null) continue;
    neighbours.push({ countryName: name, petrol, diffVsItaly: petrol - italy });
  }
  return neighbours.length > 0 ? { italy, neighbours } : null;
}
