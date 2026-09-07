import { describe, expect, it } from "vitest";
import {
  currencySymbol,
  formatBillionsEur,
  formatCommodityPrice,
  formatDate,
  formatDateTime,
  formatFuelPrice,
  formatPercent,
  fuelUnitFromCurrency,
  shortUnit,
} from "./format";

// Questi test controllano solo la FORMATTAZIONE (separatori it-IT, numero
// di decimali, segno) — non il calcolo dei valori, che è testato altrove
// (freshness/compute.test.ts, europeFuelStats.test.ts, italianFuelStats.test.ts).

describe("formatCommodityPrice", () => {
  it("usa 2 decimali e il punto come separatore delle migliaia", () => {
    // Stesso esempio del commento nel file sorgente: 13542.8209 -> "13.542,82"
    expect(formatCommodityPrice(13542.8209)).toBe("13.542,82");
  });

  it("arrotonda a 2 decimali anche con meno cifre in input", () => {
    expect(formatCommodityPrice(1.5)).toBe("1,50");
  });
});

describe("formatFuelPrice", () => {
  it("usa 3 decimali (i millesimi contano al distributore)", () => {
    expect(formatFuelPrice(1.899)).toBe("1,899");
  });

  it("riempie con zeri fino a 3 decimali", () => {
    expect(formatFuelPrice(2)).toBe("2,000");
  });
});

describe("formatPercent", () => {
  it("aggiunge il segno + per i valori positivi", () => {
    expect(formatPercent(6.2)).toBe("+6,2%");
  });

  it("usa il minus tipografico U+2212 per i valori negativi", () => {
    expect(formatPercent(-1.4)).toBe("−1,4%");
  });

  it("non mette nessun segno per lo zero", () => {
    expect(formatPercent(0)).toBe("0,0%");
  });

  it("rispetta il numero di decimali passato", () => {
    expect(formatPercent(3.14159, 2)).toBe("+3,14%");
  });
});

describe("shortUnit", () => {
  it("abbrevia un'unità nota, case-insensitive", () => {
    expect(shortUnit("dollars per barrel")).toBe("$/barile");
    expect(shortUnit("Dollars Per Barrel")).toBe("$/barile");
  });

  it("ritorna la stringa originale per un'unità non mappata (niente perso in silenzio)", () => {
    expect(shortUnit("unità mai vista prima")).toBe("unità mai vista prima");
  });
});

describe("fuelUnitFromCurrency", () => {
  it("mappa EUR e USD al simbolo + /L", () => {
    expect(fuelUnitFromCurrency("EUR")).toBe("€/L");
    expect(fuelUnitFromCurrency("USD")).toBe("$/L");
  });

  it("ripiega sul codice valuta stesso per valute non previste", () => {
    expect(fuelUnitFromCurrency("GBP")).toBe("GBP/L");
  });
});

describe("currencySymbol", () => {
  it("mappa EUR e USD al simbolo", () => {
    expect(currencySymbol("EUR")).toBe("€");
    expect(currencySymbol("USD")).toBe("$");
  });

  it("ripiega sul codice valuta per valute non previste", () => {
    expect(currencySymbol("GBP")).toBe("GBP");
  });
});

describe("formatBillionsEur", () => {
  it("converte in miliardi con 1 decimale", () => {
    expect(formatBillionsEur(26_700_000_000)).toBe("26,7 miliardi di €");
  });
});

describe("formatDate", () => {
  it("formatta in gg/mm/aaaa", () => {
    // new Date(anno, mese0-indexed, giorno) costruisce in ora locale: sia la
    // costruzione sia Intl.DateTimeFormat (senza timeZone esplicito) usano
    // lo stesso fuso della macchina che esegue il test, quindi il risultato
    // non dipende da QUALE fuso orario sia — resta "03/09/2026" ovunque.
    expect(formatDate(new Date(2026, 8, 3))).toBe("03/09/2026");
  });
});

describe("formatDateTime", () => {
  it("formatta in gg/mm/aaaa, hh:mm", () => {
    expect(formatDateTime(new Date(2026, 8, 4, 14, 32))).toBe("04/09/2026, 14:32");
  });
});
