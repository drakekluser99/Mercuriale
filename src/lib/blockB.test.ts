// Test dei moduli puri aggiunti col blocco B (15 set 2026): nomi italiani
// delle materie prime, scala di colore condivisa dalle mappe, valore a una
// data passata per il calcolatore.
import { describe, expect, it } from "vitest";
import { localizedCommodityName } from "./commodityNames";
import { divergingColor, NEUTRAL_HEX } from "./divergingColor";
import { daysBefore, valueAtOrBefore } from "./pastValue";

describe("localizedCommodityName", () => {
  it("traduce i simboli noti e lascia il nome originale per gli altri", () => {
    expect(localizedCommodityName("NATURAL_GAS", "Natural Gas")).toBe("Gas naturale");
    expect(localizedCommodityName("NICKEL", "Nickel")).toBe("Nickel");
  });
});

describe("divergingColor", () => {
  it("è neutro alla media e con range nullo", () => {
    expect(divergingColor(2, 2, 1)).toBe("rgb(228, 220, 203)");
    expect(divergingColor(3, 2, 0)).toBe(NEUTRAL_HEX);
  });

  it("satura verde sotto e ruggine sopra la media", () => {
    expect(divergingColor(1, 2, 2)).toBe("rgb(63, 111, 74)");
    expect(divergingColor(3, 2, 2)).toBe("rgb(176, 70, 31)");
  });
});

describe("valueAtOrBefore", () => {
  const pts = [
    { date: "2025-09-08", value: 1.8 },
    { date: "2025-09-15", value: 1.82 },
    { date: "2026-08-10", value: 1.9 },
    { date: "2026-08-17", value: 1.92 },
  ];

  it("prende l'ultima rilevazione non successiva alla data", () => {
    expect(valueAtOrBefore(pts, new Date("2026-08-15"))?.value).toBe(1.9);
    expect(valueAtOrBefore(pts, new Date("2025-09-15"))?.value).toBe(1.82);
  });

  it("restituisce null se la rilevazione più vicina è troppo vecchia", () => {
    // Buco fra settembre 2025 e agosto 2026: marzo non ha un dato vicino.
    expect(valueAtOrBefore(pts, new Date("2026-03-01"))).toBeNull();
  });

  it("restituisce null prima dell'inizio della serie", () => {
    expect(valueAtOrBefore(pts, new Date("2024-01-01"))).toBeNull();
  });

  it("daysBefore sottrae giorni interi", () => {
    expect(daysBefore(new Date("2026-09-15T00:00:00Z"), 30).toISOString()).toBe(
      "2026-08-16T00:00:00.000Z",
    );
  });
});
