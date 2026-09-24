import { NextRequest, NextResponse } from "next/server";
import { runChokepointTransitsJob } from "@/lib/fetchers/runChokepointTransitsJob";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

/**
 * Traffico marittimo nei passaggi obbligati (IMF PortWatch, 23 set 2026).
 *
 * CADENZA: ogni giorno alle 15 UTC (vercel.json), come il bollettino UE,
 * anche se la fonte pubblica una volta a settimana (di norma il martedì).
 * Stesso motivo dei cron UE e USA: la pubblicazione può slittare, e con un
 * solo tentativo settimanale un giorno di ritardo diventerebbe una
 * settimana di dato vecchio. Nei giorni senza novità l'upsert riscrive gli
 * stessi giorni: nessuna riga nuova.
 *
 * Tutta la logica sta in runChokepointTransitsJob.ts, condivisa con lo
 * script di verifica `npm run inspect:portwatch -- --save`.
 */

// Una richiesta JSON da 60 righe per passaggio (tre dal 24/9, con Suez;
// con due il run durava 1,5 s): pochi secondi bastano. 10 come le altre
// fonti JSON (EIA, Alpha Vantage).
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const result = await runChokepointTransitsJob();
  if (!result.ok) {
    return NextResponse.json({ error: "Fetch fallito" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: result.saved });
}
