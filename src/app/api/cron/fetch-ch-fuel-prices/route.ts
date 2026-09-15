import { NextRequest, NextResponse } from "next/server";
import { fetchSwissFuelPrices } from "@/lib/fetchers/swissFuelPrices";
import { saveSwissFuelPrices } from "@/lib/fetchers/saveSwissFuelPrices";
import {
  startFetchRun,
  finishFetchRun,
  errorMessage,
} from "@/lib/fetchers/fetchRunLog";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

/**
 * Carburanti in Svizzera (blocco D, 15 set 2026) — BFS + cambio BCE.
 *
 * Il BFS pubblica una volta al mese, nei primi giorni (la versione con i
 * dati di agosto 2026 è uscita il 3 settembre). Il cron gira quindi dal 1°
 * al 10 di ogni mese (vedi vercel.json): nei giorni in cui non c'è niente
 * di nuovo l'upsert riscrive gli stessi valori, e il costo è trascurabile.
 *
 * Si salvano gli ultimi 3 mesi e non solo l'ultimo: il BFS ripubblica
 * l'intera serie e può rivedere un mese appena passato, e un cambio BCE
 * mancante al primo passaggio si recupera al successivo.
 */
export const maxDuration = 30;

const SOURCE = "bfs_lik";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const runId = await startFetchRun(SOURCE, "fetch-ch-fuel-prices");

  try {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 3, 1);
    const points = await fetchSwissFuelPrices({
      fromMonth: since.toISOString().slice(0, 10),
    });
    if (points.length === 0) {
      throw new Error("La tabella BFS non contiene prezzi negli ultimi 3 mesi.");
    }
    const { saved, latestRecordedAt } = await saveSwissFuelPrices(points, SOURCE);

    await finishFetchRun(runId, { ok: true, pointsSaved: saved, latestRecordedAt });
    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    console.error("Errore nel cron fetch-ch-fuel-prices:", err);
    await finishFetchRun(runId, { ok: false, errorText: errorMessage(err) });
    return NextResponse.json({ error: "Fetch fallito" }, { status: 500 });
  }
}
