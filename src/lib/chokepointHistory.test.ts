import { describe, expect, it } from "vitest";
import { dailyWindow, findDateGaps, monthlyAverages } from "./chokepointHistory";

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
