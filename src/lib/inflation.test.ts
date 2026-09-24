import { describe, expect, it } from "vitest";
import { formatAtMonth, formatMonthYear } from "./format";
import { summarizeInflation, type NicRow } from "./inflation";

// Valori veri (query 9 del 24/9/2026) più un gennaio 2016 plausibile.
const rows: NicRow[] = [
  { category: "00", month: "2016-01", baseYear: 2015, indexValue: 99.7, yoyChangePct: 0.3 },
  { category: "00", month: "2025-12", baseYear: 2015, indexValue: 122.6, yoyChangePct: 1.2 },
  { category: "00", month: "2026-08", baseYear: 2025, indexValue: 103.9, yoyChangePct: 3.3 },
  { category: "ENRGY", month: "2026-08", baseYear: 2025, indexValue: 114.3, yoyChangePct: 17.1 },
  { category: "ENRGY", month: "2025-12", baseYear: 2015, indexValue: 146.1, yoyChangePct: -4.5 },
];

describe("summarizeInflation", () => {
  const s = summarizeInflation(rows);

  it("una scheda per ogni serie con dati, nell'ordine della pagina", () => {
    // Carrello e alimentari non hanno righe qui: nessuna scheda vuota.
    expect(s.map((x) => x.code)).toEqual(["00", "ENRGY"]);
  });

  it("prende l'ultimo mese anche se le righe arrivano in disordine", () => {
    const energy = s[1];
    expect(energy.month).toBe("2026-08");
    expect(energy.yoyChangePct).toBe(17.1);
    expect(energy.index).toBe(114.3);
    expect(energy.since).toBe("2025-12");
  });

  it("calcola la variazione dal primo mese sulla serie raccordata", () => {
    const general = s[0];
    // 99,7 in base 2015 ÷ 1,226 = 81,32; 103,9 / 81,32 − 1 = +27,8%.
    expect(general.since).toBe("2016-01");
    expect(general.sinceChangePct).toBeCloseTo(27.76, 1);
    // Senza raccordo (103,9 / 99,7) verrebbe +4,2%: il salto di base
    // avrebbe cancellato dieci anni di inflazione.
    expect(general.sinceChangePct).not.toBeCloseTo(4.2, 0);
  });
});

describe("formatMonthYear", () => {
  it("scrive il mese in parole, senza fusi orari", () => {
    expect(formatMonthYear("2026-08")).toBe("agosto 2026");
    expect(formatMonthYear("2016-01")).toBe("gennaio 2016");
    expect(formatMonthYear("2025-12")).toBe("dicembre 2025");
  });
});

describe("formatAtMonth", () => {
  it("mette la d eufonica solo davanti ad agosto e aprile", () => {
    expect(formatAtMonth("2026-08")).toBe("ad agosto 2026");
    expect(formatAtMonth("2026-04")).toBe("ad aprile 2026");
    expect(formatAtMonth("2026-09")).toBe("a settembre 2026");
    expect(formatAtMonth("2026-10")).toBe("a ottobre 2026");
  });
});
