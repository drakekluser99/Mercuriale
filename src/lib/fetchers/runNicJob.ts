import { cronStartPeriod, fetchNic } from "./istatNic";
import { saveNicPoints } from "./saveNicPoints";
import { startFetchRun, finishFetchRun, errorMessage } from "./fetchRunLog";

export const NIC_SOURCE = "istat_nic";
export const NIC_JOB = "fetch-istat-nic";

export type NicJobResult =
  | {
      ok: true;
      runId: number | null;
      saved: number;
      corrections: number;
      latestRecordedAt: Date | null;
    }
  | { ok: false; runId: number | null; error: string };

/**
 * Un'esecuzione completa del cron NIC: apre il record in `fetch_runs`,
 * scarica, salva, chiude il record con l'esito. Separata dalla route per
 * lo stesso motivo di runChokepointTransitsJob: la usa anche lo script di
 * backfill (`--cron`), così la prova a mano esegue lo STESSO codice.
 *
 * Solo la base 2025 (`85`): lo storico in base 2015 lo carica il backfill
 * una volta sola, e non cambia più. Se un giorno ISTAT cambia base, il
 * parser incontra un DATA_TYPE sconosciuto e il run fallisce con un
 * errore esplicito: è il segnale che serve un raccordo nuovo, non un dato
 * da salvare in silenzio.
 *
 * Non lancia: restituisce l'esito, già registrato in `fetch_runs`.
 */
export async function runNicJob(now: Date = new Date()): Promise<NicJobResult> {
  const runId = await startFetchRun(NIC_SOURCE, NIC_JOB);

  try {
    // Prima si scarica e si controlla tutto (quattro serie presenti), poi
    // si scrive: una risposta incompleta non arriva al database.
    const points = await fetchNic(["85"], cronStartPeriod(now));
    const { saved, corrections, latestRecordedAt } = await saveNicPoints(
      points,
      NIC_SOURCE,
      runId,
      { logCorrections: true }
    );
    await finishFetchRun(runId, { ok: true, pointsSaved: saved, latestRecordedAt });
    return { ok: true, runId, saved, corrections, latestRecordedAt };
  } catch (err) {
    console.error(`Errore nel cron ${NIC_JOB}:`, err);
    const error = errorMessage(err);
    await finishFetchRun(runId, { ok: false, errorText: error });
    return { ok: false, runId, error };
  }
}
