import { describe, expect, it } from "vitest";
import {
  capacityReading,
  furthestFromNormal,
  summarizeChokepoint,
  summarizeChokepoints,
  type ChokepointRow,
} from "./chokepointStatus";

/** Sette giorni consecutivi che finiscono il 20/9/2026. */
function week(chokepoint: string, values: number[], capacity: number | null = 1000): ChokepointRow[] {
  return values.map((v, i) => ({
    chokepoint,
    date: `2026-09-${String(14 + i).padStart(2, "0")}`,
    transitCalls: v,
    tradeVolumeEst: capacity,
  }));
}

describe("summarizeChokepoint", () => {
  it("media dei 7 giorni contro il normale del mese dell'ultimo dato (Hormuz, settembre)", () => {
    // Stessa media della settimana vera 14–20/9/2026 (3,14; 1 nave il 20/9):
    // i singoli giorni intermedi sono di fantasia.
    const s = summarizeChokepoint("hormuz", week("hormuz", [2, 7, 4, 3, 2, 3, 1]));
    expect(s?.latestDate).toBe("2026-09-20");
    expect(s?.windowFrom).toBe("2026-09-14");
    expect(s?.latestTransits).toBe(1);
    expect(s?.mean7).toBeCloseTo(22 / 7, 6);
    expect(s?.baseline).toBe(98.1);
    expect(s?.baselineLabel).toBe("normale di settembre");
    expect(s?.deviationPct).toBeCloseTo(-96.8, 1);
    expect(s?.state).toBe("fortemente_ridotto");
  });

  it("baseline piatta per Bab el-Mandeb", () => {
    const s = summarizeChokepoint("bab_el_mandeb", week("bab_el_mandeb", [75, 75, 75, 75, 75, 75, 75]));
    expect(s?.baseline).toBe(74.8);
    expect(s?.baselineLabel).toBe("normale");
    expect(s?.state).toBe("normale");
  });

  it("con un giorno mancante nella finestra non calcola media né stato", () => {
    const rows = week("hormuz", [90, 90, 90, 90, 90, 90, 90]).filter((r) => r.date !== "2026-09-16");
    const s = summarizeChokepoint("hormuz", rows);
    expect(s?.latestDate).toBe("2026-09-20");
    expect(s?.mean7).toBeNull();
    expect(s?.deviationPct).toBeNull();
    expect(s?.state).toBeNull();
  });

  it("ignora le righe di altri passaggi e l'ordine di arrivo", () => {
    const rows = [...week("bab_el_mandeb", [1, 1, 1, 1, 1, 1, 1]), ...week("hormuz", [98, 98, 98, 98, 98, 98, 98]).reverse()];
    const s = summarizeChokepoint("hormuz", rows);
    expect(s?.mean7).toBe(98);
    expect(s?.state).toBe("normale");
  });

  it("null senza righe", () => {
    expect(summarizeChokepoint("hormuz", [])).toBeNull();
  });
});

describe("capacityReading", () => {
  it("0 con navi transitate = stima non disponibile, non capacità nulla", () => {
    expect(capacityReading(2, 0)).toEqual({ kind: "not_available" });
  });
  it("0 senza navi = zero vero", () => {
    expect(capacityReading(0, 0)).toEqual({ kind: "value", value: 0 });
  });
  it("campo vuoto", () => {
    expect(capacityReading(5, null)).toEqual({ kind: "missing" });
  });
});

describe("summarizeChokepoints / furthestFromNormal", () => {
  it("ordine fisso (Hormuz prima) e sceglie lo scostamento più ampio", () => {
    const rows = [
      ...week("bab_el_mandeb", [25, 25, 25, 25, 25, 25, 25]),
      ...week("hormuz", [3, 3, 3, 3, 3, 3, 3]),
    ];
    const all = summarizeChokepoints(rows);
    expect(all.map((s) => s.key)).toEqual(["hormuz", "bab_el_mandeb"]);
    expect(furthestFromNormal(all)?.key).toBe("hormuz");
  });
  it("null se nessun passaggio ha una media", () => {
    expect(furthestFromNormal([])).toBeNull();
  });
});
