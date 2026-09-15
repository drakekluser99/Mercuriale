import { describe, expect, it } from "vitest";
import { downsampleSeries, findHistoryWindow } from "./historyWindows";
import type { PriceSeries } from "./priceHistory";

// Serie finta con `n` punti giornalieri e valori 1, 2, 3, ...
function series(n: number): PriceSeries {
  return {
    key: "TEST",
    label: "Test",
    unit: "eur/l",
    points: Array.from({ length: n }, (_, i) => ({
      date: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10),
      value: i + 1,
    })),
  };
}

describe("downsampleSeries", () => {
  it("lascia intatte le serie sotto la soglia", () => {
    const s = series(10);
    expect(downsampleSeries([s], 260)[0]).toBe(s);
  });

  it("non supera mai il numero massimo di punti", () => {
    const [out] = downsampleSeries([series(2500)], 260);
    expect(out.points.length).toBeLessThanOrEqual(260);
    expect(out.points.length).toBeGreaterThan(200);
  });

  it("ogni punto è la media del suo blocco, datato all'ultimo giorno del blocco", () => {
    // 10 punti, massimo 5 → blocchi da 2: (1,2) (3,4) ...
    const [out] = downsampleSeries([series(10)], 5);
    expect(out.points).toHaveLength(5);
    expect(out.points[0]).toEqual({ date: "2020-01-02", value: 1.5 });
    expect(out.points[4]).toEqual({ date: "2020-01-10", value: 9.5 });
  });

  it("l'ultimo punto conserva la data più recente anche con un blocco finale incompleto", () => {
    // 11 punti, massimo 5 → blocchi da 3: l'ultimo ha 2 punti (10, 11)
    const [out] = downsampleSeries([series(11)], 5);
    expect(out.points.at(-1)).toEqual({ date: "2020-01-11", value: 10.5 });
  });

  it("rifiuta un massimo non valido", () => {
    expect(() => downsampleSeries([series(3)], 0)).toThrow();
  });
});

describe("findHistoryWindow", () => {
  it("trova le finestre note e ignora le altre", () => {
    expect(findHistoryWindow("10a")?.days).toBe(3653);
    expect(findHistoryWindow("20a")).toBeUndefined();
  });
});
