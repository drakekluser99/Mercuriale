import { describe, expect, it } from "vitest";
import { rankByPrice, type ProvinceFuelPoint } from "./italianFuelStats";

// Come in europeFuelStats.test.ts, non testiamo computeItalianFuelStats
// (richiede fixture LatestProvinceFuelPrice dal DB): solo rankByPrice, che
// è la funzione pura con la logica di ordinamento/esclusione.

function province(
  code: string,
  petrolSelf: number | null
): ProvinceFuelPoint {
  return {
    provinceCode: code,
    provinceName: code,
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

describe("rankByPrice", () => {
  it("ordina per prezzo decrescente (rank 1 = provincia più cara)", () => {
    const provinces = [
      province("AA", 1.7),
      province("BB", 1.9),
      province("CC", 1.8),
    ];

    const ranks = rankByPrice(provinces, "petrol", "self");

    expect(ranks.get("BB")).toEqual({ rank: 1, total: 3 });
    expect(ranks.get("CC")).toEqual({ rank: 2, total: 3 });
    expect(ranks.get("AA")).toEqual({ rank: 3, total: 3 });
  });

  it("esclude le province senza prezzo per quel carburante/modalità e riduce il totale", () => {
    const provinces = [province("AA", 1.7), province("BB", null)];

    const ranks = rankByPrice(provinces, "petrol", "self");

    expect(ranks.get("AA")).toEqual({ rank: 1, total: 1 });
    expect(ranks.has("BB")).toBe(false);
  });
});
