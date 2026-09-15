import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { summarizeEuWeightedAverage, taxSharePercent } from "./euWeightedAverage";
import { parseEuWeightedAverages } from "./fetchers/euOilBulletinHistory";

describe("summarizeEuWeightedAverage", () => {
  it("restituisce null senza righe (tabella ancora vuota)", () => {
    expect(summarizeEuWeightedAverage([])).toBeNull();
  });

  it("converte le stringhe numeriche e tiene null il netto assente", () => {
    const recordedAt = new Date("2026-09-08T00:00:00Z");
    const out = summarizeEuWeightedAverage([
      { fuelType: "petrol", price: "1.7800", priceNet: "0.8000", recordedAt },
      { fuelType: "diesel", price: "1.6500", priceNet: null, recordedAt },
    ]);
    expect(out).toEqual({
      date: "2026-09-08",
      petrol: 1.78,
      diesel: 1.65,
      petrolNet: 0.8,
      dieselNet: null,
    });
  });
});

describe("taxSharePercent", () => {
  it("calcola la quota di imposte e rifiuta i casi senza senso", () => {
    expect(taxSharePercent(2, 1)).toBe(50);
    expect(taxSharePercent(2, null)).toBeNull();
    expect(taxSharePercent(0, 0)).toBeNull();
  });
});

// Un workbook finto con lo stesso layout del file della Commissione:
// riga 1 chiavi, righe 2-3 intestazioni, poi una riga per settimana.
function workbook(aggregatePrefix: string) {
  const wb = new ExcelJS.Workbook();
  const sheets = [
    ["Prices with taxes", "price_with_tax", [1780, 1650]],
    ["Prices wo taxes", "price_wo_tax", [800, 850]],
  ] as const;
  for (const [name, infix, [petrol, diesel]] of sheets) {
    const ws = wb.addWorksheet(name);
    ws.addRow([
      "Date",
      `${aggregatePrefix}_${infix}_euro95`,
      `${aggregatePrefix}_${infix}_diesel`,
    ]);
    ws.addRow(["etichette"]);
    ws.addRow(["Date", "1000 l", "1000 l"]);
    ws.addRow([new Date("2026-09-08T00:00:00Z"), petrol, diesel]);
    ws.addRow([new Date("2026-09-01T00:00:00Z"), petrol - 10, diesel - 10]);
    ws.addRow(["Disclaimer senza data"]);
  }
  return wb;
}

describe("parseEuWeightedAverages", () => {
  it("legge lordo e netto al litro, solo l'ultima settimana se richiesto", () => {
    const points = parseEuWeightedAverages(workbook("EU"), { latestOnly: true });
    expect(points).toEqual([
      { fuelType: "petrol", pricePerLiter: 1.78, priceNetPerLiter: 0.8, date: "2026-09-08" },
      { fuelType: "diesel", pricePerLiter: 1.65, priceNetPerLiter: 0.85, date: "2026-09-08" },
    ]);
  });

  it("accetta anche il prefisso EU27", () => {
    expect(parseEuWeightedAverages(workbook("EU27"))).toHaveLength(4);
  });

  it("non scambia l'area euro (EUR) per la media UE, e dice cosa ha trovato", () => {
    expect(() => parseEuWeightedAverages(workbook("EUR"))).toThrow(
      /EUR_price_with_tax_euro95/
    );
  });
});
