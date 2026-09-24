/**
 * Inflazione in Italia (ISTAT, NIC): dai valori salvati alle schede della
 * pagina /inflazione (24 set 2026). Puro, niente database: si prova con
 * righe finte, come chokepointStatus.ts.
 *
 * Due numeri per serie, con due ruoli diversi (decisione del 24/9):
 * - la VARIAZIONE ANNUA dell'ultimo mese è il numero principale: è
 *   "l'inflazione" dei comunicati, e ISTAT la pubblica già calcolata;
 * - l'INDICE serve ai confronti nel tempo: portato nella base 2025 con il
 *   raccordo (nicSplice.ts), dice di quanto sono cambiati i prezzi dal
 *   primo mese dello storico.
 */

import type { NicCategoryCode } from "./fetchers/istatNic";
import { toBase2025 } from "./nicSplice";

export type NicRow = {
  category: string;
  /** "AAAA-MM" */
  month: string;
  baseYear: number;
  indexValue: number;
  yoyChangePct: number | null;
};

/**
 * Le serie nell'ordine in cui compaiono sulla pagina, con nomi da lettore
 * e non quelli tecnici della classificazione: "carrello della spesa" è il
 * nome con cui ISTAT stesso lo chiama nei comunicati. `detail` dice cosa
 * contiene, perché "carrello" da solo non lo spiega.
 */
export const INFLATION_SERIES: readonly {
  code: NicCategoryCode;
  name: string;
  detail: string;
}[] = [
  { code: "00", name: "Indice generale", detail: "tutti i beni e i servizi del paniere" },
  {
    code: "FOODHPC",
    name: "Carrello della spesa",
    detail: "beni alimentari, per la cura della casa e della persona",
  },
  {
    code: "01",
    name: "Alimentari e bevande",
    detail: "prodotti alimentari e bevande analcoliche",
  },
  {
    code: "ENRGY",
    name: "Beni energetici",
    detail: "elettricità, gas, carburanti e altri combustibili",
  },
];

export type InflationSummary = {
  code: NicCategoryCode;
  name: string;
  detail: string;
  /** Ultimo mese pubblicato, "AAAA-MM". */
  month: string;
  /** Variazione % sullo stesso mese dell'anno prima, come pubblicata da ISTAT. */
  yoyChangePct: number | null;
  /** Indice dell'ultimo mese nella base 2025 (2025 = 100). */
  index: number | null;
  /** Primo mese dello storico, "AAAA-MM". */
  since: string;
  /**
   * Variazione % dell'indice dal primo mese dello storico all'ultimo, sulla
   * serie raccordata. Null se manca un coefficiente di raccordo: meglio
   * nessun numero che uno calcolato su due scale diverse.
   */
  sinceChangePct: number | null;
};

/**
 * Una scheda per ogni serie di `INFLATION_SERIES` che ha almeno un mese.
 * Le serie assenti non compaiono (non si inventa una scheda vuota).
 */
export function summarizeInflation(rows: readonly NicRow[]): InflationSummary[] {
  const out: InflationSummary[] = [];
  for (const s of INFLATION_SERIES) {
    const series = rows
      .filter((r) => r.category === s.code)
      .sort((a, b) => a.month.localeCompare(b.month));
    if (series.length === 0) continue;

    const first = series[0];
    const last = series[series.length - 1];
    const firstIndex = toBase2025(s.code, first.baseYear, first.indexValue);
    const lastIndex = toBase2025(s.code, last.baseYear, last.indexValue);

    out.push({
      code: s.code,
      name: s.name,
      detail: s.detail,
      month: last.month,
      yoyChangePct: last.yoyChangePct,
      index: lastIndex,
      since: first.month,
      sinceChangePct:
        firstIndex !== null && lastIndex !== null && firstIndex !== 0
          ? (lastIndex / firstIndex - 1) * 100
          : null,
    });
  }
  return out;
}
