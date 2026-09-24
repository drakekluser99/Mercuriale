/**
 * Raccordo dell'indice NIC dalla base 2015 alla base 2025.
 *
 * ISTAT pubblica l'indice nella base in cui è stato calcolato: 2015=100
 * fino a dicembre 2025, 2025=100 da gennaio 2026. Per disegnare una serie
 * continua dal 2016 l'indice vecchio va portato nella scala nuova:
 *
 *   indice in base 2025 = indice in base 2015 ÷ coefficiente
 *
 * Il coefficiente è la media dei 12 mesi del 2025 nella base 2015, divisa
 * per 100: il 2025 vale 100 nella base nuova per definizione. Esempio:
 * dicembre 2025, indice generale 122,6 ÷ 1,226 = 100,0.
 *
 * La VARIAZIONE annua non passa di qui: ISTAT la pubblica già calcolata a
 * cavallo delle due basi, e il sito la mostra così com'è.
 *
 * Il raccordo si applica in LETTURA: in tabella l'indice resta nella base
 * originale (vedi `consumer_price_index` in schema.ts).
 */

import type { NicCategoryCode } from "./fetchers/istatNic";

/**
 * Coefficienti UFFICIALI ISTAT, 2015→2025, tre decimali come pubblicati.
 * Fonte: IstatData, "Tabelle dei coefficienti di raccordo dalla base 1995
 * al 2010 - base 2010 al 2015 - base 2015 al 2025 - Codici Ecoicop 2"
 * (file `DCSP_NIC_CR_Ecoicov2_rev.xlsx`, foglio IT), scaricato il 24/9/2026.
 * Cambiano solo al prossimo cambio di base.
 */
export const OFFICIAL_SPLICE_2015_TO_2025 = {
  "00": 1.226,
  "01": 1.344,
} as const satisfies Partial<Record<NicCategoryCode, number>>;

/**
 * Coefficienti CALCOLATI da Mercuriale per gli aggregati speciali, per i
 * quali ISTAT non pubblica il raccordo 2015→2025 (verificato il 24/9/2026
 * su tutti i file "coefficienti di raccordo" di IstatData: gli aggregati
 * speciali arrivano solo al 2010→2015).
 *
 * Stesso metodo dei coefficienti ufficiali, e il metodo è verificato: su
 * `00` e `01` il calcolo deve dare ESATTAMENTE i valori ufficiali, oppure
 * `checkSplice` si ferma (vedi sotto).
 *
 * Fissati il 24/9/2026 dal primo `npm run backfill:nic` sui dati veri
 * (risposta ISTAT del 24/9, 2016-01 → 2026-08, nessun mese mancante): lo
 * stesso lancio ha riprodotto ESATTAMENTE 1,226 e 1,344 su `00` e `01`.
 * Ogni lancio successivo ricalcola e dice se coincidono ancora.
 *
 * `null` vorrebbe dire "non ancora fissato": `toBase2025` restituirebbe
 * null e il sito mostrerebbe solo la variazione annua di quella serie.
 * Numeri fissi e non ricalcolati a ogni richiesta, come
 * `CHOKEPOINT_BASELINES`: un riferimento dichiarato in metodologia non deve
 * cambiare se la fonte rivede lo storico.
 */
export const CALCULATED_SPLICE_2015_TO_2025: Record<"FOODHPC" | "ENRGY", number | null> = {
  FOODHPC: 1.301,
  ENRGY: 1.501,
};

export type SpliceKind = "ufficiale" | "calcolato";

/** Coefficiente di una serie e da dove viene, o null se non è fissato. */
export function spliceCoefficient(
  category: NicCategoryCode
): { value: number; kind: SpliceKind } | null {
  if (category === "00" || category === "01") {
    return { value: OFFICIAL_SPLICE_2015_TO_2025[category], kind: "ufficiale" };
  }
  const value = CALCULATED_SPLICE_2015_TO_2025[category];
  return value === null ? null : { value, kind: "calcolato" };
}

/**
 * Porta un indice nella base 2025. Un indice già in base 2025 resta com'è;
 * uno in base 2015 si divide per il coefficiente della sua serie. Null se
 * il coefficiente non è ancora fissato: meglio un buco nel grafico che un
 * salto di trenta punti inventato dal cambio di scala.
 */
