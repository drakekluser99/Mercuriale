/**
 * Punti del grafico dell'inflazione (24 set 2026, passo 2 della UI).
 * Puro, niente React: lo usa il componente InflationChart e i test.
 *
 * UN elenco di punti, uno per mese, con dentro tutte le serie e tutte e
 * due le misure: il grafico cambia misura o periodo senza rifare calcoli e
 * senza chiedere niente al server (sono poche centinaia di righe).
 */

import type { NicCategoryCode } from "./fetchers/istatNic";
import { INFLATION_SERIES, type NicRow } from "./inflation";
import { toBase2025 } from "./nicSplice";

export type InflationMeasure = "yoy" | "index";

/** Chiave di una serie nel punto: "yoy_00", "index_ENRGY"… */
export function seriesKey(measure: InflationMeasure, code: NicCategoryCode): string {
  return `${measure}_${code}`;
}

export type InflationChartPoint = { month: string } & Record<string, number | null | string>;

/**
 * I periodi del grafico. Non quelli degli altri grafici (1 mese, 3 mesi):
 * con un dato al mese avrebbero uno o tre punti. `months` = quanti mesi
 * mostrare contando l'ultimo; null = tutto lo storico.
 */
export const INFLATION_WINDOWS = [
  { key: "1a", label: "1 anno", months: 13 },
  { key: "5a", label: "5 anni", months: 61 },
  { key: "tutto", label: "Dal 2016", months: null },
] as const;

export type InflationWindowKey = (typeof INFLATION_WINDOWS)[number]["key"];

/**
 * Un punto per mese, in ordine. L'indice è già nella base 2025 (null se
 * il raccordo di quella serie non è fissato); la variazione è quella di
 * ISTAT. Un mese in cui una serie manca ha `null` per quella serie: la
 * linea si interrompe invece di inventare un valore.
 */
export function buildInflationChart(rows: readonly NicRow[]): InflationChartPoint[] {
  const byMonth = new Map<string, InflationChartPoint>();
  for (const r of rows) {
    const s = INFLATION_SERIES.find((x) => x.code === r.category);
    if (!s) continue;
    const point = byMonth.get(r.month) ?? emptyPoint(r.month);
    point[seriesKey("yoy", s.code)] = r.yoyChangePct;
    point[seriesKey("index", s.code)] = toBase2025(s.code, r.baseYear, r.indexValue);
    byMonth.set(r.month, point);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function emptyPoint(month: string): InflationChartPoint {
  const p: InflationChartPoint = { month };
  for (const s of INFLATION_SERIES) {
    p[seriesKey("yoy", s.code)] = null;
    p[seriesKey("index", s.code)] = null;
  }
  return p;
}

/** Gli ultimi punti del periodo scelto (i mesi sono già in ordine). */
export function pointsForWindow(
  points: readonly InflationChartPoint[],
  key: InflationWindowKey
): InflationChartPoint[] {
  const w = INFLATION_WINDOWS.find((x) => x.key === key);
  if (!w || w.months === null) return [...points];
  return points.slice(-w.months);
}
