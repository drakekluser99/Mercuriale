import { NextRequest, NextResponse } from "next/server";
import { runNicJob } from "@/lib/fetchers/runNicJob";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

/**
 * Inflazione in Italia: indice NIC di ISTAT (24 set 2026).
 *
 * CADENZA: ogni giorno alle 11 UTC (vercel.json), anche se il dato è
 * mensile. ISTAT pubblica il dato definitivo di un mese verso metà del
 * mese dopo (agosto 2026 il 16/9), con un calendario che può spostarsi:
 * con un tentativo al giorno il dato arriva il giorno stesso, e negli
 * altri giorni l'upsert riscrive gli stessi mesi senza righe nuove.
 * Le 11 UTC sono dopo l'uscita dei comunicati (le 10 di Roma) e in
 * un'ora che nessun altro cron usa.
 *
 * LIMITE ISTAT: 5 richieste al minuto per IP, e superarlo blocca l'IP per
 * 1-2 giorni. Qui c'è UNA richiesta per esecuzione e nessun nuovo
 * tentativo (vedi istatNic.ts): se fallisce, riprova il cron di domani.
 */

// Una richiesta da pochi KB: bastano pochi secondi. `fetchNic` ha un
// timeout di 8 s, sotto questo limite.
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const result = await runNicJob();
  if (!result.ok) {
    return NextResponse.json({ error: "Fetch fallito" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: result.saved, corrections: result.corrections });
}
