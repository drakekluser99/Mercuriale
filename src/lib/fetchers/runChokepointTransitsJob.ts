import { fetchAllChokepointTransits } from "./portwatch";
import { saveChokepointTransits } from "./saveChokepointTransits";
import { startFetchRun, finishFetchRun, errorMessage } from "./fetchRunLog";

export const CHOKEPOINT_SOURCE = "imf_portwatch";
export const CHOKEPOINT_JOB = "fetch-chokepoint-transits";

export type ChokepointJobResult =
  | { ok: true; runId: number | null; saved: number; latestRecordedAt: Date | null }
  | { ok: false; runId: number | null; error: string };

/**
 * Un'esecuzione completa del cron dei transiti: apre il record in
 * `fetch_runs`, scarica, salva, chiude il record con l'esito.
 *
 * Sta qui e non dentro route.ts (come runMarketPriceCron per le materie
 * prime) perché la chiamano in due: la route del cron e
 * `scripts/inspect-portwatch.ts --save`. Così la verifica a mano esegue lo
 * STESSO codice del cron, riga in `fetch_runs` compresa, e non una copia
 * che potrebbe divergere.
 *
 * Non lancia: restituisce l'esito. L'errore è già stato registrato in
 * `fetch_runs` e sulla console; chi chiama decide come rispondere.
 */
export async function runChokepointTransitsJob(): Promise<ChokepointJobResult> {
  const runId = await startFetchRun(CHOKEPOINT_SOURCE, CHOKEPOINT_JOB);

  try {
    // Prima si scarica e si controlla TUTTO, poi si scrive: se un passaggio
    // fallisce la validazione, nessuna riga arriva al database.
    const points = await fetchAllChokepointTransits();
    const { saved, latestRecordedAt } = await saveChokepointTransits(
      points,
      CHOKEPOINT_SOURCE,
      runId
    );
    await finishFetchRun(runId, { ok: true, pointsSaved: saved, latestRecordedAt });
    return { ok: true, runId, saved, latestRecordedAt };
  } catch (err) {
    console.error(`Errore nel cron ${CHOKEPOINT_JOB}:`, err);
    const error = errorMessage(err);
    await finishFetchRun(runId, { ok: false, errorText: error });
    return { ok: false, runId, error };
  }
}
