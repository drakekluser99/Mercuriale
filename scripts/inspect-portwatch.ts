/**
 * Ispezione e primo salvataggio dei transiti IMF PortWatch (23 set 2026).
 *
 *   npm run inspect:portwatch              # scarica, controlla, STAMPA soltanto
 *   npm run inspect:portwatch -- --save    # esegue il cron vero e SALVA
 *
 * Senza `--save`: niente database (non serve nemmeno DATABASE_URL). Per
 * ogni passaggio stampa prima UNA riga così come arriva dalla fonte, poi il
 * risultato del parser. La riga grezza serve a vedere con i propri occhi il
 * formato del campo `date`, mai osservato su una risposta reale quando il
 * parser è stato scritto (vedi portwatch.ts): se il parser la rifiuta,
 * l'errore compare qui, prima di qualunque scrittura.
 *
 * Con `--save`: chiama runChokepointTransitsJob, lo stesso codice della
 * route del cron, quindi scrive anche la riga in `fetch_runs` (job
 * "fetch-chokepoint-transits"). Poi la rilegge e la stampa insieme al
 * conteggio delle righe in tabella.
 */
import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local", override: false });

async function inspect() {
  const { CHOKEPOINTS, buildQueryUrl, parsePortwatchResponse } = await import(
    "../src/lib/fetchers/portwatch"
  );

  let failures = 0;
  for (const cp of CHOKEPOINTS) {
    console.log(`\n=== ${cp.portname} (${cp.portid} → "${cp.key}")`);
    const url = buildQueryUrl(cp);
    console.log(`URL: ${url}`);

    const res = await fetch(url);
    console.log(`HTTP ${res.status}`);
    if (!res.ok) {
      failures++;
      console.error(`RICHIESTA FALLITA: ${(await res.text()).slice(0, 300)}`);
      continue;
    }
    const json = (await res.json()) as { features?: { attributes?: unknown }[] };

    const first = json.features?.[0]?.attributes;
    console.log("Prima riga grezza dalla fonte:");
    console.log(first ? JSON.stringify(first, null, 2) : "(nessuna riga)");
    if (first && typeof first === "object" && "date" in first) {
      const d = (first as { date: unknown }).date;
      console.log(`→ campo date: ${JSON.stringify(d)} (tipo ${typeof d})`);
    }

    try {
      const points = parsePortwatchResponse(json, cp);
      const dates = points.map((p) => p.date).sort();
      console.log(
        `Parser OK: ${points.length} giorni, dal ${dates[0]} al ${dates.at(-1)}`
      );
      console.log("Ultimi 7 giorni (data · transiti · capacità stimata):");
      for (const p of [...points].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7)) {
        console.log(`  ${p.date} · ${p.transitCalls} · ${p.tradeVolumeEst ?? "—"}`);
      }
    } catch (err) {
      failures++;
      console.error(`PARSER FERMO: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return failures;
}

async function save() {
  const { runChokepointTransitsJob } = await import(
    "../src/lib/fetchers/runChokepointTransitsJob"
  );
  const { db } = await import("../src/lib/db/client");
  const { fetchRuns, chokepointTransits } = await import("../src/lib/db/schema");
  const { eq, sql } = await import("drizzle-orm");

  console.log("\nEsecuzione del cron (runChokepointTransitsJob)...");
  const result = await runChokepointTransitsJob();
  console.log("Esito:", JSON.stringify(result, null, 2));

  if (result.runId !== null) {
    const [run] = await db.select().from(fetchRuns).where(eq(fetchRuns.id, result.runId));
    console.log("\nRiga in fetch_runs:");
    console.log(JSON.stringify(run, null, 2));
  } else {
    console.log("\n(fetch_runs non scrivibile: runId null)");
  }

  const counts = await db
    .select({
      chokepoint: chokepointTransits.chokepoint,
      rows: sql<number>`count(*)::int`,
      first: sql<string>`min(${chokepointTransits.recordedAt})::date::text`,
      last: sql<string>`max(${chokepointTransits.recordedAt})::date::text`,
    })
    .from(chokepointTransits)
    .groupBy(chokepointTransits.chokepoint);
  console.log("\nRighe in chokepoint_transits:");
  for (const c of counts) {
    console.log(`  ${c.chokepoint}: ${c.rows} righe, dal ${c.first} al ${c.last}`);
  }
  return result.ok ? 0 : 1;
}

async function main() {
  const failures = await inspect();
  if (!process.argv.includes("--save")) {
    console.log("\n(--save non passato: nessuna scrittura sul database)");
    return failures;
  }
  if (failures > 0) {
    // Il cron si fermerebbe comunque con lo stesso errore; qui ci si ferma
    // prima, per non lasciare in fetch_runs un run fallito "di prova".
    console.error("\nParser fermo su almeno un passaggio: --save annullato.");
    return failures;
  }
  return save();
}

main()
  .then((code) => process.exit(code ? 1 : 0))
  .catch((err) => {
    console.error("Errore:", err);
    process.exit(1);
  });
