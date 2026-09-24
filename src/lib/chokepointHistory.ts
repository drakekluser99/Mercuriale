/**
 * Analisi pura dello storico dei transiti (24 set 2026): niente rete e
 * niente database, così si prova con dati finti. La usa
 * scripts/backfill-chokepoints.ts per due cose:
 *
 * 1. controllare che il calendario sia continuo prima di salvare
 *    (`findDateGaps`);
 * 2. mostrare le medie mensili e i valori giornalieri attorno a una data
 *    (`monthlyAverages`, `dailyWindow`), per scegliere a occhio, sui dati,
 *    il periodo "pre-crisi" da usare come riferimento del traffico normale.
 *
 * Il riferimento NON si calcola qui in automatico: dove inizia una crisi
 * è una scelta da motivare in metodologia, non l'uscita di un algoritmo.
 */

export type DailyTransits = { date: string; transitCalls: number };

export type DateGap = {
  /** Primo giorno mancante, "AAAA-MM-GG". */
  from: string;
  /** Ultimo giorno mancante, "AAAA-MM-GG". */
  to: string;
  days: number;
};

const DAY_MS = 86_400_000;

function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * I giorni che mancano fra la prima e l'ultima data, raggruppati in
 * intervalli consecutivi. Un elenco vuoto vuol dire calendario continuo.
 */
export function findDateGaps(dates: string[]): DateGap[] {
  const sorted = [...new Set(dates)].sort();
  const gaps: DateGap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = toUtcMs(sorted[i - 1]);
    const curr = toUtcMs(sorted[i]);
    const missing = Math.round((curr - prev) / DAY_MS) - 1;
    if (missing > 0) {
      gaps.push({ from: fromUtcMs(prev + DAY_MS), to: fromUtcMs(curr - DAY_MS), days: missing });
    }
  }
  return gaps;
}

export type MonthlyAverage = {
  /** "AAAA-MM" */
  month: string;
  days: number;
  mean: number;
  min: number;
  max: number;
};

/**
 * Media, minimo e massimo dei transiti giornalieri per mese. Il mese
 * porta anche quanti giorni ha davvero (`days`): un mese con dieci giorni
 * di dati non è confrontabile con uno completo, e deve vedersi.
 */
export function monthlyAverages(points: DailyTransits[]): MonthlyAverage[] {
  const byMonth = new Map<string, number[]>();
  for (const p of points) {
    const m = p.date.slice(0, 7);
    const list = byMonth.get(m) ?? [];
    list.push(p.transitCalls);
    byMonth.set(m, list);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({
      month,
      days: values.length,
      mean: values.reduce((s, v) => s + v, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    }));
}

/** I valori giornalieri da `weeks` settimane prima a `weeks` dopo `center`. */
export function dailyWindow(
  points: DailyTransits[],
  center: string,
  weeks: number
): DailyTransits[] {
  const c = toUtcMs(center);
  const from = fromUtcMs(c - weeks * 7 * DAY_MS);
  const to = fromUtcMs(c + weeks * 7 * DAY_MS);
  return points
    .filter((p) => p.date >= from && p.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}
