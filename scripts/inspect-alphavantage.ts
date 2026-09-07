/**
 * Esegui con: npx tsx scripts/inspect-alphavantage.ts TUA_API_KEY
 *
 * Ottieni una API key gratuita su:
 * https://www.alphavantage.co/support/#api-key
 *
 * Nato dall'analisi tecnica del 7/9/2026: `/stato-dati` mostra i batch 3/4/5
 * (alluminio/grano, mais/cotone, zucchero/caffè) fermi al 01/07/2026 da 68
 * giorni, nonostante il cron risulti "OK" ogni giorno. Il codice del
 * fetcher (src/lib/fetchers/alphaVantage.ts) NON sta fallendo in silenzio —
 * logga esplicitamente ogni risposta anomala (`Information`/`Note`/`Error
 * Message`) — quindi il sospetto è che sia Alpha Vantage stessa a non avere
 * ancora pubblicato un punto più recente per queste 6 materie prime, non un
 * bug qui. Questo script stampa la risposta grezza per ciascuna, così si
 * vede con i propri occhi cosa risponde LA FONTE in questo momento, invece
 * di dedurlo dal comportamento del sito.
 *
 * Cosa guardare nell'output: il campo `data[0]` di ogni risposta è il punto
 * più recente secondo Alpha Vantage.
 *   - Se `data[0].date` è già oltre il 2026-07-01 → il dato nuovo esiste
 *     dalla fonte ma il sito non lo sta prendendo: è un bug da qui, da
 *     controllare in fetchOne()/fetchCommoditySeries() (alphaVantage.ts).
 *   - Se `data[0].date` è ancora 2026-07-01 → Alpha Vantage non ha
 *     pubblicato un mese più recente per questo simbolo: non c'è niente da
 *     correggere nel codice, è un limite/ritardo della fonte stessa (i dati
 *     "commodities" di Alpha Vantage derivano dal Pink Sheet della Banca
 *     Mondiale, che storicamente ha un ritardo di pubblicazione reale).
 *   - Se compare `Information`/`Note` invece di `data` → quota/rate limit
 *     esaurito nel momento in cui hai lanciato lo script: riprova più tardi,
 *     non è la stessa cosa di "fonte ferma".
 */

// `export {}` senza nulla da esportare: serve solo a far sì che TypeScript
// tratti questo file come un MODULO invece che come uno "script" globale.
// Senza questa riga, `apiKey` e `main` dichiarati sotto finiscono nello
// scope globale del progetto — ed è esattamente quello che è successo con
// `scripts/inspect-eia.ts`, che dichiara le stesse due identità allo stesso
// modo: `npx tsc --noEmit` li vedeva come una ridichiarazione dello stesso
// nome, non come due file indipendenti. `inspect-eia.ts` esisteva da prima
// senza questo problema perché non c'era ancora un secondo file globale con
// gli stessi nomi; con `inspect-alphavantage.ts` il conflitto è comparso.
export {};

const STUCK_SYMBOLS = [
  { functionName: "ALUMINUM", label: "Alluminio (batch 3)" },
  { functionName: "WHEAT", label: "Grano (batch 3)" },
  { functionName: "CORN", label: "Mais (batch 4)" },
  { functionName: "COTTON", label: "Cotone (batch 4)" },
  { functionName: "SUGAR", label: "Zucchero (batch 5)" },
  { functionName: "COFFEE", label: "Caffè (batch 5)" },
] as const;

const apiKey = process.argv[2];
if (!apiKey) {
  console.error("Uso: npx tsx scripts/inspect-alphavantage.ts TUA_API_KEY");
  process.exit(1);
}

// Sequenziale con pausa, stessa cautela di fetchCommodityBatch in
// alphaVantage.ts: chiamate in parallelo hanno già fatto scattare il rate
// limit di Alpha Vantage in passato (vedi il commento su COMMODITY_BATCH_*).
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  for (const { functionName, label } of STUCK_SYMBOLS) {
    const url = `https://www.alphavantage.co/query?function=${functionName}&interval=monthly&apikey=${apiKey}`;
    console.log(`\n=== ${label} (${functionName}) ===`);

    const res = await fetch(url);
    const json = (await res.json()) as {
      data?: Array<{ date: string; value: string }>;
      Information?: string;
      Note?: string;
      "Error Message"?: string;
    };

    const anomaly = json.Information ?? json.Note ?? json["Error Message"];
    if (anomaly) {
      console.log("Risposta anomala:", anomaly);
    } else if (json.data && json.data.length > 0) {
      console.log("Punto più recente (data[0]):", json.data[0]);
      console.log("Punti totali nella serie:", json.data.length);
    } else {
      console.log("Risposta senza `data` e senza messaggio di anomalia:", json);
    }

    await sleep(2000);
  }
}

main().catch((err) => {
  console.error("Errore:", err);
  process.exit(1);
});
