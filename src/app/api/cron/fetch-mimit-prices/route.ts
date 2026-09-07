import { NextRequest, NextResponse } from "next/server";
import { fetchAndAggregateMimit } from "@/lib/fetchers/mimit";
import { saveMimitPrices } from "@/lib/fetchers/saveMimitPrices";
import {
  startFetchRun,
  finishFetchRun,
  errorMessage,
} from "@/lib/fetchers/fetchRunLog";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

/**
 * Cron Fase 4 (MIMIT) — stesso scheletro delle altre route in
 * src/app/api/cron/*. `fetchAndAggregateMimit` (src/lib/fetchers/mimit.ts)
 * è stata verificata il 7 set 2026 con `npm run inspect:mimit` contro un
 * file reale (0 righe orfane, 0 sigle provincia sconosciute su 93.097
 * righe — vedi il commento in mimit.ts). Due cose in più rispetto alle
 * altre route, mantenute come rete di sicurezza PERMANENTE, non solo per
 * il primo lancio — un CSV pubblico può cambiare formato senza preavviso,
 * e questa route non ha modo di saperlo se non guardando i contatori ad
 * ogni run:
 *
 * 1. I contatori di scarto (`diagnostics`) vengono loggati SEMPRE, non
 *    solo in caso di errore: prima che qualcuno se ne accorga guardando i
 *    prezzi, questa è l'unica traccia che il formato reale del CSV si sia
 *    discostato da quanto documentato in mimit.ts.
 * 2. Se più della metà delle righe prezzo risulta "orfana" (idImpianto non
 *    riconosciuto), il run si ferma PRIMA di scrivere: un parsing rotto
 *    che passasse comunque salverebbe una media calcolata su una frazione
 *    minuscola e non rappresentativa degli impianti attesi, in modo
 *    silenzioso — è la stessa filosofia "fail closed" di cronAuth.ts,
 *    applicata ai dati invece che alla sicurezza.
 */

// 24k righe di anagrafica + 93k righe di prezzo da scaricare e fare il
// parsing in memoria: più pesante delle altre fonti (che sono risposte
// JSON di poche centinaia di punti), ma comunque testo puro, non file
// binari — 30s dovrebbero bastare abbondantemente. Se i log di Vercel
// mostrano timeout, il prossimo passo è fare lo streaming del parsing CSV
// invece di bufferizzare tutto il file, non solo alzare questo numero.
export const maxDuration = 30;

const SOURCE = "mimit";

// Soglia oltre la quale un run MIMIT viene considerato fallito invece che
// salvato: vedi punto 2 del commento sopra.
const MAX_ORPHAN_SHARE = 0.5;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const runId = await startFetchRun(SOURCE, "fetch-mimit-prices");

  try {
    const result = await fetchAndAggregateMimit();
    const { diagnostics } = result;

    console.log(
      `[fetch-mimit-prices] estrazione=${result.extractedOn ?? "?"} ` +
        `codifica=${diagnostics.decodingUsedFallback ? "windows-1252 (fallback)" : "utf-8"} ` +
        `impianti=${diagnostics.totalStations} righePrezzo=${diagnostics.totalPriceRows} ` +
        `orfane=${diagnostics.orphanPriceRows} ` +
        `provinceSconosciute=${diagnostics.unknownProvinceCodes.size} ` +
        `carburantiScartati=${diagnostics.unknownFuelTypes.size} ` +
        `combinazioni=${result.aggregates.length}`
    );

    const orphanShare =
      diagnostics.totalPriceRows > 0
        ? diagnostics.orphanPriceRows / diagnostics.totalPriceRows
        : 0;

    if (orphanShare > MAX_ORPHAN_SHARE) {
      const msg =
        `Troppe righe orfane (${(orphanShare * 100).toFixed(0)}% su ` +
        `${diagnostics.totalPriceRows}) — probabile problema di parsing ` +
        `(anagrafica/prezzi disallineati o formato cambiato), run interrotto ` +
        `senza scrivere sul database`;
      console.error(`[fetch-mimit-prices] ${msg}`);
      await finishFetchRun(runId, { ok: false, errorText: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const { written, recordedAt } = await saveMimitPrices(result, SOURCE);

    await finishFetchRun(runId, {
      ok: true,
      pointsSaved: written,
      latestRecordedAt: recordedAt,
    });
    return NextResponse.json({ ok: true, written });
  } catch (err) {
    console.error("Errore nel cron fetch-mimit-prices:", err);
    await finishFetchRun(runId, { ok: false, errorText: errorMessage(err) });
    return NextResponse.json({ error: "Fetch fallito" }, { status: 500 });
  }
}
