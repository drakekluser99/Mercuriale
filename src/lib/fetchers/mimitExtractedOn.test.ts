import { describe, expect, it } from "vitest";
import { parseExtractedOn } from "./mimitExtractedOn";

describe("parseExtractedOn", () => {
  it("legge il formato ISO osservato nel file reale (15/9/2026)", () => {
    expect(parseExtractedOn("Estrazione del 2026-09-14")?.toISOString()).toBe(
      "2026-09-14T00:00:00.000Z",
    );
  });

  it("legge anche il formato italiano gg/mm/aaaa", () => {
    expect(parseExtractedOn("Estrazione del 4/9/2026")?.toISOString()).toBe(
      "2026-09-04T00:00:00.000Z",
    );
  });

  it("restituisce sempre la mezzanotte UTC, mai un orario", () => {
    const d = parseExtractedOn("Estrazione del 2026-09-14");
    expect(d?.getUTCHours()).toBe(0);
    expect(d?.getUTCMinutes()).toBe(0);
  });

  it("rifiuta righe senza data o assenti", () => {
    expect(parseExtractedOn("Estrazione del giorno")).toBeNull();
    expect(parseExtractedOn("")).toBeNull();
    expect(parseExtractedOn(null)).toBeNull();
  });

  it("rifiuta date impossibili invece di farle slittare", () => {
    expect(parseExtractedOn("Estrazione del 2026-02-31")).toBeNull();
    expect(parseExtractedOn("Estrazione del 31/02/2026")).toBeNull();
  });
});
