import { describe, expect, it } from "vitest";
import { buildShippingChart } from "./shippingChart";
import type { ChokepointRow } from "./chokepointStatus";

function days(from: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

const rows = (key: string, dates: string[], value: (i: number) => number): ChokepointRow[] =>
  dates.map((date, i) => ({ chokepoint: key, date, transitCalls: value(i), tradeVolumeEst: null }));

describe("buildShippingChart", () => {
  it("media mobile a 7 giorni, normale del giorno e Brent sullo stesso elenco di giorni", () => {
    // Dal 1/9 al 20/9, valori 1..20: la media dei 7 giorni fino al 7/9 è 4.
    const r = rows("hormuz", days("2026-09-01", 20), (i) => i + 1);
    const brent = [
      { date: "2026-09-07", value: 70 },
      { date: "2026-09-08", value: 71 },
    ];
    const [s] = buildShippingChart(r, brent, "2026-09-07");
    expect(s.key).toBe("hormuz");
    expect(s.blockDays).toBe(1);
    expect(s.points[0]).toEqual({ date: "2026-09-07", transits: 4, normal: 98.1, brent: 70 });
    expect(s.points[1].brent).toBe(71);
    expect(s.points[2].brent).toBeNull(); // giorno senza quotazione
    expect(s.points.at(-1)?.date).toBe("2026-09-20");
    expect(s.latestTransitDate).toBe("2026-09-20");
  });

  it("i primi giorni senza i 6 precedenti restano vuoti, non stimati", () => {
    const r = rows("bab_el_mandeb", days("2026-09-01", 10), () => 25);
    const [s] = buildShippingChart(r, [], "2026-09-01");
    expect(s.points.slice(0, 6).every((p) => p.transits === null)).toBe(true);
    expect(s.points[6].transits).toBe(25);
    expect(s.points[0].normal).toBe(74.8);
  });

  it("un giorno mancante interrompe la linea per i 7 giorni che lo contengono", () => {
    const r = rows("bab_el_mandeb", days("2026-09-01", 20), () => 25).filter(
      (x) => x.date !== "2026-09-10"
    );
    const [s] = buildShippingChart(r, [], "2026-09-08");
    const byDate = new Map(s.points.map((p) => [p.date, p.transits]));
    expect(byDate.get("2026-09-09")).toBe(25);
    expect(byDate.get("2026-09-10")).toBeNull();
    expect(byDate.get("2026-09-16")).toBeNull();
    expect(byDate.get("2026-09-17")).toBe(25);
  });

  it("il Brent più recente dei transiti allunga l'asse, i transiti restano vuoti", () => {
    const r = rows("hormuz", days("2026-09-01", 20), () => 3);
    const [s] = buildShippingChart(r, [{ date: "2026-09-23", value: 80 }], "2026-09-15");
    expect(s.points.at(-1)).toMatchObject({ date: "2026-09-23", transits: null, brent: 80 });
    expect(s.latestTransitDate).toBe("2026-09-20");
  });

  it("sui periodi lunghi raggruppa a blocchi con la media dei valori presenti", () => {
    const r = rows("bab_el_mandeb", days("2026-01-01", 20), (i) => (i < 10 ? 10 : 20));
    const brent = [
      { date: "2026-01-11", value: 60 },
      { date: "2026-01-12", value: 62 },
    ];
    // Dal 7/1 al 20/1 = 14 giorni, massimo 7 punti → blocchi da 2.
    const [s] = buildShippingChart(r, brent, "2026-01-07", 7);
    expect(s.blockDays).toBe(2);
    expect(s.points).toHaveLength(7);
    expect(s.points[0].date).toBe("2026-01-08");
    expect(s.points[2]).toMatchObject({ date: "2026-01-12", brent: 61 });
    expect(s.points[1].brent).toBeNull();
  });

  it("parte dal primo transito se lo storico comincia dopo il giorno chiesto", () => {
    const r = rows("hormuz", days("2019-01-01", 10), () => 80);
    const [s] = buildShippingChart(r, [{ date: "2018-06-01", value: 75 }], "2016-09-24");
    expect(s.points[0].date).toBe("2019-01-01");
    expect(s.startsLate).toBe(true);
    const [t] = buildShippingChart(r, [], "2019-01-03");
    expect(t.startsLate).toBe(false);
  });

  it("vuoto senza dati nel periodo, e salta i passaggi senza righe", () => {
    expect(buildShippingChart([], [], "2026-09-01")).toEqual([]);
    const r = rows("hormuz", days("2026-09-01", 10), () => 3);
    expect(buildShippingChart(r, [], "2026-09-01").map((s) => s.key)).toEqual(["hormuz"]);
  });
});
