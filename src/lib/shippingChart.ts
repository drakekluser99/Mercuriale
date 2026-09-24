/**
 * Dati del grafico "transiti + Brent" della pagina /traffico-marittimo
 * (passo 2 della UI, 24 set 2026). File PURO: niente database e niente
 * React, lo usano la pagina, /api/history e i test.
 *
 * Forma scelta: UN solo elenco di punti per giorno, con dentro transiti,
 * normale e Brent. I due grafici (transiti sopra, Brent sotto) leggono lo
 * stesso elenco: l'asse del tempo è identico per costruzione, e il
 * tooltip di recharts (`syncId`, sincronizzato per posizione) indica lo
 * stesso giorno in entrambi. Con due elenchi separati basterebbe un giorno
 * in più in uno dei due (il Brent non ha i fine settimana, PortWatch sì)
 * per disallineare tutto.
 *
 * Cosa si disegna:
 * - TRANSITI: la media mobile a 7 giorni che finisce in quel giorno, la
 *   stessa misura delle schede. Il dato giornaliero oscilla troppo (Hormuz
 *   in un settembre normale: da 61 a 129 navi) e su un anno diventerebbe
 *   una macchia. Se manca anche un giorno dei 7, il punto è vuoto (null):
 *   la linea si interrompe invece di inventare;
 * - NORMALE: `baselineFor` del giorno (a gradini mese per mese per Hormuz,
 *   piatto per Bab el-Mandeb), la linea tratteggiata;
 * - BRENT: il prezzo di quel giorno, vuoto nei giorni senza quotazione.
 *
 * Sui periodi lunghi i giorni si raggruppano a blocchi (stesso principio
 * di `downsampleSeries` in historyWindows.ts): ogni blocco diventa un
 * punto con la media dei valori presenti e la data dell'ultimo giorno.
 */

import { baselineFor, CHOKEPOINT_BASELINES } from "@/lib/chokepointHistory";
import {
  CHOKEPOINT_NAMES,
  WINDOW_DAYS,
  type ChokepointKey,
  type ChokepointRow,
} from "@/lib/chokepointStatus";
import { MAX_POINTS_PER_SERIES } from "@/lib/historyWindows";

export type DayValue = { date: string; value: number };

export type ShippingChartPoint = {
  /** Ultimo giorno del punto, "AAAA-MM-GG". */
  date: string;
  /** Media mobile a 7 giorni dei transiti; null se non calcolabile. */
  transits: number | null;
  /** Transiti "normali" per quel giorno. */
  normal: number;
  /** Brent, USD/barile; null nei giorni senza quotazione. */
  brent: number | null;
};

export type ShippingChartSeries = {
  key: ChokepointKey;
  name: string;
  points: ShippingChartPoint[];
  /** Quanti giorni riassume ogni punto (1 = nessun raggruppamento). */
  blockDays: number;
  /** Ultimo giorno con un dato di transito, per dire dove finisce la linea. */
  latestTransitDate: string | null;
  /**
   * true se il grafico parte dopo il giorno chiesto perché lo storico dei
   * transiti comincia dopo (PortWatch dal 2019: "10 anni" ne mostra meno).
   */
  startsLate: boolean;
};

const DAY_MS = 86_400_000;

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Le serie del grafico, una per passaggio seguito, dal giorno `from`
 * (compreso) all'ultimo giorno con un dato (transiti o Brent). Se lo
 * storico dei transiti comincia dopo `from`, il grafico parte dal primo
 * transito: altrimenti anni di Brent e di linea del "normale" senza
 * nessun dato di traffico sotto farebbero pensare a un buco della fonte.
 *
 * `rows` deve partire almeno 6 giorni prima di `from`, altrimenti i primi
 * giorni non hanno la loro media a 7 giorni (e restano vuoti, non stimati).
 */
export function buildShippingChart(
  rows: ChokepointRow[],
  brent: DayValue[],
  from: string,
  maxPoints: number = MAX_POINTS_PER_SERIES
): ShippingChartSeries[] {
  if (maxPoints < 1) throw new Error("maxPoints deve essere almeno 1");

  if (rows.length === 0) return [];
  const firstTransit = rows.map((r) => r.date).sort()[0];
  const start = firstTransit > from ? firstTransit : from;

  const brentByDate = new Map(brent.map((p) => [p.date, p.value]));
  const lastDates = [...rows.map((r) => r.date), ...brent.map((p) => p.date)].filter(
    (d) => d >= start
  );
  if (lastDates.length === 0) return [];
  const to = lastDates.sort().at(-1) as string;

  const days: string[] = [];
  for (let d = start; d <= to; d = shiftDate(d, 1)) days.push(d);
  const blockDays = Math.ceil(days.length / maxPoints);

  return (Object.keys(CHOKEPOINT_NAMES) as ChokepointKey[]).flatMap((key) => {
    const own = rows.filter((r) => r.chokepoint === key);
    if (own.length === 0) return [];
    const byDate = new Map(own.map((r) => [r.date, r.transitCalls]));
    const baseline = CHOKEPOINT_BASELINES[key];

    const daily = days.map((date) => {
      const window: number[] = [];
      for (let k = WINDOW_DAYS - 1; k >= 0; k--) {
        const v = byDate.get(shiftDate(date, -k));
        if (v !== undefined) window.push(v);
      }
      return {
        date,
        transits: window.length === WINDOW_DAYS ? (mean(window) as number) : null,
        normal: baselineFor(baseline, date),
        brent: brentByDate.get(date) ?? null,
      };
    });

    const points: ShippingChartPoint[] = [];
    for (let i = 0; i < daily.length; i += blockDays) {
      const block = daily.slice(i, i + blockDays);
      const present = (pick: (p: ShippingChartPoint) => number | null) =>
        block.map(pick).filter((v): v is number => v !== null);
      points.push({
        date: block[block.length - 1].date,
        transits: mean(present((p) => p.transits)),
        normal: mean(block.map((p) => p.normal)) as number,
        brent: mean(present((p) => p.brent)),
      });
    }

    const transitDates = own.map((r) => r.date).sort();
    return [
      {
        key,
        name: CHOKEPOINT_NAMES[key],
        points,
        blockDays,
        latestTransitDate: transitDates.at(-1) ?? null,
        startsLate: start > from,
      },
    ];
  });
}
