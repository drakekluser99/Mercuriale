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
 * I valori sono stati fissati il 24/9 in CHOKEPOINT_BASELINES
 * (chokepointHistory.ts), da cui lo script prende anche i periodi. Ora
 * serve da VERIFICA: ricalcola dai dati e dice se coincidono ancora con la
 * costante. Se no, la fonte ha rivisto lo storico: si decide a mano se
 * aggiornare la costante (e la metodologia).
 */
import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local", override: false });


const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function pct(value: number, base: number): string {
  const d = (value / base - 1) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}

async function main(): Promise<number> {
  const { db } = await import("../src/lib/db/client");
  const { chokepointTransits } = await import("../src/lib/db/schema");
  const { asc, eq } = await import("drizzle-orm");
  const {
    flatBaseline,
    seasonalBaseline,
    CHOKEPOINT_BASELINES,
    rollingDeviations,
    percentile,
    transitState,
    TRANSIT_STATE_LABELS,
  } = await import("../src/lib/chokepointHistory");
  const HORMUZ_PERIOD = CHOKEPOINT_BASELINES.hormuz.period;
  const BAB_EL_MANDEB_PERIOD = CHOKEPOINT_BASELINES.bab_el_mandeb.period;
  let mismatches = 0;
  // La costante ha due decimali: coincide se la differenza sta nell'arrotondamento.
  const same = (a: number, b: number) => Math.abs(a - b) < 0.005 + 1e-9;

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
    const fixed = CHOKEPOINT_BASELINES.hormuz.monthly[m.month - 1];
    if (!same(m.mean, fixed)) mismatches++;
    console.log(
      `  ${MONTHS[m.month - 1]} ·  ${String(m.days).padStart(3)} · ${m.mean.toFixed(2).padStart(6)} · ${String(m.min).padStart(3)} · ${String(m.max).padStart(3)}` +
        (same(m.mean, fixed) ? "" : `  ≠ costante ${fixed}`)
    );
  }
  const hw = lastWeek(hormuz);
  const hMonth = Number(hw.to.slice(5, 7));
  const hBase = seasonal.find((m) => m.month === hMonth)!.mean;
  console.log(
    `Oggi: media ${hw.mean.toFixed(2)} transiti/giorno (${hw.from} → ${hw.to}), ` +
      `baseline di ${MONTHS[hMonth - 1]} ${hBase.toFixed(2)} → ${pct(hw.mean, hBase)} · ` +
      `stato: ${TRANSIT_STATE_LABELS[transitState((hw.mean / hBase - 1) * 100, CHOKEPOINT_BASELINES.hormuz.reducedBelowPct)]}`
  );

  // Bab el-Mandeb
  const bab = await load("bab_el_mandeb");
  console.log(
    `\n=== Bab el-Mandeb — baseline PIATTA, dal ${BAB_EL_MANDEB_PERIOD.from} al ${BAB_EL_MANDEB_PERIOD.to}`
  );
  console.log(`(righe in tabella: ${bab.length})`);
  const flat = flatBaseline(bab, BAB_EL_MANDEB_PERIOD);
  const fixedFlat = CHOKEPOINT_BASELINES.bab_el_mandeb.value;
  if (!same(flat.mean, fixedFlat)) mismatches++;
  console.log(
    `  giorni ${flat.days} · media ${flat.mean.toFixed(2)} · min ${flat.min} · max ${flat.max}` +
      (same(flat.mean, fixedFlat) ? "" : `  ≠ costante ${fixedFlat}`)
  );
  const bw = lastWeek(bab);
  console.log(
    `Oggi: media ${bw.mean.toFixed(2)} transiti/giorno (${bw.from} → ${bw.to}), ` +
      `baseline ${flat.mean.toFixed(2)} → ${pct(bw.mean, flat.mean)} · ` +
      `stato: ${TRANSIT_STATE_LABELS[transitState((bw.mean / fixedFlat - 1) * 100, CHOKEPOINT_BASELINES.bab_el_mandeb.reducedBelowPct)]}`
  );

  // ─── Soglie degli stati (24 set 2026) ───────────────────────────────────
  // Quanto oscillava la media di 7 giorni rispetto alla baseline DENTRO il
  // periodo di riferimento (traffico normale per definizione), e dove sta
  // dopo la rottura. Serve a scegliere sui dati la soglia fra "normale" e
  // "ridotto" e quella fra "ridotto" e "fortemente ridotto".
  const PCTS = [1, 5, 10, 25, 50, 75, 90, 95, 99];
  const f1 = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  function describe(label: string, values: number[], reducedBelowPct: number) {
    if (values.length === 0) {
      console.log(`  ${label}: nessuna finestra`);
      return;
    }
    console.log(
      `  ${label} (${values.length} finestre): min ${f1(Math.min(...values))} · ` +
        PCTS.map((p) => `p${p} ${f1(percentile(values, p))}`).join(" · ") +
        ` · max ${f1(Math.max(...values))}`
    );
    // Quante finestre cadono in ciascuno stato con le soglie fissate.
    const counts = { normale: 0, ridotto: 0, fortemente_ridotto: 0 };
    for (const v of values) counts[transitState(v, reducedBelowPct)]++;
    console.log(
      "    stati: " +
        (Object.keys(counts) as (keyof typeof counts)[])
          .map((k) => `${TRANSIT_STATE_LABELS[k]} ${counts[k]} (${((counts[k] / values.length) * 100).toFixed(1)}%)`)
          .join(" · ")
    );
  }
  for (const [key, points] of [
    ["hormuz", hormuz],
    ["bab_el_mandeb", bab],
  ] as const) {
    const b = CHOKEPOINT_BASELINES[key];
    const lastDate = points[points.length - 1].date;
    console.log(`\n=== ${key} — scostamento della media a 7 giorni dalla baseline`);
    describe(
      "periodo di riferimento",
      rollingDeviations(points, b, b.period).map((r) => r.deviationPct),
      b.reducedBelowPct
    );
    // Dopo la rottura: dal 7° giorno del nuovo regime all'ultimo dato.
    const afterFrom = b.breakDate;
    describe(
      `dopo la rottura (${afterFrom} → ${lastDate})`,
      rollingDeviations(points, b, { from: afterFrom, to: lastDate }).map((r) => r.deviationPct),
      b.reducedBelowPct
    );
  }

  console.log(
    mismatches === 0
      ? "\nTutti i valori coincidono con CHOKEPOINT_BASELINES."
      : `\nATTENZIONE: ${mismatches} valori non coincidono più con CHOKEPOINT_BASELINES.`
  );
  console.log("(sola lettura: nessuna scrittura sul database)");
  return mismatches === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Errore:", err);
    process.exit(1);
  });
