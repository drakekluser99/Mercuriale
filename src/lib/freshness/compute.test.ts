import { describe, expect, it } from "vitest";
import { computeFreshness, getFreshnessConfig } from "./compute";
import { FRESHNESS_CONFIG } from "./config";

const DAY_MS = 24 * 60 * 60 * 1000;

// "now" fisso: computeFreshness accetta `now` come parametro esplicito
// proprio per essere testabile senza dipendere dall'orologio di sistema
// (vedi il commento nel file sorgente).
const NOW = new Date("2026-09-07T12:00:00.000Z");
const CONFIG = { expectedIntervalDays: 1, graceDays: 3, label: "test" };

describe("computeFreshness", () => {
  // I 4 casi qui sotto coprono i due confini della funzione (<=
  // expectedIntervalDays e <= expectedIntervalDays + graceDays), un giorno
  // prima e un giorno dopo ciascuno — è lì che un bug "off by one" si
  // nasconderebbe, non nel mezzo di un intervallo.

  it("è 'aggiornato' esattamente al limite di expectedIntervalDays", () => {
    const recordedAt = new Date(NOW.getTime() - 1 * DAY_MS);
    expect(computeFreshness(recordedAt, CONFIG, NOW)).toBe("aggiornato");
  });

  it("diventa 'in_attesa' un istante dopo il limite di expectedIntervalDays", () => {
    const recordedAt = new Date(NOW.getTime() - (1 * DAY_MS + 1));
    expect(computeFreshness(recordedAt, CONFIG, NOW)).toBe("in_attesa");
  });

  it("resta 'in_attesa' esattamente al limite di expectedIntervalDays + graceDays", () => {
    const recordedAt = new Date(NOW.getTime() - 4 * DAY_MS);
    expect(computeFreshness(recordedAt, CONFIG, NOW)).toBe("in_attesa");
  });

  it("diventa 'non_aggiornato' un istante dopo il limite del grace period", () => {
    const recordedAt = new Date(NOW.getTime() - (4 * DAY_MS + 1));
    expect(computeFreshness(recordedAt, CONFIG, NOW)).toBe("non_aggiornato");
  });

  it("è 'aggiornato' per un dato appena registrato", () => {
    expect(computeFreshness(NOW, CONFIG, NOW)).toBe("aggiornato");
  });
});

describe("getFreshnessConfig", () => {
  it("trova la chiave composita source:symbol quando esiste", () => {
    // Confronto con FRESHNESS_CONFIG reale (non un duplicato scritto a
    // mano): se qualcuno cambia i numeri in config.ts, questo test non va
    // disallineato — verifica solo che il lookup prenda la voce giusta.
    expect(getFreshnessConfig("alpha_vantage", "WTI")).toEqual(
      FRESHNESS_CONFIG["alpha_vantage:WTI"]
    );
  });

  it("ripiega sulla chiave source-only quando non c'è un symbol", () => {
    expect(getFreshnessConfig("mimit")).toEqual(FRESHNESS_CONFIG["mimit"]);
  });

  it("ripiega su source-only anche quando un symbol è passato ma non ha una voce composita dedicata", () => {
    // eu_weekly_oil_bulletin non ha voci per singolo simbolo: qualunque
    // symbol venga passato deve ricadere sulla config della fonte.
    expect(getFreshnessConfig("eu_weekly_oil_bulletin", "QUALSIASI")).toEqual(
      FRESHNESS_CONFIG["eu_weekly_oil_bulletin"]
    );
  });

  it("lancia un errore esplicito per una fonte sconosciuta, non un default silenzioso", () => {
    expect(() => getFreshnessConfig("fonte_mai_registrata")).toThrow(
      /Nessuna configurazione di freshness trovata/
    );
  });
});

describe("IMF PortWatch (imf_portwatch)", () => {
  // Il dato del 20/9 (domenica) esce martedì 22/9; il successivo, con i
  // dati fino al 27/9, martedì 29/9. Qui si verifica che la soglia 9 + 4
  // dia gli stati attesi sul calendario vero.
  const config = getFreshnessConfig("imf_portwatch");
  const recordedAt = new Date("2026-09-20T00:00:00.000Z");
  const at = (iso: string) => computeFreshness(recordedAt, config, new Date(iso));

  it("resta 'aggiornato' fino alla vigilia dell'uscita successiva", () => {
    expect(at("2026-09-24T12:00:00.000Z")).toBe("aggiornato");
    expect(at("2026-09-29T00:00:00.000Z")).toBe("aggiornato");
  });

  it("passa a 'in_attesa' se l'uscita slitta di qualche giorno", () => {
    expect(at("2026-10-01T00:00:00.000Z")).toBe("in_attesa");
  });

  it("diventa 'non_aggiornato' oltre la tolleranza", () => {
    expect(at("2026-10-04T12:00:00.000Z")).toBe("non_aggiornato");
  });
});
