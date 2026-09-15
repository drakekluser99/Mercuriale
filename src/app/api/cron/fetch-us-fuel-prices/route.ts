import { NextRequest, NextResponse } from "next/server";
import { fetchUsFuelPrices } from "@/lib/fetchers/eiaUs";
import { saveUsFuelPrices } from "@/lib/fetchers/saveUsFuelPrices";
import {
  startFetchRun,
  finishFetchRun,
  errorMessage,
} from "@/lib/fetchers/fetchRunLog";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

// CADENZA (15 set 2026): questo cron gira OGNI GIORNO alle 23 UTC, anche
// se il dato EIA è settimanale. Prima girava solo il lunedì alle 18 UTC,
// ma l'EIA non pubblica sempre di lunedì: nella settimana del Labor Day
// (7 set 2026) il dato è uscito mercoledì 9, e il rilascio successivo era
// annunciato per martedì 15. Con un solo tentativo il lunedì, ogni
// slittamento faceva arrivare il dato sul sito con una settimana di
// ritardo.
// Girare tutti i giorni non crea doppioni: il salvataggio è un upsert sul
// vincolo unico (regione, carburante, data), quindi nei giorni senza
// novità riscrive le stesse righe; e il registro correzioni scrive solo se
// il valore CAMBIA davvero. Il costo è una chiamata API al giorno invece
// di una a settimana, ben dentro i limiti gratuiti dell'EIA.
// Le 23 UTC (non le 18) per stare il più tardi possibile nella giornata,
// dopo la pubblicazione americana: su Vercel Hobby il cron può partire
// fino a 59 minuti dopo, quindi resta comunque entro la stessa data UTC.
export const maxDuration = 10;

const SOURCE = "eia_us";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const runId = await startFetchRun(SOURCE, "fetch-us-fuel-prices");

  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    await finishFetchRun(runId, {
      ok: false,
      errorText: "EIA_API_KEY non configurata",
    });
    return NextResponse.json(
      { error: "EIA_API_KEY non configurata" },
      { status: 500 }
    );
  }

  try {
    const points = await fetchUsFuelPrices(apiKey);
    const { saved, latestRecordedAt } = await saveUsFuelPrices(
      points,
      SOURCE,
      runId
    );

    await finishFetchRun(runId, {
      ok: true,
      pointsSaved: saved,
      latestRecordedAt,
    });
    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    console.error("Errore nel cron fetch-us-fuel-prices:", err);
    await finishFetchRun(runId, { ok: false, errorText: errorMessage(err) });
    return NextResponse.json({ error: "Fetch fallito" }, { status: 500 });
  }
}
