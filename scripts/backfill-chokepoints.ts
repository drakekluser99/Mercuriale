/**
 * Backfill dello storico dei transiti IMF PortWatch (24 set 2026).
 *
 *   npm run backfill:chokepoints                          # scarica, controlla, STAMPA
 *   npm run backfill:chokepoints -- --around 2023-11-19   # + giorni attorno a una data
 *   npm run backfill:chokepoints -- --save                # scrive in chokepoint_transits
 *
 * Opzioni:
 *   --around AAAA-MM-GG   stampa i valori giornalieri attorno a quella data
 *   --weeks N             ampiezza della finestra di --around (default 4)
 *   --only hormuz         un solo passaggio (chiave di CHOKEPOINTS)
 *   --accept-gaps         con --save: salva anche se il calendario ha buchi
 *
 * Senza `--save` non tocca il database e non serve DATABASE_URL. Stampa per
 * ogni passaggio: righe ricevute contro righe dichiarate dalla fonte,
 * intervallo di date, buchi nel calendario, medie mensili. Le medie mensili
 * servono a vedere DOVE la serie si stacca dal suo livello abituale; poi
 * `--around` mostra i singoli giorni attorno a quel punto, per escludere
 * che sia un giorno anomalo isolato.
 *
 * Buchi nel calendario: se ce ne sono, `--save` si rifiuta. Prima va
 * verificato se sono buchi DICHIARATI dalla fonte (la metodologia PortWatch
 * ne ha segnalati in passato per copertura AIS): in quel caso sono un
 * limite della fonte da scrivere in metodologia, e `--accept-gaps` dice
 * esplicitamente "controllato, salva lo stesso". Senza quella verifica, un
 * buco resta un errore.
 *
 * Idempotente: stesso upsert del cron (saveChokepointTransits). Si
 * rilancia senza doppioni. Non scrive in fetch_runs, come gli altri
 * backfill: è un caricamento una tantum, non un'esecuzione del cron.
 */
import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local", override: false });

function readFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function fmt(n: number): string {
  return n.toFixed(1).padStart(6);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const save = args.includes("--save");
  const acceptGaps = args.includes("--accept-gaps");
  const around = readFlag(args, "--around");
  const weeks = Number(readFlag(args, "--weeks") ?? "4");
  const only = readFlag(args, "--only");

  if (around && !/^\d{4}-\d{2}-\d{2}$/.test(around)) {
    console.error(`--around vuole una data AAAA-MM-GG, ricevuto "${around}"`);
    return 1;
  }

  const { CHOKEPOINTS, fetchChokepointHistory } = await import(
    "../src/lib/fetchers/portwatch"
  );
  const { findDateGaps, monthlyAverages, dailyWindow } = await import(
    "../src/lib/chokepointHistory"
  );

  const selected = only ? CHOKEPOINTS.filter((c) => c.key === only) : [...CHOKEPOINTS];
  if (selected.length === 0) {
    // Mai un filtro che non trova niente e prosegue a vuoto.
    console.error(
      `--only "${only}" non corrisponde a nessun passaggio: ${CHOKEPOINTS.map((c) => c.key).join(", ")}`
    );
    return 1;
  }

  const collected = [];
  let totalGaps = 0;

  for (const cp of selected) {
    console.log(`\n=== ${cp.portname} (${cp.key})`);
    const { points, sourceCount, pages } = await fetchChokepointHistory(cp);
    const dates = points.map((p) => p.date).sort();
    console.log(
      `Righe ricevute: ${points.length} in ${pages} pagine (la fonte ne dichiara ${sourceCount})`
    );
    console.log(`Intervallo: dal ${dates[0]} al ${dates.at(-1)}`);

    const gaps = findDateGaps(dates);
    totalGaps += gaps.length;
    if (gaps.length === 0) {
      console.log("Calendario continuo: nessun giorno mancante.");
    } else {
      console.log(`GIORNI MANCANTI: ${gaps.length} intervalli`);
      for (const g of gaps) {
        console.log(`  ${g.from} → ${g.to} (${g.days} giorni)`);
      }
    }

    const zeroCapacity = points.filter((p) => p.tradeVolumeEst === 0 && p.transitCalls > 0).length;
    const nullCapacity = points.filter((p) => p.tradeVolumeEst === null).length;
    console.log(
      `Capacità: ${zeroCapacity} giorni con transiti ma capacità 0 (stima non disponibile), ${nullCapacity} giorni con capacità null`
    );

    const series = points.map((p) => ({ date: p.date, transitCalls: p.transitCalls }));
    console.log("\nMedie mensili dei transiti giornalieri (mese · giorni · media · min · max):");
    for (const m of monthlyAverages(series)) {
      console.log(`  ${m.month} · ${String(m.days).padStart(2)} · ${fmt(m.mean)} · ${String(m.min).padStart(3)} · ${String(m.max).padStart(3)}`);
    }

    if (around) {
      console.log(`\nValori giornalieri da ${weeks} settimane prima a ${weeks} dopo il ${around}:`);
      for (const d of dailyWindow(series, around, weeks)) {
        console.log(`  ${d.date}${d.date === around ? " ◀" : "  "} ${String(d.transitCalls).padStart(4)}`);
      }
    }

    collected.push(...points);
  }

  if (!save) {
    console.log("\n(--save non passato: nessuna scrittura sul database)");
    return 0;
  }
  if (totalGaps > 0 && !acceptGaps) {
    console.error(
      "\nIl calendario ha dei buchi: --save annullato. Verificare prima se sono dichiarati " +
        "dalla fonte; se sì, rilanciare con --accept-gaps."
    );
    return 1;
  }

  const { saveChokepointTransits } = await import(
    "../src/lib/fetchers/saveChokepointTransits"
  );
  const { db } = await import("../src/lib/db/client");
  const { chokepointTransits } = await import("../src/lib/db/schema");
  const { sql } = await import("drizzle-orm");

  console.log(`\nSalvataggio di ${collected.length} righe in chokepoint_transits...`);
  const { saved, latestRecordedAt } = await saveChokepointTransits(
    collected,
    "imf_portwatch",
    null
  );
  console.log(`Righe scritte: ${saved}, dato più recente: ${latestRecordedAt?.toISOString().slice(0, 10)}`);

  const counts = await db
    .select({
      chokepoint: chokepointTransits.chokepoint,
      rows: sql<number>`count(*)::int`,
      first: sql<string>`min(${chokepointTransits.recordedAt})::date::text`,
      last: sql<string>`max(${chokepointTransits.recordedAt})::date::text`,
      withRun: sql<number>`count(${chokepointTransits.fetchRunId})::int`,
    })
    .from(chokepointTransits)
    .groupBy(chokepointTransits.chokepoint);
  console.log("\nRighe in chokepoint_transits dopo il salvataggio:");
  for (const c of counts) {
    console.log(
      `  ${c.chokepoint}: ${c.rows} righe, dal ${c.first} al ${c.last} (${c.withRun} con fetch_run_id del cron)`
    );
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Errore:", err);
    process.exit(1);
  });
