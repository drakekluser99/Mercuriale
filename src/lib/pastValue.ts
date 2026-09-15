/**
 * "Quanto valeva N giorni fa?" su una serie di prezzi (15 set 2026).
 *
 * Serve al calcolatore d'impatto per il confronto nel tempo ("lo stesso
 * pieno un mese fa, un anno fa"). Funzione pura: riceve i punti già
 * ordinati per data, non tocca il database.
 *
 * Regole, scelte per non inventare nulla:
 * - si prende l'ultima rilevazione IN O PRIMA della data cercata, mai una
 *   successiva: "un mese fa" non può essere un dato di tre settimane fa;
 * - ma se quella rilevazione è troppo vecchia rispetto alla data cercata
 *   (più di `toleranceDays`), la risposta è `null`: un buco nello storico
 *   non diventa un confronto con un prezzo di mesi prima.
 */

import type { PricePoint } from "./priceHistory";

export function valueAtOrBefore(
  points: PricePoint[],
  target: Date,
  toleranceDays = 10,
): PricePoint | null {
  const targetIso = target.toISOString().slice(0, 10);
  let found: PricePoint | null = null;
  // I punti sono in ordine crescente: l'ultimo che non supera la data
  // cercata è quello giusto. Confronto fra stringhe ISO ("2026-08-15"):
  // funziona perché anno-mese-giorno si ordinano come testo.
  for (const p of points) {
    if (p.date <= targetIso) found = p;
    else break;
  }
  if (!found) return null;

  const gapDays =
    (Date.parse(targetIso) - Date.parse(found.date)) / (24 * 60 * 60 * 1000);
  return gapDays <= toleranceDays ? found : null;
}

/** Data di `days` giorni prima di `from`. */
export function daysBefore(from: Date, days: number): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}
