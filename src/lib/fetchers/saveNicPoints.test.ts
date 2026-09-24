import { describe, expect, it, vi } from "vitest";

// `saveNicPoints.ts` importa il client del database, che al caricamento
// vuole DATABASE_URL: qui si prova solo la parte pura, quindi il client si
// sostituisce con un oggetto vuoto.
vi.mock("@/lib/db/client", () => ({ db: {} }));

import { isCorrection } from "./correctionsLog";
import type { NicPoint } from "./istatNic";
import { compareWithSaved, type SavedNicRow } from "./saveNicPoints";

const point = (over: Partial<NicPoint> = {}): NicPoint => ({
  category: "ENRGY",
  month: "2026-08",
  baseYear: 2025,
  indexValue: 114.3,
  yoyChangePct: 17.1,
  ...over,
});

// Come arriva dal database: `numeric` letto da Drizzle è una stringa.
const saved = (over: Partial<SavedNicRow> = {}): SavedNicRow => ({
  category: "ENRGY",
  recordedAt: new Date("2026-08-01T00:00:00Z"),
  baseYear: 2025,
  indexValue: "114.300",
  yoyChangePct: "17.10",
  ...over,
});

describe("compareWithSaved", () => {
  it("un mese mai salvato non produce correzioni", () => {
    expect(compareWithSaved([point()], [], "istat_nic", 1)).toEqual([]);
  });

  it("lo stesso valore riscritto non è una correzione", () => {
    const c = compareWithSaved([point()], [saved()], "istat_nic", 1);
    expect(c).toHaveLength(2);
    expect(c.filter(isCorrection)).toEqual([]);
  });

  it("una revisione ISTAT diventa una correzione, con etichetta e campo", () => {
    const c = compareWithSaved([point({ indexValue: 114.5 })], [saved()], "istat_nic", 7);
    expect(c.filter(isCorrection)).toEqual([
      {
        tableName: "consumer_price_index",
        entityLabel: "NIC ENRGY",
        field: "index_value",
        oldValue: 114.3,
        newValue: 114.5,
        recordedAt: new Date("2026-08-01T00:00:00Z"),
        source: "istat_nic",
        runId: 7,
      },
    ]);
  });

  it("la prima volta che arriva la variazione non è una correzione", () => {
    const c = compareWithSaved([point()], [saved({ yoyChangePct: null })], "istat_nic", 1);
    expect(c.filter(isCorrection)).toEqual([]);
  });

  it("si ferma se un mese salvato arriva in un'altra base", () => {
    expect(() =>
      compareWithSaved(
        [point({ month: "2025-12", baseYear: 2025, indexValue: 98.9 })],
        [saved({ recordedAt: new Date("2025-12-01T00:00:00Z"), baseYear: 2015, indexValue: "146.100" })],
        "istat_nic",
        1
      )
    ).toThrow(/salvato in base 2015 ma arriva in base 2025/);
  });

  it("non confonde serie diverse nello stesso mese", () => {
    const c = compareWithSaved(
      [point({ category: "00", indexValue: 103.9 })],
      [saved()],
      "istat_nic",
      1
    );
    expect(c).toEqual([]);
  });
});
