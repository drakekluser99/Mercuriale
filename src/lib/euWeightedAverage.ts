/**
 * Media UE ponderata della Commissione (blocco C, 15 set 2026): dalla
 * forma del database a quella che serve alla pagina.
 *
 * File PURO — niente database — per poterlo testare con righe scritte a
 * mano, come sectionHighlights.ts.
 */

/** Una riga come esce dalla query (numeric → stringa, come sempre con Drizzle). */
export interface EuWeightedAverageRow {
  fuelType: string;
  price: string;
  priceNet: string | null;
  recordedAt: Date;
}

/**
 * Solo numeri e una stringa: questo oggetto arriva a EuropeFuelMap, che è
 * un Client Component, e un Client Component accetta solo dati semplici
 * (niente funzioni; una Date arriverebbe, ma una stringa è più chiara).
 */
export interface EuWeightedAverage {
  /** Settimana del bollettino, YYYY-MM-DD. */
  date: string;
  petrol: number | null;
  diesel: number | null;
  petrolNet: number | null;
  dieselNet: number | null;
}

function toNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * `null` se non ci sono righe (tabella vuota: migrazione fatta ma backfill
 * non ancora lanciato) — la pagina allora semplicemente non mostra la
 * media ponderata, invece di mostrare uno zero.
 */
export function summarizeEuWeightedAverage(
  rows: EuWeightedAverageRow[]
): EuWeightedAverage | null {
  if (rows.length === 0) return null;
  const find = (fuel: string) => rows.find((r) => r.fuelType === fuel);
  const petrol = find("petrol");
  const diesel = find("diesel");
  return {
    date: rows[0].recordedAt.toISOString().slice(0, 10),
    petrol: toNumber(petrol?.price ?? null),
    diesel: toNumber(diesel?.price ?? null),
    petrolNet: toNumber(petrol?.priceNet ?? null),
    dieselNet: toNumber(diesel?.priceNet ?? null),
  };
}

/**
 * Quota di imposte sul prezzo: la STESSA funzione usata per la "media dei
 * 27" (europeFuelStats.ts), riesportata da qui invece che riscritta —
 * così i due numeri affiancati nella mappa non possono divergere per una
 * formula copiata male. europeFuelStats importa solo tipi dal database,
 * quindi è sicuro anche dentro un Client Component.
 */
export { taxSharePercent } from "./europeFuelStats";
