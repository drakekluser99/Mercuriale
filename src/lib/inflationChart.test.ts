import { describe, expect, it } from "vitest";
import type { NicRow } from "./inflation";
import { buildInflationChart, pointsForWindow, seriesKey } from "./inflationChart";

const rows: NicRow[] = [
  // In disordine apposta.
  { category: "00", month: "2026-01", baseYear: 2025, indexValue: 100.4, yoyChangePct: 1 },
  { category: "00", month: "2025-12", baseYear: 2015, indexValue: 122.6, yoyChangePct: 1.2 },
  { category: "ENRGY", month: "2025-12", baseYear: 2015, indexValue: 146.1, yoyChangePct: -4.5 },
  // Una categoria che la pagina non segue: ignorata, non fa saltare niente.
  { category: "04", month: "2025-12", baseYear: 2015, indexValue: 150, yoyChangePct: 5 },
];

describe("buildInflationChart", () => {
  const points = buildInflationChart(rows);

  it("un punto per mese, in ordine", () => {
    expect(points.map((p) => p.month)).toEqual(["2025-12", "2026-01"]);
  });

  it("porta l'indice nella base 2025 e lascia la variazione com'è", () => {
    const dec = points[0];
    expect(dec[seriesKey("index", "00")]).toBeCloseTo(100.0, 1);
    expect(dec[seriesKey("index", "ENRGY")]).toBeCloseTo(97.3, 1);
    expect(dec[seriesKey("yoy", "ENRGY")]).toBe(-4.5);
  });

  it("una serie assente in un mese vale null, non zero", () => {
    const jan = points[1];
    expect(jan[seriesKey("yoy", "ENRGY")]).toBeNull();
    expect(jan[seriesKey("index", "FOODHPC")]).toBeNull();
    expect(jan[seriesKey("index", "00")]).toBe(100.4);
  });
});

describe("pointsForWindow", () => {
  const many = Array.from({ length: 128 }, (_, i) => ({ month: `m${String(i).padStart(3, "0")}` }));

  it("1 anno = 13 mesi, per avere anche lo stesso mese dell'anno prima", () => {
    const w = pointsForWindow(many, "1a");
    expect(w).toHaveLength(13);
    expect(w.at(-1)?.month).toBe("m127");
  });

  it("5 anni = 61 mesi; dal 2016 = tutto", () => {
    expect(pointsForWindow(many, "5a")).toHaveLength(61);
    expect(pointsForWindow(many, "tutto")).toHaveLength(128);
  });
});
