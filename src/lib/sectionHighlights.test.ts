import { describe, expect, it } from "vitest";
import {
  biggestMover,
  euPetrolSpread,
  euPetrolTaxShare,
  italyVsEuAverage,
  italyVsNeighbours,
  priceSpread,
  provincePetrolSelfSpread,
} from "./sectionHighlights";
import type { CountryFuelPoint, EuropeFuelAverage } from "./europeFuelStats";
import type { ProvinceFuelPoint } from "./italianFuelStats";
import type { PriceMover } from "./priceHistory";

// Costruttori minimi: riempiono i campi obbligatori con null, così ogni
// test dichiara solo ciò che gli interessa.
function country(countryName: string, petrol: number | null): CountryFuelPoint {
  return {
    countryName,
    petrol,
    diesel: null,
    petrolNet: null,
    dieselNet: null,
    petrolExciseEur: null,
    dieselExciseEur: null,
    petrolVatRatePercent: null,
    dieselVatRatePercent: null,
    recordedAt: null,
  };
}

function province(provinceName: string, petrolSelf: number | null): ProvinceFuelPoint {
  return {
    provinceCode: provinceName.slice(0, 2).toUpperCase(),
    provinceName,
    petrolSelf,
    petrolServed: null,
    dieselSelf: null,
    dieselServed: null,
    petrolSelfStations: null,
    petrolServedStations: null,
    dieselSelfStations: null,
    dieselServedStations: null,
    recordedAt: null,
  };
}

function mover(key: string, changePct: number): PriceMover {
  return {
    key,
    label: key,
    unit: "dollars per barrel",
    first: 100,
    last: 100 + changePct,
    changePct,
    firstDate: "2026-06-01",
    lastDate: "2026-09-01",
    points: 10,
  };
}

const avg = (petrol: number | null, petrolNet: number | null): EuropeFuelAverage => ({
  petrol,
  diesel: null,
  petrolNet,
  dieselNet: null,
  currency: "EUR",
});

describe("italyVsEuAverage", () => {
  it("calcola la distanza dell'Italia dalla media dei 27", () => {
    const r = italyVsEuAverage([country("Italy", 2.017), country("Malta", 1.34)], avg(1.84, 1));
    expect(r?.diff).toBeCloseTo(0.177, 10);
  });

  it("ritorna null se manca l'Italia o la media", () => {
    expect(italyVsEuAverage([country("Malta", 1.34)], avg(1.84, 1))).toBeNull();
    expect(italyVsEuAverage([country("Italy", 2.017)], avg(null, null))).toBeNull();
  });
});

describe("euPetrolTaxShare", () => {
  it("usa la quota della media (lordo medio vs netto medio)", () => {
    expect(euPetrolTaxShare(avg(2, 1))).toBe(50);
  });

  it("ritorna null senza netto medio", () => {
    expect(euPetrolTaxShare(avg(2, null))).toBeNull();
  });
});

describe("biggestMover", () => {
  it("sceglie la variazione più ampia in valore assoluto, anche se negativa", () => {
    expect(biggestMover([mover("A", 12), mover("B", -30), mover("C", 5)])?.key).toBe("B");
  });

  it("ritorna null su lista vuota", () => {
    expect(biggestMover([])).toBeNull();
  });
});

describe("priceSpread", () => {
  it("trova estremi e divario ignorando i null", () => {
    const r = euPetrolSpread([country("Denmark", 2.2), country("Malta", 1.34), country("Cyprus", null)]);
    expect(r?.highest.countryName).toBe("Denmark");
    expect(r?.lowest.countryName).toBe("Malta");
    expect(r?.gap).toBeCloseTo(0.86, 10);
  });

  it("ritorna null con meno di due valori validi", () => {
    expect(priceSpread([1, null].map((v) => ({ v })), (x) => x.v)).toBeNull();
    expect(provincePetrolSelfSpread([province("Milano", null)])).toBeNull();
  });

  it("funziona anche sulle province", () => {
    const r = provincePetrolSelfSpread([province("Bolzano", 2.2), province("Napoli", 2.05)]);
    expect(r?.highest.provinceName).toBe("Bolzano");
    expect(r?.gap).toBeCloseTo(0.15, 10);
  });
});

describe("italyVsNeighbours", () => {
  const point = (countryName: string, petrol: number | null) =>
    ({ countryName, petrol }) as unknown as CountryFuelPoint;

  it("confronta i confinanti con l'Italia, nell'ordine ovest → est", () => {
    const out = italyVsNeighbours([
      point("Slovenia", 1.5),
      point("Italy", 1.9),
      point("France", 1.95),
      point("Germany", 1.8),
    ]);
    expect(out?.italy).toBe(1.9);
    expect(out?.neighbours.map((n) => n.countryName)).toEqual(["France", "Slovenia"]);
    expect(out?.neighbours[0].diffVsItaly).toBeCloseTo(0.05);
    expect(out?.neighbours[1].diffVsItaly).toBeCloseTo(-0.4);
  });

  it("null senza Italia o senza nessun confinante", () => {
    expect(italyVsNeighbours([point("France", 1.9)])).toBeNull();
    expect(italyVsNeighbours([point("Italy", 1.9), point("Austria", null)])).toBeNull();
  });
});
