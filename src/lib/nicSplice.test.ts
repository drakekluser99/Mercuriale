import { describe, expect, it } from "vitest";
import {
  CALCULATED_SPLICE_2015_TO_2025,
  checkSplice,
  computeSpliceCoefficient,
  spliceCoefficient,
  toBase2025,
} from "./nicSplice";

// I 12 mesi del 2025 in base 2015, con media `mean` (tutti uguali: per il
// coefficiente conta solo la media). Il 2025 in base 2025 viene ignorato.
function year2025(mean: number) {
  return Array.from({ length: 12 }, (_, i) => ({
    month: `2025-${String(i + 1).padStart(2, "0")}`,
    baseYear: 2015,
    indexValue: mean,
  }));
}

describe("computeSpliceCoefficient", () => {
  it("riproduce i coefficienti ufficiali dalle medie 2025 verificate il 24/9", () => {
    // Medie 2025 in base 2015 calcolate sui dati ISTAT durante la
    // ricognizione: generale 122,63, alimentari 134,41.
    expect(computeSpliceCoefficient(year2025(122.63))).toBe(1.226);
    expect(computeSpliceCoefficient(year2025(134.41))).toBe(1.344);
  });

  it("usa la media dei mesi, non un mese solo", () => {
    const rows = year2025(120).map((r, i) => (i === 11 ? { ...r, indexValue: 132 } : r));
    // (11 × 120 + 132) / 12 = 121 → 1,21
    expect(computeSpliceCoefficient(rows)).toBe(1.21);
  });

  it("ignora gli altri anni e la base 2025", () => {
    const rows = [
      ...year2025(122.63),
      { month: "2024-12", baseYear: 2015, indexValue: 999 },
      { month: "2025-06", baseYear: 2025, indexValue: 1 },
    ];
    // Il 2025-06 in base 2025 NON è un doppione del 2025-06 in base 2015.
    expect(computeSpliceCoefficient(rows)).toBe(1.226);
  });

  it("arrotonda alla terza decimale", () => {
    expect(computeSpliceCoefficient(year2025(122.65))).toBe(1.227);
    expect(computeSpliceCoefficient(year2025(122.64))).toBe(1.226);
  });

  it("si ferma se manca un mese o se un mese è ripetuto", () => {
    expect(() => computeSpliceCoefficient(year2025(122.63).slice(0, 11))).toThrow(/2025-12/);
    const doubled = [...year2025(122.63), { month: "2025-03", baseYear: 2015, indexValue: 1 }];
    expect(() => computeSpliceCoefficient(doubled)).toThrow(/2025-03 compare due volte/);
  });
});

describe("checkSplice", () => {
  const data = {
    "00": year2025(122.63),
    "01": year2025(134.41),
    FOODHPC: year2025(130.02),
    ENRGY: year2025(150.4),
  };

  it("con il metodo verificato restituisce i valori da fissare per gli aggregati", () => {
    const report = checkSplice(data);
    expect(report.map((r) => [r.category, r.kind, r.computed, r.matches])).toEqual([
      ["00", "ufficiale", 1.226, true],
      ["01", "ufficiale", 1.344, true],
      // Non ancora fissati nel codice: matches false, lo script lo dice.
      ["FOODHPC", "calcolato", 1.3, CALCULATED_SPLICE_2015_TO_2025.FOODHPC === 1.3],
      ["ENRGY", "calcolato", 1.504, CALCULATED_SPLICE_2015_TO_2025.ENRGY === 1.504],
    ]);
  });

  it("si ferma se il calcolo non riproduce un coefficiente ufficiale", () => {
    // 122,75 → 1,228 invece di 1,226.
    expect(() => checkSplice({ ...data, "00": year2025(122.75) })).toThrow(
      /per 00 il calcolo dà 1.228 ma il coefficiente ufficiale è 1.226/
    );
  });
});

describe("toBase2025", () => {
  it("lascia com'è un indice già in base 2025", () => {
    expect(toBase2025("ENRGY", 2025, 114.3)).toBe(114.3);
  });

  it("divide per il coefficiente ufficiale: dicembre 2025 torna a circa 100", () => {
    // Valori veri della query 9.
    expect(toBase2025("00", 2015, 122.6)).toBeCloseTo(100.0, 1);
    expect(toBase2025("01", 2015, 135.2)).toBeCloseTo(100.6, 1);
  });

  it("usa i coefficienti calcolati fissati il 24/9 (valori veri di dicembre 2025)", () => {
    expect(spliceCoefficient("FOODHPC")).toEqual({ value: 1.301, kind: "calcolato" });
    // Query 9: carrello 130,5 e energetici 146,1 in base 2015.
    expect(toBase2025("FOODHPC", 2015, 130.5)).toBeCloseTo(100.3, 1);
    // Gli energetici erano scesi nel 2025 (−4,5% a dicembre): sotto 100.
    expect(toBase2025("ENRGY", 2015, 146.1)).toBeCloseTo(97.3, 1);
  });

  it("senza coefficiente fissato restituisce null, non un numero inventato", () => {
    if (CALCULATED_SPLICE_2015_TO_2025.ENRGY === null) {
      expect(toBase2025("ENRGY", 2015, 146.1)).toBeNull();
      expect(spliceCoefficient("ENRGY")).toBeNull();
    }
    expect(spliceCoefficient("00")).toEqual({ value: 1.226, kind: "ufficiale" });
  });

  it("rifiuta basi diverse da 2015 e 2025", () => {
    expect(() => toBase2025("00", 2010, 100)).toThrow(/base 2010 non gestita/);
  });
});
