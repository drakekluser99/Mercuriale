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

// ─── Baseline del "traffico normale" ──────────────────────────────────────
//
// Due metodi, perché i due passaggi si comportano in modo diverso nei dati
// (analisi del 24 set 2026 sullo storico dal 2019):
//
// - STAGIONALE: un valore per ogni mese dell'anno. Serve dove il traffico
//   ha un ciclo annuale (Hormuz: circa 70-80 navi al giorno d'inverno,
//   circa 100 d'estate). Con un valore unico, ogni inverno normale
//   sembrerebbe un'anomalia.
// - PIATTO: un valore unico. Dove il ciclo non c'è (Bab el-Mandeb), un
//   valore per mese aggiungerebbe solo rumore.
//
// In entrambi i casi la media è sui singoli GIORNI del periodo (ogni giorno
// pesa uguale), e il calcolo si ferma se ne manca anche uno: una media su
// meno dati di quelli dichiarati sarebbe un riferimento diverso da quello
// scritto in metodologia.

/** Periodo di riferimento, estremi inclusi, "AAAA-MM-GG". */
export type BaselinePeriod = { from: string; to: string };

export type BaselineValue = {
  mean: number;
  /** Giorni effettivamente usati. */
  days: number;
  min: number;
  max: number;
};

export type SeasonalBaseline = ({ month: number } & BaselineValue)[];

/** Tutti i giorni del periodo, estremi inclusi. */
function daysIn(period: BaselinePeriod): string[] {
  const out: string[] = [];
  for (let t = toUtcMs(period.from); t <= toUtcMs(period.to); t += DAY_MS) {
    out.push(fromUtcMs(t));
  }
  return out;
}

/**
 * I valori dei giorni richiesti, controllando che ci siano TUTTI e una
 * volta sola. Lancia un errore con i primi giorni mancanti.
 */
function valuesFor(points: DailyTransits[], wanted: string[]): number[] {
  const byDate = new Map<string, number>();
  for (const p of points) {
    if (byDate.has(p.date)) throw new Error(`Baseline: il giorno ${p.date} compare due volte`);
    byDate.set(p.date, p.transitCalls);
  }
  const missing = wanted.filter((d) => !byDate.has(d));
  if (missing.length > 0) {
    throw new Error(
      `Baseline: mancano ${missing.length} giorni del periodo (es. ${missing.slice(0, 5).join(", ")})`
    );
  }
  return wanted.map((d) => byDate.get(d) as number);
}

function summarize(values: number[]): BaselineValue {
  return {
    mean: values.reduce((s, v) => s + v, 0) / values.length,
    days: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/** Un valore unico: la media di tutti i giorni del periodo. */
export function flatBaseline(points: DailyTransits[], period: BaselinePeriod): BaselineValue {
  const days = daysIn(period);
  if (days.length === 0) throw new Error("Baseline: periodo vuoto");
  return summarize(valuesFor(points, days));
}

/**
 * Un valore per mese dell'anno (1 = gennaio): la media dei giorni del
 * periodo che cadono in quel mese. Il periodo deve coprire tutti e dodici
 * i mesi, altrimenti un mese resterebbe senza riferimento.
 */
export function seasonalBaseline(
  points: DailyTransits[],
  period: BaselinePeriod
): SeasonalBaseline {
  const days = daysIn(period);
  const values = valuesFor(points, days);
  const byMonth = new Map<number, number[]>();
  days.forEach((d, i) => {
    const m = Number(d.slice(5, 7));
    const list = byMonth.get(m) ?? [];
    list.push(values[i]);
    byMonth.set(m, list);
  });
  if (byMonth.size !== 12) {
    throw new Error(`Baseline stagionale: il periodo copre ${byMonth.size} mesi su 12`);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([month, list]) => ({ month, ...summarize(list) }));
}
