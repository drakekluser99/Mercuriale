import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chokepointTransits } from "@/lib/db/schema";
import type { ChokepointTransitPoint } from "./portwatch";

/**
 * Salva i transiti PortWatch. Stesso schema di saveSwissFuelPrices: INSERT
 * a blocchi con upsert sul vincolo unico (passaggio, giorno). Ogni giorno
 * il cron richiede gli ultimi 60 giorni: quelli già salvati si riscrivono
 * (e se la fonte li ha rivisti, prendono il valore nuovo), nessuno si
 * duplica.
 *
 * Non scrive in `data_corrections`: il registro correzioni oggi copre solo
 * i prezzi. Estenderlo anche qui è possibile, ma è una scelta a parte.
 *
 * `saved` conta le righe TOCCATE, non quelle nuove — stessa convenzione di
 * `points_saved` negli altri cron (vedi CLAUDE.md). Per sapere se è
 * arrivato un giorno nuovo si guarda `latestRecordedAt`.
 */
const CHUNK_SIZE = 500;

export async function saveChokepointTransits(
  points: ChokepointTransitPoint[],
  source: string,
  runId: number | null
): Promise<{ saved: number; latestRecordedAt: Date | null }> {
  const retrievedAt = new Date();
  let saved = 0;

  for (let i = 0; i < points.length; i += CHUNK_SIZE) {
    const chunk = points.slice(i, i + CHUNK_SIZE);
    await db
      .insert(chokepointTransits)
      .values(
        chunk.map((p) => ({
          chokepoint: p.chokepoint,
          // "AAAA-MM-GG" letto come mezzanotte UTC, come gli altri dati
          // giornalieri e mensili (MIMIT, Svizzera).
          recordedAt: new Date(p.date),
          transitCalls: p.transitCalls,
          tradeVolumeEst: p.tradeVolumeEst?.toString() ?? null,
          retrievedAt,
          fetchRunId: runId,
          source,
        }))
      )
      .onConflictDoUpdate({
        target: [chokepointTransits.chokepoint, chokepointTransits.recordedAt],
        set: {
          // `excluded.*`: in un INSERT a più righe ogni riga ha il suo
          // valore, un valore fisso le appiattirebbe tutte (vedi CLAUDE.md,
          // savePricePointsBulk).
          transitCalls: sql`excluded.transit_calls`,
          tradeVolumeEst: sql`excluded.trade_volume_est`,
          retrievedAt: sql`excluded.retrieved_at`,
          // COALESCE: il backfill scrive senza un run (runId null) e non
          // deve cancellare l'id del cron dalle righe che quel cron aveva
          // già scritto. Un run vero, con un id, lo aggiorna sempre.
          fetchRunId: sql`coalesce(excluded.fetch_run_id, ${chokepointTransits.fetchRunId})`,
        },
      });
    saved += chunk.length;
  }

  const latest = points.map((p) => p.date).sort().at(-1);
  return { saved, latestRecordedAt: latest ? new Date(latest) : null };
}
