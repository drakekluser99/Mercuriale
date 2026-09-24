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

// ─── Baseline fissate (24 set 2026) ───────────────────────────────────────

export type ChokepointBaseline =
  | {
      method: "stagionale";
      period: BaselinePeriod;
      /** Primo giorno del nuovo regime di traffico. */
      breakDate: string;
      /** Transiti medi al giorno per mese, indice 0 = gennaio. */
      monthly: readonly number[];
    }
  | {
      method: "piatta";
      period: BaselinePeriod;
      breakDate: string;
      /** Transiti medi al giorno. */
      value: number;
    };

/**
 * Il "traffico normale" di ciascun passaggio, per colorare la mappa e per
 * la metodologia. Calcolato il 24/9/2026 con `npm run chokepoint:baselines`
 * (seasonalBaseline / flatBaseline qui sopra) sui dati giornalieri PortWatch
 * salvati in chokepoint_transits; periodi decisi con Yuri guardando lo
 * storico dal 2019 (medie mensili e giorni attorno alle rotture).
 *
 * NUMERI FISSI, non ricalcolati a ogni richiesta: il riferimento scritto in
 * metodologia deve restare quello anche se un giorno la fonte rivede un
 * dato storico (stesso principio di `weekly_narratives`). Lo script resta
 * come verifica: se ricalcolando i valori non coincidono più, la fonte ha
 * rivisto lo storico, e si decide a mano se aggiornare.
 *
 * HORMUZ — stagionale, 01/11/2022 – 31/10/2025 (1.096 giorni: tre anni
 * pieni, 29/2/2024 compreso). Il traffico ha un ciclo annuale: circa 73-78
 * navi al giorno d'inverno, circa 97-104 da aprile a settembre. Un valore
 * unico farebbe sembrare anomalo ogni inverno normale. Esclusi: 2019-2021,
 * su un livello più basso (circa 55-90, COVID nel 2020), e l'inverno
 * 2025-26, il più basso dal 2019 (nov 67,4 · dic 55,5 · gen 58,5): potrebbe
 * essere un primo segnale della crisi, non lo sappiamo, e resta fuori dal
 * "normale". Rottura il 01/03/2026: 20 transiti, poi 0-7 al giorno per
 * tutto marzo; nessun calo anticipato a febbraio (13-26/2 fra 54 e 127).
 *
 * BAB EL-MANDEB — piatta, 16/12/2022 – 15/12/2023 (365 giorni): l'anno che
 * precede la rottura. Nessun ciclo annuale nei dati (medie mensili 2023
 * fra 70 e 79), ma una crescita lenta dal 2019 (circa 53) al 2023: gli
 * anni più vecchi abbasserebbero il riferimento. Rottura il 16/12/2023:
 * fino al 15/12 valori fra 59 e 95, poi 65, 57, 52... e 31-37 stabili dal
 * 2024. Il 19/11/2023 (59) è un giorno isolato, non l'inizio del calo:
 * prima 84, dopo 72, 87, 84.
 */
export const CHOKEPOINT_BASELINES = {
  hormuz: {
    method: "stagionale",
    period: { from: "2022-11-01", to: "2025-10-31" },
    breakDate: "2026-03-01",
    //        gen    feb    mar    apr     mag     giu     lug    ago    set    ott    nov    dic
    monthly: [73.14, 77.8, 88.28, 99.98, 103.85, 103.04, 99.67, 97.17, 98.1, 91.55, 81.62, 74.88],
  },
  bab_el_mandeb: {
    method: "piatta",
    period: { from: "2022-12-16", to: "2023-12-15" },
    breakDate: "2023-12-16",
    value: 74.8,
  },
} as const satisfies Record<string, ChokepointBaseline>;

/** Il valore "normale" per un giorno: quello del suo mese, o quello unico. */
export function baselineFor(baseline: ChokepointBaseline, date: string): number {
  return baseline.method === "stagionale"
    ? baseline.monthly[Number(date.slice(5, 7)) - 1]
    : baseline.value;
}
