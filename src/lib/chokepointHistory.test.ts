import { describe, expect, it } from "vitest";
import {
  dailyWindow,
  findDateGaps,
  flatBaseline,
  monthlyAverages,
  seasonalBaseline,
} from "./chokepointHistory";

describe("findDateGaps", () => {
  it("calendario continuo: nessun buco", () => {
    expect(findDateGaps(["2024-01-01", "2024-01-02", "2024-01-03"])).toEqual([]);
  });

  it("raggruppa i giorni mancanti consecutivi in un intervallo", () => {
    expect(findDateGaps(["2024-02-27", "2024-03-02", "2024-03-03", "2024-03-05"])).toEqual([
      // attraversa il 29 febbraio del 2024 bisestile
      { from: "2024-02-28", to: "2024-03-01", days: 3 },
      { from: "2024-03-04", to: "2024-03-04", days: 1 },
    ]);
  });

  it("non dipende dall'ordine in ingresso", () => {
    expect(findDateGaps(["2024-01-03", "2024-01-01"])).toEqual([
      { from: "2024-01-02", to: "2024-01-02", days: 1 },
    ]);
  });
});

describe("monthlyAverages", () => {
  it("media, minimo, massimo e giorni per mese", () => {
    const out = monthlyAverages([
      { date: "2023-11-30", transitCalls: 70 },
      { date: "2023-12-01", transitCalls: 40 },
      { date: "2023-12-02", transitCalls: 20 },
    ]);
    expect(out).toEqual([
      { month: "2023-11", days: 1, mean: 70, min: 70, max: 70 },
      { month: "2023-12", days: 2, mean: 30, min: 20, max: 40 },
    ]);
  });
});

describe("dailyWindow", () => {
  it("prende N settimane prima e dopo, estremi inclusi", () => {
    const pts = ["2024-01-01", "2024-01-07", "2024-01-08", "2024-01-15", "2024-01-16"].map(
      (date) => ({ date, transitCalls: 1 })
    );
    expect(dailyWindow(pts, "2024-01-08", 1).map((p) => p.date)).toEqual([
      "2024-01-01",
      "2024-01-07",
      "2024-01-08",
      "2024-01-15",
    ]);
  });
});

/** Serie giornaliera continua con un valore calcolato dalla data. */
function series(from: string, to: string, value: (date: string) => number) {
  const out: { date: string; transitCalls: number }[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push({ date, transitCalls: value(date) });
  }
  return out;
}

describe("flatBaseline", () => {
  it("media sui giorni del periodo, estremi inclusi, ignorando quelli fuori", () => {
    const pts = series("2023-12-10", "2023-12-20", (d) => (d <= "2023-12-15" ? 10 : 99));
    expect(flatBaseline(pts, { from: "2023-12-12", to: "2023-12-15" })).toEqual({
      mean: 10,
      days: 4,
      min: 10,
      max: 10,
    });
  });

  it("si ferma se manca un giorno del periodo", () => {
    const pts = series("2023-01-01", "2023-01-10", () => 5).filter((p) => p.date !== "2023-01-04");
    expect(() => flatBaseline(pts, { from: "2023-01-01", to: "2023-01-10" })).toThrow(
      /mancano 1 giorni.*2023-01-04/
    );
  });

  it("si ferma su un giorno ripetuto", () => {
    const pts = [...series("2023-01-01", "2023-01-02", () => 5), { date: "2023-01-02", transitCalls: 6 }];
    expect(() => flatBaseline(pts, { from: "2023-01-01", to: "2023-01-02" })).toThrow(/due volte/);
  });
});

describe("seasonalBaseline", () => {
  // Valore = numero del mese × 10: ogni mese ha la sua media esatta.
  const pts = series("2022-11-01", "2025-10-31", (d) => Number(d.slice(5, 7)) * 10);
  const out = seasonalBaseline(pts, { from: "2022-11-01", to: "2025-10-31" });

  it("un valore per mese, in ordine da gennaio a dicembre", () => {
    expect(out.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(out.map((m) => m.mean)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  });

  it("tre anni di giorni per mese, febbraio 2024 bisestile compreso", () => {
    expect(out.find((m) => m.month === 2)?.days).toBe(28 + 29 + 28);
    expect(out.find((m) => m.month === 1)?.days).toBe(93);
    expect(out.find((m) => m.month === 4)?.days).toBe(90);
  });

  it("si ferma se il periodo non copre tutti i dodici mesi", () => {
    expect(() => seasonalBaseline(pts, { from: "2023-01-01", to: "2023-06-30" })).toThrow(
      /6 mesi su 12/
    );
  });
});
