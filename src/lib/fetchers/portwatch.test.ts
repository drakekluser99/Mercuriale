import { describe, expect, it } from "vitest";
import {
  CHOKEPOINTS,
  buildQueryUrl,
  parseDateOnly,
  parsePortwatchResponse,
} from "./portwatch";

const HORMUZ = CHOKEPOINTS[0];

// Riga finta con i campi elencati per il layer PortWatch. La forma di
// `date` ("AAAA-MM-GG") è quella ATTESA per esriFieldTypeDateOnly, non
// ancora vista su una risposta reale: il test fissa cosa accettiamo, non
// cosa manda la fonte.
function row(overrides: Record<string, unknown> = {}) {
  return {
    attributes: {
      date: "2026-09-15",
      year: 2026,
      month: 9,
      day: 15,
      portid: "chokepoint6",
      portname: "Strait of Hormuz",
      n_container: 10,
      n_tanker: 40,
      n_total: 95,
      capacity: 5123456.5,
      ObjectId: 1,
      ...overrides,
    },
  };
}

describe("parsePortwatchResponse", () => {
  it("legge una risposta valida", () => {
    const points = parsePortwatchResponse(
      { features: [row(), row({ date: "2026-09-14", day: 14, n_total: 0, capacity: null })] },
      HORMUZ
    );
    expect(points).toEqual([
      { chokepoint: "hormuz", date: "2026-09-15", transitCalls: 95, tradeVolumeEst: 5123456.5 },
      // Zero esplicito = dato vero; capacity null resta null, non 0.
      { chokepoint: "hormuz", date: "2026-09-14", transitCalls: 0, tradeVolumeEst: null },
    ]);
  });

  it("si ferma su un errore ArcGIS arrivato con HTTP 200", () => {
    expect(() =>
      parsePortwatchResponse({ error: { code: 400, message: "Invalid query" } }, HORMUZ)
    ).toThrow(/codice 400: Invalid query/);
  });

  it("si ferma su zero righe invece di salvare zero transiti", () => {
    expect(() => parsePortwatchResponse({ features: [] }, HORMUZ)).toThrow(/nessuna riga/);
  });

  it("si ferma se manca un campo, anche se il valore potrebbe essere null", () => {
    const r = row();
    delete (r.attributes as Record<string, unknown>).capacity;
    expect(() => parsePortwatchResponse({ features: [r] }, HORMUZ)).toThrow(
      /campi mancanti: capacity/
    );
  });

  it("si ferma se la riga è di un altro passaggio", () => {
    expect(() =>
      parsePortwatchResponse(
        { features: [row({ portname: "Bab el-Mandeb Strait", portid: "chokepoint4" })] },
        HORMUZ
      )
    ).toThrow(/altro passaggio/);
  });

  it("si ferma se il nome combacia ma l'id no (rinumerazione)", () => {
    expect(() =>
      parsePortwatchResponse({ features: [row({ portid: "chokepoint9" })] }, HORMUZ)
    ).toThrow(/altro passaggio/);
  });

  it("si ferma se date arriva in millisecondi, mostrando il valore", () => {
    expect(() =>
      parsePortwatchResponse({ features: [row({ date: 1789430400000 })] }, HORMUZ)
    ).toThrow(/date=1789430400000 \(tipo number\)/);
  });

  it("si ferma su n_total null o non intero", () => {
    expect(() => parsePortwatchResponse({ features: [row({ n_total: null })] }, HORMUZ)).toThrow(
      /n_total non valido/
    );
    expect(() => parsePortwatchResponse({ features: [row({ n_total: 3.5 })] }, HORMUZ)).toThrow(
      /n_total non valido/
    );
  });

  it("si ferma su un giorno ripetuto", () => {
    expect(() => parsePortwatchResponse({ features: [row(), row()] }, HORMUZ)).toThrow(
      /compare due volte/
    );
  });
});

describe("parseDateOnly", () => {
  it("accetta AAAA-MM-GG coerente con year/month/day", () => {
    expect(parseDateOnly("2026-09-15", 2026, 9, 15)).toBe("2026-09-15");
  });

  it("rifiuta se year/month/day raccontano un altro giorno", () => {
    expect(parseDateOnly("2026-09-15", 2026, 9, 14)).toBeNull();
  });

  it("rifiuta date impossibili invece di farle slittare", () => {
    expect(parseDateOnly("2026-02-31", 2026, 2, 31)).toBeNull();
  });

  it("rifiuta formati diversi", () => {
    expect(parseDateOnly("15/09/2026", 2026, 9, 15)).toBeNull();
    expect(parseDateOnly("2026-09-15T00:00:00Z", 2026, 9, 15)).toBeNull();
  });
});

describe("buildQueryUrl", () => {
  it("filtra sul nome esatto, dal più recente, senza geometria", () => {
    const url = new URL(buildQueryUrl(HORMUZ, 60));
    expect(url.searchParams.get("where")).toBe("portname = 'Strait of Hormuz'");
    expect(url.searchParams.get("orderByFields")).toBe("date DESC");
    expect(url.searchParams.get("resultRecordCount")).toBe("60");
    expect(url.searchParams.get("outFields")).toBe("*");
    expect(url.searchParams.get("outSR")).toBe("4326");
    expect(url.searchParams.get("f")).toBe("json");
  });
});
