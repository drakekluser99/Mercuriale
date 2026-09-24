/**
 * Backfill dello storico NIC di ISTAT (inflazione), dal 2016 (24 set 2026).
 *
 *   npm run backfill:nic                                   # UNA richiesta, controlla, STAMPA, salva il file
 *   npm run backfill:nic -- --file istat-nic-backfill.xml  # rilegge il file: nessuna richiesta
 *   npm run backfill:nic -- --file istat-nic-backfill.xml --save   # scrive in consumer_price_index
 *   npm run backfill:nic -- --cron                         # esegue il cron vero (UNA richiesta, riga in fetch_runs)
 *
 * LIMITE ISTAT: 5 richieste al minuto per IP, e superarlo blocca l'IP per
 * 1-2 GIORNI. Per questo il primo lancio scarica tutto con UNA richiesta
 * (le 4 serie × 2 basi × indice e variazione insieme) e salva la risposta
 * in `istat-nic-backfill.xml` (nella cartella da cui si lancia; è in
 * .gitignore). Ogni lancio successivo, compreso quello con `--save`, va
 * fatto con `--file`: rilegge il file e non interroga ISTAT.
 *
 * Senza `--save` non tocca il database e non serve DATABASE_URL. Stampa:
 * mesi ricevuti per serie e per base, mesi mancanti, il controllo del
 * raccordo (i due coefficienti ufficiali DEVONO uscire uguali dal calcolo,
 * altrimenti si ferma) e i coefficienti calcolati di carrello ed
 * energetici da fissare in `CALCULATED_SPLICE_2015_TO_2025`
 * (src/lib/nicSplice.ts).
 *
 * `--save` si rifiuta se una serie ha mesi mancanti. Idempotente: stesso
 * upsert del cron. Non scrive in `fetch_runs` né in `data_corrections`,
 * come gli altri backfill (prima scrittura, non una revisione).
 */
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local", override: false });

const DEFAULT_FILE = "istat-nic-backfill.xml";
const FROM = "2016-01";

// "2016-01, 2016-02, …, 2016-05, 2018-03" → "2016-01 → 2016-05 (5 mesi), 2018-03":
// cento mesi mancanti in fila restano leggibili su una riga.
function monthRanges(months: string[]): string {
  const next = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  };
  const parts: string[] = [];
  let start = months[0];
  let prev = months[0];
  for (const m of [...months.slice(1), ""]) {
    if (m !== "" && m === next(prev)) {
      prev = m;
      continue;
    }
    const n = months.indexOf(prev) - months.indexOf(start) + 1;
    parts.push(start === prev ? start : `${start} → ${prev} (${n} mesi)`);
    start = m;
    prev = m;
  }
  return parts.join(", ");
}

function readFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const save = args.includes("--save");
  const cron = args.includes("--cron");
  const file = readFlag(args, "--file");

  const { buildNicUrl, parseNicGenericData, assertAllCategories, missingMonths, NIC_CATEGORIES } =
    await import("../src/lib/fetchers/istatNic");
  const { checkSplice, toBase2025 } = await import("../src/lib/nicSplice");

  // --cron: lo STESSO codice della route, riga in fetch_runs compresa.
  if (cron) {
    const { runNicJob } = await import("../src/lib/fetchers/runNicJob");
    const result = await runNicJob();
    console.log(result);
    return result.ok ? 0 : 1;
  }

  // 1. La risposta: dal file, oppure UNA richiesta che poi si salva.
  let xml: string;
  if (file) {
    if (!existsSync(file)) {
      console.error(`File non trovato: ${file}`);
      return 1;
    }
    xml = readFileSync(file, "utf8");
    console.log(`Letto ${file} (${xml.length} caratteri) — nessuna richiesta a ISTAT.`);
  } else {
    if (existsSync(DEFAULT_FILE)) {
      // Il file c'è già: scaricare di nuovo sarebbe una richiesta sprecata.
      console.error(
        `${DEFAULT_FILE} esiste già: rilancia con --file ${DEFAULT_FILE} (niente richiesta a ISTAT), ` +
          `oppure cancellalo se vuoi davvero riscaricare.`
      );
      return 1;
    }
    const url = buildNicUrl(["39", "85"], FROM);
    console.log(`UNA richiesta a ISTAT:\n  ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    xml = await res.text();
    if (!res.ok) {
      console.error(`HTTP ${res.status} — ${xml.slice(0, 300)}`);
      if (res.status === 429) console.error("Limite ISTAT superato: NON riprovare per almeno un giorno.");
      return 1;
    }
    writeFileSync(DEFAULT_FILE, xml);
    console.log(`Risposta salvata in ${DEFAULT_FILE} (${xml.length} caratteri).`);
  }

  // 2. Lettura e controlli: nessuna scrittura finché non tornano tutti.
  const points = parseNicGenericData(xml);
  assertAllCategories(points);

  console.log("\nMesi ricevuti per serie:");
  for (const { code, name } of NIC_CATEGORIES) {
    const rows = points.filter((p) => p.category === code);
    const byBase = (b: number) => rows.filter((p) => p.baseYear === b).map((p) => p.month);
    const b15 = byBase(2015);
    const b25 = byBase(2025);
    console.log(
      `  ${code.padEnd(8)} ${name}\n` +
        `           base 2015: ${b15.length} mesi (${b15[0] ?? "—"} → ${b15.at(-1) ?? "—"})\n` +
        `           base 2025: ${b25.length} mesi (${b25[0] ?? "—"} → ${b25.at(-1) ?? "—"})`
    );
  }

  const gaps = missingMonths(points, FROM);
  const withGaps = Object.entries(gaps).filter(([, m]) => m.length > 0);
  if (withGaps.length === 0) {
    console.log(`\nNessun mese mancante dal ${FROM}.`);
  } else {
    console.log("\nMESI MANCANTI:");
    for (const [code, months] of withGaps) console.log(`  ${code}: ${monthRanges(months)}`);
  }

  // 3. Il controllo del raccordo. Si ferma (eccezione) se il calcolo non
  //    riproduce i coefficienti ufficiali di 00 e 01.
  const serie = (code: string) => points.filter((p) => p.category === code);
  const report = checkSplice({
    "00": serie("00"),
    "01": serie("01"),
    FOODHPC: serie("FOODHPC"),
    ENRGY: serie("ENRGY"),
  });

  console.log("\nRaccordo base 2015 → 2025 (media 2025 in base 2015 ÷ 100):");
  for (const r of report) {
    const state =
      r.kind === "ufficiale"
        ? `coincide con l'ufficiale ${r.fixed}`
        : r.fixed === null
          ? "NON ancora fissato → copiare in CALCULATED_SPLICE_2015_TO_2025"
          : r.matches
            ? `coincide con il valore fissato ${r.fixed}`
            : `DIVERSO dal valore fissato ${r.fixed} — verificare prima di cambiarlo`;
    console.log(`  ${r.category.padEnd(8)} ${r.kind.padEnd(10)} ${r.computed.toFixed(3)}  ${state}`);
  }

  // Prova a occhio: dicembre 2025 raccordato deve stare vicino a 100
  // (è l'ultimo mese dell'anno che vale 100 nella base nuova).
  console.log("\nDicembre 2025 portato in base 2025 (deve stare vicino a 100):");
  for (const { code } of NIC_CATEGORIES) {
    const dec = points.find((p) => p.category === code && p.month === "2025-12");
    const v = dec ? toBase2025(code, dec.baseYear, dec.indexValue) : null;
    console.log(`  ${code.padEnd(8)} ${v === null ? "— (coefficiente non fissato)" : v.toFixed(1)}`);
  }

  if (!save) {
    console.log(`\nNiente scritto (manca --save). ${points.length} righe pronte.`);
    return 0;
  }

  if (withGaps.length > 0) {
    console.error("\n--save rifiutato: ci sono mesi mancanti (vedi sopra).");
    return 1;
  }

  // Import dinamico: il client del database vuole DATABASE_URL, che senza
  // --save non serve.
  const { saveNicPoints } = await import("../src/lib/fetchers/saveNicPoints");
  const { NIC_SOURCE } = await import("../src/lib/fetchers/runNicJob");
  const result = await saveNicPoints(points, NIC_SOURCE, null, { logCorrections: false });
  console.log(
    `\nScritte ${result.saved} righe in consumer_price_index ` +
      `(ultimo mese: ${result.latestRecordedAt?.toISOString().slice(0, 7) ?? "—"}).`
  );
  return 0;
}

// `process.exitCode` e non `process.exit()`: chiudere di colpo mentre la
// connessione al database si sta ancora chiudendo fa stampare a Node su
// Windows "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" (visto
// al primo --save del 24/9, DOPO che le righe erano già scritte). Così
// Node esce da solo quando non ha più niente in sospeso.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
