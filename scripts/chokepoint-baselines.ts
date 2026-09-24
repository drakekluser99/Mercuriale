/**
 * Calcolo delle baseline del "traffico normale" dai dati giornalieri già
 * salvati in chokepoint_transits (24 set 2026). SOLA LETTURA: non scrive
 * niente, stampa soltanto.
 *
 *   npm run chokepoint:baselines
 *
 * I periodi qui sotto sono quelli decisi con Yuri il 24/9 guardando lo
 * storico (medie mensili e valori giornalieri attorno alle rotture):
 *
 * - Hormuz, STAGIONALE, 01/11/2022 – 31/10/2025: tre anni pieni per ogni
 *   mese. Esclude gli anni 2019–2021, su un livello più basso (circa
 *   60-85, con il COVID nel 2020), e l'inverno 2025-26, il più basso dal
 *   2019: potrebbe essere un primo segnale della crisi, non lo sappiamo, e
 *   meglio tenerlo fuori dal riferimento "normale". Rottura: 01/03/2026.
 * - Bab el-Mandeb, PIATTA, 16/12/2022 – 15/12/2023: l'anno che precede la
 *   rottura (16/12/2023). Nessuna stagionalità visibile nei dati.
 *
 * Questo script serve a leggere i valori esatti PRIMA di fissarli: la
 * costante definitiva va scritta in chokepointHistory.ts solo dopo la
 * conferma sui numeri.
 */
import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local", override: false });

const HORMUZ_PERIOD = { from: "2022-11-01", to: "2025-10-31" };
const BAB_EL_MANDEB_PERIOD = { from: "2022-12-16", to: "2023-12-15" };

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function pct(value: number, base: number): string {
  const d = (value / base - 1) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}

async function main(): Promise<number> {
  const { db } = await import("../src/lib/db/client");
  const { chokepointTransits } = await import("../src/lib/db/schema");
  const { asc, eq } = await import("drizzle-orm");
  const { flatBaseline, seasonalBaseline } = await import("../src/lib/chokepointHistory");

  async function load(key: string) {
    const rows = await db
      .select({ recordedAt: chokepointTransits.recordedAt, transitCalls: chokepointTransits.transitCalls })
      .from(chokepointTransits)
      .where(eq(chokepointTransits.chokepoint, key))
      .orderBy(asc(chokepointTransits.recordedAt));
    return rows.map((r) => ({
      // recorded_at è a mezzanotte UTC: la parte di data è il giorno del dato.
      date: r.recordedAt.toISOString().slice(0, 10),
      transitCalls: r.transitCalls,
    }));
  }

  /** Media degli ultimi 7 giorni disponibili, con le date che copre. */
  function lastWeek(points: { date: string; transitCalls: number }[]) {
    const last = points.slice(-7);
    const mean = last.reduce((s, p) => s + p.transitCalls, 0) / last.length;
    return { mean, from: last[0].date, to: last[last.length - 1].date };
  }

  // Hormuz
  const hormuz = await load("hormuz");
  console.log(`\n=== Hormuz — baseline STAGIONALE, dal ${HORMUZ_PERIOD.from} al ${HORMUZ_PERIOD.to}`);
  console.log(`(righe in tabella: ${hormuz.length})`);
  const seasonal = seasonalBaseline(hormuz, HORMUZ_PERIOD);
  console.log("mese · giorni ·  media · min · max");
  for (const m of seasonal) {
    console.log(
      `  ${MONTHS[m.month - 1]} ·  ${String(m.days).padStart(3)} · ${m.mean.toFixed(2).padStart(6)} · ${String(m.min).padStart(3)} · ${String(m.max).padStart(3)}`
    );
  }
  const hw = lastWeek(hormuz);
  const hMonth = Number(hw.to.slice(5, 7));
  const hBase = seasonal.find((m) => m.month === hMonth)!.mean;
  console.log(
    `Oggi: media ${hw.mean.toFixed(2)} transiti/giorno (${hw.from} → ${hw.to}), ` +
      `baseline di ${MONTHS[hMonth - 1]} ${hBase.toFixed(2)} → ${pct(hw.mean, hBase)}`
  );

  // Bab el-Mandeb
  const bab = await load("bab_el_mandeb");
  console.log(
    `\n=== Bab el-Mandeb — baseline PIATTA, dal ${BAB_EL_MANDEB_PERIOD.from} al ${BAB_EL_MANDEB_PERIOD.to}`
  );
  console.log(`(righe in tabella: ${bab.length})`);
  const flat = flatBaseline(bab, BAB_EL_MANDEB_PERIOD);
  console.log(
    `  giorni ${flat.days} · media ${flat.mean.toFixed(2)} · min ${flat.min} · max ${flat.max}`
  );
  const bw = lastWeek(bab);
  console.log(
    `Oggi: media ${bw.mean.toFixed(2)} transiti/giorno (${bw.from} → ${bw.to}), ` +
      `baseline ${flat.mean.toFixed(2)} → ${pct(bw.mean, flat.mean)}`
  );

  console.log("\n(sola lettura: nessuna scrittura sul database)");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Errore:", err);
    process.exit(1);
  });
