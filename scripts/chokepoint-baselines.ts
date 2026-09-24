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
 * - Suez (aggiunto il 24/9 con la modalità candidato qui sotto), PIATTA,
 *   23/12/2022 – 22/12/2023: stesso criterio, rottura il 23/12/2023.
 *
 * I valori sono stati fissati il 24/9 in CHOKEPOINT_BASELINES
 * (chokepointHistory.ts), da cui lo script prende anche i periodi. Ora
 * serve da VERIFICA: ricalcola dai dati e dice se coincidono ancora con la
 * costante. Se no, la fonte ha rivisto lo storico: si decide a mano se
 * aggiornare la costante (e la metodologia).
 *
 * MODALITÀ CANDIDATO (24 set 2026, per aggiungere Suez): prova un periodo
 * e un metodo per un passaggio che non ha ancora una baseline, senza
 * toccare il codice.
 *
 *   npm run chokepoint:baselines -- --candidate suez --method stagionale \
 *     --from 2022-11-01 --to 2023-10-31 --break 2023-12-16
 *
 * Stampa il normale (per mese o unico), la soglia di "ridotto" proposta
 * (5° percentile dello scostamento della media a 7 giorni nel periodo,
 * lo stesso criterio degli altri due passaggi), quante settimane cadono in
 * ogni stato nel periodo e dopo `--break` (facoltativo), e lo stato della
 * settimana più recente. Sono NUMERI DA DISCUTERE, non una decisione: il
 * periodo si sceglie guardando le medie mensili del backfill.
 */
import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local", override: false });


const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function pct(value: number, base: number): string {
  const d = (value / base - 1) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}

/** Una data "AAAA-MM-GG" che esiste davvero (niente 2023-13-01 o 31/02). */
function isDay(d: string | undefined): d is string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
}

function readFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const candidate = readFlag(args, "--candidate");
  const method = readFlag(args, "--method");
  const from = readFlag(args, "--from");
  const to = readFlag(args, "--to");
  const breakDate = readFlag(args, "--break");
  // Argomenti controllati PRIMA di aprire il database: un comando scritto
  // male deve dire come si usa, non dare un errore di connessione.
  if (candidate) {
    if ((method !== "stagionale" && method !== "piatta") || !isDay(from) || !isDay(to)) {
      console.error(
        "Uso: --candidate <chiave> --method stagionale|piatta --from AAAA-MM-GG --to AAAA-MM-GG [--break AAAA-MM-GG]"
      );
      return 1;
    }
    if (breakDate !== undefined && !isDay(breakDate)) {
      console.error(`--break vuole una data AAAA-MM-GG esistente, ricevuto "${breakDate}"`);
      return 1;
    }
  }
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

  if (candidate) {
    const points = await load(candidate);
    if (points.length === 0) {
      // Mai un calcolo a vuoto: chiave sbagliata o backfill non ancora fatto.
      console.error(`Nessuna riga per "${candidate}" in chokepoint_transits: prima il backfill con --save.`);
      return 1;
    }
    const period = { from: from as string, to: to as string };
    console.log(`\n=== ${candidate} — CANDIDATO ${(method as string).toUpperCase()}, dal ${period.from} al ${period.to}`);
    console.log(`(righe in tabella: ${points.length}, dal ${points[0].date} al ${points.at(-1)!.date})`);

    // Stesso tipo delle baseline fissate, così rollingDeviations e
    // transitState fanno esattamente il calcolo che farà il sito.
    let baseline: import("../src/lib/chokepointHistory").BaselineValues;
    if (method === "stagionale") {
      const seasonalC = seasonalBaseline(points, period);
      console.log("mese · giorni ·  media · min · max");
      for (const m of seasonalC) {
        console.log(
          `  ${MONTHS[m.month - 1]} ·  ${String(m.days).padStart(3)} · ${m.mean.toFixed(2).padStart(6)} · ${String(m.min).padStart(3)} · ${String(m.max).padStart(3)}`
        );
      }
      baseline = {
        method: "stagionale",
        period,
        breakDate: breakDate ?? "",
        monthly: seasonalC.map((m) => Number(m.mean.toFixed(2))),
      };
    } else {
      const flatC = flatBaseline(points, period);
      console.log(`  giorni ${flatC.days} · media ${flatC.mean.toFixed(2)} · min ${flatC.min} · max ${flatC.max}`);
      baseline = { method: "piatta", period, breakDate: breakDate ?? "", value: Number(flatC.mean.toFixed(2)) };
    }

    const inPeriod = rollingDeviations(points, baseline, period).map((r) => r.deviationPct);
    const p5 = Number(percentile(inPeriod, 5).toFixed(1));
    console.log(`\nSoglia di "ridotto" proposta (p5 nel periodo): ${p5}%`);
    const PCTS_C = [1, 5, 10, 50, 90, 95, 99];
    const counts = (values: number[]) => {
      const c = { normale: 0, ridotto: 0, fortemente_ridotto: 0 };
      for (const v of values) c[transitState(v, p5)]++;
      return (Object.keys(c) as (keyof typeof c)[])
        .map((k) => `${TRANSIT_STATE_LABELS[k]} ${c[k]} (${((c[k] / values.length) * 100).toFixed(1)}%)`)
        .join(" · ");
    };
    console.log(
      `  periodo (${inPeriod.length} finestre): min ${Math.min(...inPeriod).toFixed(1)}% · ` +
        PCTS_C.map((p) => `p${p} ${percentile(inPeriod, p).toFixed(1)}%`).join(" · ") +
        ` · max ${Math.max(...inPeriod).toFixed(1)}%`
    );
    console.log(`    stati: ${counts(inPeriod)}`);
    if (breakDate) {
      const after = rollingDeviations(points, baseline, { from: breakDate, to: points.at(-1)!.date }).map(
        (r) => r.deviationPct
      );
      console.log(`  dopo la rottura (${breakDate} → ${points.at(-1)!.date}, ${after.length} finestre):`);
      console.log(
        `    ` + PCTS_C.map((p) => `p${p} ${percentile(after, p).toFixed(1)}%`).join(" · ")
      );
      console.log(`    stati: ${counts(after)}`);
    }
    const w = lastWeek(points);
    const base = baseline.method === "stagionale" ? baseline.monthly[Number(w.to.slice(5, 7)) - 1] : baseline.value;
    const dev = (w.mean / base - 1) * 100;
    console.log(
      `\nUltima settimana: media ${w.mean.toFixed(2)} (${w.from} → ${w.to}), normale ${base.toFixed(2)} → ` +
        `${pct(w.mean, base)} · stato: ${TRANSIT_STATE_LABELS[transitState(dev, p5)]}`
    );
    console.log("(sola lettura: nessuna scrittura sul database)");
    return 0;
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

  // Baseline PIATTE: Bab el-Mandeb e, dal 24/9, Suez. Stesso controllo per
  // entrambe: ricalcolo della media sul periodo e confronto con la costante.
  const flatPoints: Record<string, { date: string; transitCalls: number }[]> = {};
  for (const key of ["bab_el_mandeb", "suez"] as const) {
    const b = CHOKEPOINT_BASELINES[key];
    const points = await load(key);
    flatPoints[key] = points;
    console.log(`\n=== ${key} — baseline PIATTA, dal ${b.period.from} al ${b.period.to}`);
    console.log(`(righe in tabella: ${points.length})`);
    const flat = flatBaseline(points, b.period);
    if (!same(flat.mean, b.value)) mismatches++;
    console.log(
      `  giorni ${flat.days} · media ${flat.mean.toFixed(2)} · min ${flat.min} · max ${flat.max}` +
        (same(flat.mean, b.value) ? "" : `  ≠ costante ${b.value}`)
    );
    const w = lastWeek(points);
    console.log(
      `Oggi: media ${w.mean.toFixed(2)} transiti/giorno (${w.from} → ${w.to}), ` +
        `baseline ${b.value.toFixed(2)} → ${pct(w.mean, b.value)} · ` +
        `stato: ${TRANSIT_STATE_LABELS[transitState((w.mean / b.value - 1) * 100, b.reducedBelowPct)]}`
    );
  }

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
    ["bab_el_mandeb", flatPoints.bab_el_mandeb],
    ["suez", flatPoints.suez],
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
