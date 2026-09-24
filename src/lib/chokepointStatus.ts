/**
 * Situazione attuale di ciascun passaggio marittimo, per la pagina
 * /traffico-marittimo (24 set 2026). Funzione pura, come
 * chokepointHistory.ts: niente database, si prova con dati finti.
 *
 * La regola è quella scritta in chokepointHistory.ts e verificata sui dati
 * il 24/9: la MEDIA DEGLI ULTIMI 7 GIORNI (fino all'ultimo dato
 * pubblicato) confrontata con il "normale" del giorno finale. Un giorno
 * solo oscilla troppo per dire qualcosa.
 *
 * Se manca anche uno dei 7 giorni la media NON si calcola: una media su 5
 * giorni presentata come "ultimi 7" sarebbe un numero diverso da quello
 * dichiarato. La scheda lo dice invece di stimare.
 */

import {
  CHOKEPOINT_BASELINES,
  baselineFor,
  transitState,
  type TransitState,
} from "@/lib/chokepointHistory";

export type ChokepointKey = keyof typeof CHOKEPOINT_BASELINES;

/** Nomi in italiano, nell'ordine in cui compaiono in pagina. */
export const CHOKEPOINT_NAMES: Record<ChokepointKey, string> = {
  hormuz: "Stretto di Hormuz",
  bab_el_mandeb: "Stretto di Bab el-Mandeb",
  suez: "Canale di Suez",
};

/** Nomi brevi, per la mappa e la fascia della home. */
export const CHOKEPOINT_SHORT_NAMES: Record<ChokepointKey, string> = {
  hormuz: "Hormuz",
  bab_el_mandeb: "Bab el-Mandeb",
  suez: "Suez",
};

const MONTH_NAMES = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

export const WINDOW_DAYS = 7;

export type ChokepointRow = {
  chokepoint: string;
  /** Giorno del dato, "AAAA-MM-GG". */
  date: string;
  transitCalls: number;
  /** Campo `capacity` della fonte (carico stimato, tonnellate metriche),
   * già convertito in numero; null se assente. */
  tradeVolumeEst: number | null;
};

/**
 * La capacità dell'ultimo giorno, in tre casi distinti:
 * - `value`: la fonte dà una stima;
 * - `not_available`: la fonte scrive 0 ma quel giorno sono passate navi.
 *   Non può essere "capacità nulla" (11 giorni così a Hormuz nello
 *   storico): è una stima che la fonte non ha calcolato, e va detto così;
 * - `missing`: il campo è vuoto.
 */
export type CapacityReading =
  | { kind: "value"; value: number }
  | { kind: "not_available" }
  | { kind: "missing" };

export type ChokepointSummary = {
  key: ChokepointKey;
  name: string;
  /** Ultimo giorno pubblicato, "AAAA-MM-GG". */
  latestDate: string;
  latestTransits: number;
  /** Primo giorno della finestra di 7. */
  windowFrom: string;
  /** Media dei 7 giorni; null se ne manca qualcuno. */
  mean7: number | null;
  /** Il "normale" per l'ultimo giorno (vedi baselineFor). */
  baseline: number;
  /**
   * "normale di settembre" (stagionale) o "normale" (piatta), senza
   * articolo: la frase lo aggiunge ("contro le 98,1 del normale di
   * settembre"), l'etichetta della scheda mette la maiuscola.
   */
  baselineLabel: string;
  method: "stagionale" | "piatta";
  deviationPct: number | null;
  state: TransitState | null;
  capacity: CapacityReading;
};

const DAY_MS = 86_400_000;

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function capacityReading(transitCalls: number, est: number | null): CapacityReading {
  if (est === null || Number.isNaN(est)) return { kind: "missing" };
  if (est === 0 && transitCalls > 0) return { kind: "not_available" };
  return { kind: "value", value: est };
}

/**
 * La situazione di un passaggio dalle sue righe recenti (in qualunque
 * ordine). `null` se non c'è nessuna riga: la pagina mostra allora uno
 * stato vuoto, non una scheda con numeri inventati.
 */
export function summarizeChokepoint(
  key: ChokepointKey,
  rows: ChokepointRow[]
): ChokepointSummary | null {
  const own = rows.filter((r) => r.chokepoint === key);
  if (own.length === 0) return null;

  const byDate = new Map(own.map((r) => [r.date, r]));
  const latestDate = [...byDate.keys()].sort().at(-1) as string;
  const latest = byDate.get(latestDate) as ChokepointRow;

  const windowDates = Array.from({ length: WINDOW_DAYS }, (_, i) =>
    shiftDate(latestDate, i - (WINDOW_DAYS - 1))
  );
  const windowValues = windowDates.map((d) => byDate.get(d)?.transitCalls);
  const complete = windowValues.every((v) => v !== undefined);
  const mean7 = complete
    ? (windowValues as number[]).reduce((s, v) => s + v, 0) / WINDOW_DAYS
    : null;

  const baselineDef = CHOKEPOINT_BASELINES[key];
  const baseline = baselineFor(baselineDef, latestDate);
  const deviationPct = mean7 === null ? null : (mean7 / baseline - 1) * 100;

  return {
    key,
    name: CHOKEPOINT_NAMES[key],
    latestDate,
    latestTransits: latest.transitCalls,
    windowFrom: windowDates[0],
    mean7,
    baseline,
    baselineLabel:
      baselineDef.method === "stagionale"
        ? `normale di ${MONTH_NAMES[Number(latestDate.slice(5, 7)) - 1]}`
        : "normale",
    method: baselineDef.method,
    deviationPct,
    state: deviationPct === null ? null : transitState(deviationPct, baselineDef.reducedBelowPct),
    capacity: capacityReading(latest.transitCalls, latest.tradeVolumeEst),
  };
}

/** Tutti i passaggi seguiti, nell'ordine di CHOKEPOINT_NAMES; salta quelli senza dati. */
export function summarizeChokepoints(rows: ChokepointRow[]): ChokepointSummary[] {
  return (Object.keys(CHOKEPOINT_NAMES) as ChokepointKey[])
    .map((key) => summarizeChokepoint(key, rows))
    .filter((s): s is ChokepointSummary => s !== null);
}

/** Il passaggio più lontano dal normale (per la cifra chiave), o null. */
export function furthestFromNormal(summaries: ChokepointSummary[]): ChokepointSummary | null {
  const withDev = summaries.filter((s) => s.deviationPct !== null);
  if (withDev.length === 0) return null;
  return withDev.reduce((a, b) =>
    Math.abs(b.deviationPct as number) > Math.abs(a.deviationPct as number) ? b : a
  );
}
