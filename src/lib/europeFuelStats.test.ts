import { describe, expect, it } from "vitest";
import {
  otherTaxesPerLiter,
  rankByTaxShare,
  taxPerLiter,
  taxSharePercent,
  vatEurPerLiter,
  type CountryFuelPoint,
} from "./europeFuelStats";

// Nota: qui NON testiamo computeEuropeFuelStats — richiederebbe fixture del
// tipo LatestFuelPrice (righe grezze dal DB, con stringhe invece di numeri)
// che non fanno parte di questo file. Testiamo solo le funzioni pure che
// ne derivano i numeri visualizzati: sono quelle con la logica (e i casi
// limite null) più delicata.

describe("taxPerLiter", () => {
  it("calcola la differenza lordo - netto", () => {
    expect(taxPerLiter(1.8, 1.2)).toBeCloseTo(0.6, 10);
  });

  it("ritorna null se manca il lordo o il netto", () => {
    expect(taxPerLiter(null, 1.2)).toBeNull();
    expect(taxPerLiter(1.8, null)).toBeNull();
  });
});

describe("taxSharePercent", () => {
  it("calcola la quota fiscale in percentuale", () => {
    expect(taxSharePercent(2, 1)).toBe(50);
  });

  it("ritorna null se il netto manca", () => {
    expect(taxSharePercent(2, null)).toBeNull();
  });

  it("ritorna null se il lordo non è positivo (0 o negativo)", () => {
    expect(taxSharePercent(0, 0)).toBeNull();
    expect(taxSharePercent(-1, -2)).toBeNull();
  });
});

describe("vatEurPerLiter", () => {
  it("calcola l'IVA su (netto + accisa)", () => {
    // base imponibile = 1.0 + 0.5 = 1.5; IVA 22% -> 0.33
    expect(vatEurPerLiter(1.0, 0.5, 22)).toBeCloseTo(0.33, 10);
  });

  it("ritorna null se manca uno qualunque dei tre input", () => {
    expect(vatEurPerLiter(null, 0.5, 22)).toBeNull();
    expect(vatEurPerLiter(1.0, null, 22)).toBeNull();
    expect(vatEurPerLiter(1.0, 0.5, null)).toBeNull();
  });
});

describe("otherTaxesPerLiter", () => {
  it("calcola il residuo lordo - netto - accisa - IVA", () => {
    expect(otherTaxesPerLiter(2, 1, 0.3, 0.33)).toBeCloseTo(0.37, 10);
  });

  it("clamp a 0 quando il residuo sarebbe leggermente negativo (arrotondamenti)", () => {
    expect(otherTaxesPerLiter(0.99, 1, 0, 0)).toBe(0);
  });

  it("ritorna null se manca uno qualunque dei quattro input, mai forzato a 0", () => {
    expect(otherTaxesPerLiter(null, 1, 0.3, 0.33)).toBeNull();
    expect(otherTaxesPerLiter(2, null, 0.3, 0.33)).toBeNull();
    expect(otherTaxesPerLiter(2, 1, null, 0.33)).toBeNull();
    expect(otherTaxesPerLiter(2, 1, 0.3, null)).toBeNull();
  });
});

describe("rankByTaxShare", () => {
  function country(name: string, petrol: number | null, petrolNet: number | null): CountryFuelPoint {
    return {
      countryName: name,
      petrol,
      diesel: null,
      petrolNet,
      dieselNet: null,
      petrolExciseEur: null,
      dieselExciseEur: null,
      petrolVatRatePercent: null,
      dieselVatRatePercent: null,
      recordedAt: null,
    };
  }

  it("ordina per quota fiscale decrescente (rank 1 = quota più alta)", () => {
    const countries = [
      country("Bassa", 1.5, 1.35), // quota 10%
      country("Alta", 2.0, 1.4), // quota 30%
      country("Media", 1.8, 1.44), // quota 20%
    ];

    const ranks = rankByTaxShare(countries, "petrol");

    expect(ranks.get("Alta")).toEqual({ rank: 1, total: 3 });
    expect(ranks.get("Media")).toEqual({ rank: 2, total: 3 });
    expect(ranks.get("Bassa")).toEqual({ rank: 3, total: 3 });
  });

  it("esclude i paesi senza netto e riduce il totale di conseguenza", () => {
    const countries = [
      country("Con dato", 2.0, 1.4),
      country("Senza netto", 1.9, null),
    ];

    const ranks = rankByTaxShare(countries, "petrol");

    expect(ranks.get("Con dato")).toEqual({ rank: 1, total: 1 });
    expect(ranks.has("Senza netto")).toBe(false);
  });
});