export function toBase2025(
  category: NicCategoryCode,
  baseYear: number,
  indexValue: number
): number | null {
  if (baseYear === 2025) return indexValue;
  if (baseYear !== 2015) {
    throw new Error(`Raccordo NIC: base ${baseYear} non gestita (solo 2015 e 2025)`);
  }
  const c = spliceCoefficient(category);
  return c === null ? null : indexValue / c.value;
}

type MonthlyIndex = { month: string; baseYear: number; indexValue: number };

/**
 * Calcola il coefficiente dai dati: media dei 12 mesi del 2025 in base
 * 2015 ÷ 100, arrotondata a tre decimali come quelli ufficiali. Si ferma
 * se manca anche un solo mese: una media su undici mesi darebbe un
 * coefficiente sbagliato senza dirlo.
 */
export function computeSpliceCoefficient(rows: readonly MonthlyIndex[]): number {
  const months = new Map<string, number>();
  for (const r of rows) {
    if (r.baseYear !== 2015 || !r.month.startsWith("2025-")) continue;
    if (months.has(r.month)) throw new Error(`Raccordo NIC: il mese ${r.month} compare due volte`);
    months.set(r.month, r.indexValue);
  }
  const missing = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}`)
    .filter((m) => !months.has(m));
  if (missing.length > 0) {
    throw new Error(`Raccordo NIC: mancano i mesi 2025 in base 2015: ${missing.join(", ")}`);
  }
  const mean = [...months.values()].reduce((a, b) => a + b, 0) / 12;
  // Arrotondamento semplice. Un valore esattamente a metà (es. 1,0005)
  // può uscire dalla somma come 1,000499…: nessun trucco di arrotondamento
  // lo recupera, perché l'errore nasce nella media. Sui coefficienti
  // ufficiali lo intercetta `checkSplice`; su quelli calcolati lo scarto
  // è di un millesimo, sotto la precisione del dato (indici a un decimale).
  return Math.round((mean / 100) * 1000) / 1000;
}

export type SpliceCheckRow = {
  category: NicCategoryCode;
  kind: SpliceKind;
  /** Calcolato dai dati. */
  computed: number;
  /** Il valore fissato nel codice (ufficiale o calcolato), null se non ancora fissato. */
  fixed: number | null;
  /** `computed === fixed`; per le serie calcolate non fissate, false. */
  matches: boolean;
};

/**
 * Il controllo del metodo, usato dal backfill. Per ogni serie calcola il
 * coefficiente dai dati e lo confronta con quello fissato nel codice.
 *
 * Si FERMA se un coefficiente UFFICIALE non coincide con il calcolo alla
 * terza decimale: vuol dire che il metodo non riproduce quello di ISTAT, e
 * allora non vale nemmeno per i coefficienti calcolati. Se scatta, si
 * indaga (dati, arrotondamenti, revisioni) — NON si allenta il controllo.
 *
 * Per le serie calcolate non si ferma: restituisce il confronto, e lo
 * script lo stampa (valore da fissare, oppure "coincide ancora").
 */
export function checkSplice(
  rowsByCategory: Readonly<Record<NicCategoryCode, readonly MonthlyIndex[]>>
): SpliceCheckRow[] {
  const report: SpliceCheckRow[] = [];
  for (const category of ["00", "01", "FOODHPC", "ENRGY"] as const) {
    const computed = computeSpliceCoefficient(rowsByCategory[category]);
    const fixed = spliceCoefficient(category);
    const kind: SpliceKind = category === "00" || category === "01" ? "ufficiale" : "calcolato";
    const matches = fixed !== null && fixed.value === computed;
    if (kind === "ufficiale" && !matches) {
      throw new Error(
        `Raccordo NIC: per ${category} il calcolo dà ${computed} ma il coefficiente ufficiale è ${fixed?.value} — ` +
          `il metodo non riproduce ISTAT, quindi non si usa nemmeno per gli aggregati`
      );
    }
    report.push({ category, kind, computed, fixed: fixed?.value ?? null, matches });
  }
  return report;
}
