/**
 * Finestre temporali dei grafici storici e sfoltimento dei punti
 * (15 set 2026).
 *
 * PERCHÉ: nel database ci sono circa dieci anni di storico (backfill del
 * 3-4 set 2026), ma i grafici mostravano solo 30 o 90 giorni. Ora si può
 * scegliere fino a 10 anni.
 *
 * Il problema da risolvere è il PESO: dieci anni di WTI giornaliero sono
 * circa 2.500 punti per una sola serie. Disegnarli tutti non aggiunge
 * informazione (lo schermo ha poche centinaia di pixel in larghezza) e
 * rende la pagina lenta. Quindi, oltre una certa soglia, i punti vengono
 * raggruppati a blocchi e ogni blocco diventa UN punto con la media dei
 * suoi valori — vedi `downsampleSeries`.
 *
 * File PURO (niente database, niente React): lo usano sia la route
 * /api/history sia il componente del grafico, e i test lo chiamano
 * direttamente.
 */

import type { PriceSeries } from "./priceHistory";

export const HISTORY_WINDOWS = [
  { key: "1m", label: "1 mese", days: 30 },
  { key: "3m", label: "3 mesi", days: 90 },
  { key: "1a", label: "1 anno", days: 365 },
  { key: "5a", label: "5 anni", days: 1826 },
  { key: "10a", label: "10 anni", days: 3653 },
] as const;

export type HistoryWindowKey = (typeof HISTORY_WINDOWS)[number]["key"];

/** Cerca una finestra per chiave; `undefined` se la chiave non esiste. */
export function findHistoryWindow(key: string) {
  return HISTORY_WINDOWS.find((w) => w.key === key);
}

/**
 * Oltre quanti punti per serie si sfoltisce. 260 è circa un punto a
 * settimana su 5 anni: abbastanza per vedere ogni movimento rilevante in
 * un grafico largo al massimo ~1.200 pixel.
 */
export const MAX_POINTS_PER_SERIES = 260;

/**
 * Riduce ogni serie a non più di `maxPoints` punti.
 *
 * Come: divide i punti (già in ordine di data) in blocchi consecutivi di
 * uguale lunghezza e sostituisce ogni blocco con un punto solo:
 * - VALORE = media dei valori del blocco. La media e non "un punto ogni
 *   N" perché saltare punti può far sparire un picco o creare una forma
 *   che non c'è; la media conserva l'andamento.
 * - DATA = la data dell'ULTIMO punto del blocco, così l'ultimo punto del
 *   grafico resta la data della rilevazione più recente.
 *
 * Le serie già sotto la soglia tornano identiche (stesso oggetto): i
 * dati mensili, per esempio, non vengono mai toccati.
 */
export function downsampleSeries(
  series: PriceSeries[],
  maxPoints: number = MAX_POINTS_PER_SERIES,
): PriceSeries[] {
  if (maxPoints < 1) throw new Error("maxPoints deve essere almeno 1");

  return series.map((s) => {
    if (s.points.length <= maxPoints) return s;

    // Math.ceil: con 2.500 punti e 260 al massimo, blocchi da 10 → 250
    // punti. Arrotondare per difetto (9) ne darebbe 278, sopra il limite.
    const blockSize = Math.ceil(s.points.length / maxPoints);
    const points = [];
    for (let i = 0; i < s.points.length; i += blockSize) {
      const block = s.points.slice(i, i + blockSize);
      const sum = block.reduce((acc, p) => acc + p.value, 0);
      points.push({
        date: block[block.length - 1].date,
        value: sum / block.length,
      });
    }
    return { ...s, points };
  });
}
