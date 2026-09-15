import { describe, expect, it } from "vitest";
import { ANNUAL_FIGURES, figureOfTheDay, formatFigureValue, formatFigureValueShort, otherFigures } from "./annualFigures";

describe("figureOfTheDay", () => {
  it("resta la stessa per tutto il giorno di Roma e cambia il giorno dopo", () => {
    // 15 settembre, ora legale (UTC+2): dalle 00:00 alle 23:59 di Roma.
    const morning = figureOfTheDay(new Date("2026-09-14T22:30:00Z"));
    const evening = figureOfTheDay(new Date("2026-09-15T21:30:00Z"));
    const nextDay = figureOfTheDay(new Date("2026-09-15T22:30:00Z"));
    expect(morning.id).toBe(evening.id);
    expect(nextDay.id).not.toBe(morning.id);
  });

  it("passa per tutte le cifre in un ciclo", () => {
    const seen = new Set<string>();
    for (let d = 0; d < ANNUAL_FIGURES.length; d++) {
      seen.add(figureOfTheDay(new Date(Date.UTC(2026, 0, 1 + d, 12))).id);
    }
    expect(seen.size).toBe(ANNUAL_FIGURES.length);
  });

  it("rifiuta una raccolta vuota", () => {
    expect(() => figureOfTheDay(new Date(), [])).toThrow();
  });
});

describe("raccolta", () => {
  it("ha id unici (sono ancore nella pagina /numeri)", () => {
    const ids = ANNUAL_FIGURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("formatta euro e percentuali", () => {
    expect(formatFigureValue({ kind: "percent", amount: 25.7 })).toBe("25,7%");
    expect(formatFigureValue({ kind: "eur", amount: 26_700_000_000 })).toContain("26,7");
    expect(formatFigureValueShort({ kind: "eur", amount: 287_000_000_000 })).toBe("287 mld €");
  });
});

describe("otherFigures", () => {
  it("elenca tutte le altre, a partire da quella di domani", () => {
    const today = ANNUAL_FIGURES[1];
    const others = otherFigures(today);
    expect(others).toHaveLength(ANNUAL_FIGURES.length - 1);
    expect(others[0].id).toBe(ANNUAL_FIGURES[2].id);
    expect(others.map((f) => f.id)).not.toContain(today.id);
    expect(others.at(-1)?.id).toBe(ANNUAL_FIGURES[0].id);
  });
});
