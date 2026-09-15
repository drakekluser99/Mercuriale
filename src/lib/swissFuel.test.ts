import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { chfToEur, formatMonthLabel, summarizeSwissFuel } from "./swissFuel";
import {
  joinWithRates,
  parseBfsWorkbook,
  parseEcbCsv,
  pickCurrentAsset,
} from "./fetchers/swissFuelPrices";

// Workbook con il layout osservato il 15/9 sulla tabella BFS vera:
// 3 righe di titolo, gruppi, prodotti, unità, poi un mese per riga.
function bfsWorkbook(unit = "1 l") {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Monat - Mois");
  ws.addRow(["Landesindex der Konsumentenpreise"]);
  ws.addRow(["Durchschnittspreise Energie"]);
  ws.addRow(["ungepaarte Durchschnittspreise in CHF"]);
  ws.addRow([null, "Heizöl / Mazout", "Treibstoff / Carburants"]);
  ws.addRow(["Monat / Mois", "Bezugsmenge 800 - 1'500 l", "Bleifrei 95 / sans plomb 95", "Bleifrei 98 / sans plomb 98", "Diesel"]);
  ws.addRow([null, "100 l", unit, unit, unit]);
  ws.addRow([new Date(Date.UTC(2026, 6, 1)), 110, 1.84, 1.94, 1.98]);
  ws.addRow([new Date(Date.UTC(2026, 7, 1)), 112, 1.95, 2.06, 2.18]);
  ws.addRow([new Date(Date.UTC(2026, 8, 1)), null, null, null, null]); // mese futuro
  ws.addRow([null, null, null, null, "Quelle: LIK / Source: IPC"]);
  return wb;
}

describe("parseBfsWorkbook", () => {
  it("legge benzina 95 e diesel per nome di colonna e salta i mesi vuoti", () => {
    const rows = parseBfsWorkbook(bfsWorkbook());
    expect(rows).toEqual([
      { fuelType: "petrol", priceChf: 1.84, month: "2026-07-01" },
      { fuelType: "diesel", priceChf: 1.98, month: "2026-07-01" },
      { fuelType: "petrol", priceChf: 1.95, month: "2026-08-01" },
      { fuelType: "diesel", priceChf: 2.18, month: "2026-08-01" },
    ]);
  });

  it("con latestOnly tiene solo l'ultimo mese CON prezzi", () => {
    const rows = parseBfsWorkbook(bfsWorkbook(), { latestOnly: true });
    expect(rows.map((r) => r.month)).toEqual(["2026-08-01", "2026-08-01"]);
  });

  it("accetta anche il mese come numero seriale Excel", () => {
    const wb = bfsWorkbook();
    wb.getWorksheet("Monat - Mois")!.getCell("A7").value = 46204; // 1/7/2026
    expect(parseBfsWorkbook(wb)[0].month).toBe("2026-07-01");
  });

  it("si ferma se l'unità non è più il litro", () => {
    expect(() => parseBfsWorkbook(bfsWorkbook("100 l"))).toThrow(/Unità inattesa/);
  });
});

describe("pickCurrentAsset", () => {
  const asset = (damId: number, code: string, embargo: string) => ({
    ids: { damId },
    bfs: { embargo, lifecycle: { code } },
  });

  it("sceglie la versione CURRENT più recente, ignorando le OLD", () => {
    expect(
      pickCurrentAsset([
        asset(1, "OLD", "2026-12-01T00:00:00Z"),
        asset(2, "CURRENT", "2026-08-01T00:00:00Z"),
        asset(3, "CURRENT", "2026-09-03T06:30:00Z"),
      ])
    ).toBe(3);
  });

  it("si ferma se non ce n'è nessuna in vigore", () => {
    expect(() => pickCurrentAsset([asset(1, "OLD", "2026-01-01")])).toThrow();
  });
});

describe("parseEcbCsv", () => {
  it("legge periodo e valore anche con virgole fra virgolette in fondo alla riga", () => {
    const csv = [
      "KEY,FREQ,TIME_PERIOD,OBS_VALUE,TITLE_COMPL",
      'EXR.M.CHF.EUR.SP00.A,M,2026-07,0.9255739130434782,"ECB reference exchange rate, Swiss franc/Euro"',
      'EXR.M.CHF.EUR.SP00.A,M,2026-08,0.9361857142857143,"ECB reference exchange rate, Swiss franc/Euro"',
    ].join("\n");
    const rates = parseEcbCsv(csv);
    expect(rates.get("2026-08-01")).toBeCloseTo(0.93619, 5);
    expect(rates.size).toBe(2);
  });
});

describe("conversione e riepilogo", () => {
  it("da CHF a euro si DIVIDE per il cambio (agosto 2026: 1,95 CHF ≈ 2,083 €)", () => {
    expect(chfToEur(1.95, 0.9361857)).toBeCloseTo(2.083, 3);
    expect(chfToEur(1.95, null)).toBeNull();
  });

  it("unisce prezzi e cambi per mese, null dove il cambio manca", () => {
    const joined = joinWithRates(
      [
        { fuelType: "petrol", priceChf: 1.95, month: "2026-08-01" },
        { fuelType: "petrol", priceChf: 1.9, month: "2026-09-01" },
      ],
      new Map([["2026-08-01", 0.9362]])
    );
    expect(joined.map((p) => p.chfPerEur)).toEqual([0.9362, null]);
  });

  it("riassume l'ultimo mese e formatta il mese in italiano", () => {
    const recordedAt = new Date("2026-08-01T00:00:00Z");
    const out = summarizeSwissFuel([
      { fuelType: "petrol", priceChf: "1.9500", chfPerEur: "0.936186", recordedAt },
      { fuelType: "diesel", priceChf: "2.1800", chfPerEur: "0.936186", recordedAt },
    ]);
    expect(out?.month).toBe("2026-08-01");
    expect(out?.dieselEur).toBeCloseTo(2.3286, 3);
    expect(summarizeSwissFuel([])).toBeNull();
    expect(formatMonthLabel("2026-08-01")).toBe("agosto 2026");
  });
});
