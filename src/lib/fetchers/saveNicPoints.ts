import { and, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { consumerPriceIndex } from "@/lib/db/schema";
import {
  isCorrection,
  logCorrectionIfChanged,
  toNumberOrNull,
  type CorrectionCandidate,
} from "./correctionsLog";
import { monthToDate, type NicPoint } from "./istatNic";

/**
 * Salva i punti NIC di ISTAT in `consumer_price_index`. Stesso schema di
 * saveChokepointTransits: INSERT a blocchi con upsert sul vincolo unico
 * (serie, mese). Il cron chiede ogni giorno gli ultimi mesi: quelli già
 * salvati si riscrivono, nessuno si duplica.
 *
 * Prima di scrivere legge, con UNA query, le righe già salvate per gli
 * stessi mesi. Serve a due cose:
 *
 * 1. Fermarsi se un mese già salvato arriva in un'ALTRA base. Non deve
 *    succedere (le basi non si sovrappongono), e se succede un confronto
 *    fra i due indici sarebbe fra scale diverse: 146,1 in base 2015 contro
 *    98,9 in base 2025 non è una correzione, è un cambio di base.
 * 2. Registrare in `data_corrections` le revisioni di ISTAT (un indice o
 *    una variazione già salvati che la fonte ripubblica diversi). Solo nel
 *    cron (`logCorrections: true`): il backfill è la prima scrittura dello
 *    storico, non una revisione — stessa regola di savePricePointsBulk.
 *
 * `saved` conta le righe TOCCATE, non quelle nuove (convenzione di
 * `points_saved`, vedi CLAUDE.md); per sapere se è arrivato un mese nuovo
 * si guarda `latestRecordedAt`.
 */
const CHUNK_SIZE = 500;
const TABLE = "consumer_price_index";

export type SavedNicRow = {
  category: string;
  recordedAt: Date;
  baseYear: number;
  indexValue: string;
  yoyChangePct: string | null;
};

/**
 * Confronta i punti in arrivo con le righe già salvate. Pura: niente
 * database, si prova con righe finte.
 *
 * Lancia un errore se un mese cambia base; altrimenti restituisce le
 * correzioni candidate (una per campo). Che siano DAVVERO diverse lo
 * decide `logCorrectionIfChanged`, con la sua tolleranza: qui si elencano
 * tutte, così la regola di "cosa è una correzione" resta in un posto solo.
 */
export function compareWithSaved(
  points: readonly NicPoint[],
  saved: readonly SavedNicRow[],
  source: string,
  runId: number | null
): CorrectionCandidate[] {
  const byKey = new Map(saved.map((r) => [`${r.category}|${r.recordedAt.toISOString()}`, r]));
  const candidates: CorrectionCandidate[] = [];

  for (const p of points) {
    const recordedAt = monthToDate(p.month);
    const old = byKey.get(`${p.category}|${recordedAt.toISOString()}`);
    if (!old) continue;

    if (old.baseYear !== p.baseYear) {
      throw new Error(
        `ISTAT NIC: ${p.category} ${p.month} è salvato in base ${old.baseYear} ma arriva in base ${p.baseYear} — non si salva niente`
      );
    }

    const common = { tableName: TABLE, entityLabel: `NIC ${p.category}`, recordedAt, source, runId };
    candidates.push(
      {
        ...common,
        field: "index_value",
        oldValue: toNumberOrNull(old.indexValue),
        newValue: p.indexValue,
      },
      {
        ...common,
        field: "yoy_change_pct",
        oldValue: toNumberOrNull(old.yoyChangePct),
        newValue: p.yoyChangePct,
      }
    );
  }
  return candidates;
}

export async function saveNicPoints(
  points: readonly NicPoint[],
  source: string,
  runId: number | null,
  { logCorrections }: { logCorrections: boolean }
): Promise<{ saved: number; corrections: number; latestRecordedAt: Date | null }> {
  if (points.length === 0) return { saved: 0, corrections: 0, latestRecordedAt: null };

  const months = points.map((p) => p.month).sort();
  const first = monthToDate(months[0]);
  const last = monthToDate(months[months.length - 1]);
  const categories = [...new Set(points.map((p) => p.category))];

  // Una query sola per tutte le righe esistenti nel periodo: con il driver
  // neon-http ogni query è una richiesta HTTP, e una per mese sarebbe
  // centinaia di richieste nel backfill.
  const existing = await db
    .select({
      category: consumerPriceIndex.category,
      recordedAt: consumerPriceIndex.recordedAt,
      baseYear: consumerPriceIndex.baseYear,
      indexValue: consumerPriceIndex.indexValue,
      yoyChangePct: consumerPriceIndex.yoyChangePct,
    })
    .from(consumerPriceIndex)
    .where(
      and(
        inArray(consumerPriceIndex.category, categories),
        gte(consumerPriceIndex.recordedAt, first),
        lte(consumerPriceIndex.recordedAt, last)
      )
    );

  // Il controllo della base si fa SEMPRE, anche nel backfill, e PRIMA di
  // scrivere: se scatta, la tabella resta com'era.
  const candidates = compareWithSaved(points, existing, source, runId);

  const retrievedAt = new Date();
  let saved = 0;
  for (let i = 0; i < points.length; i += CHUNK_SIZE) {
    const chunk = points.slice(i, i + CHUNK_SIZE);
    await db
      .insert(consumerPriceIndex)
      .values(
        chunk.map((p) => ({
          category: p.category,
          recordedAt: monthToDate(p.month),
          baseYear: p.baseYear,
          indexValue: p.indexValue.toString(),
          yoyChangePct: p.yoyChangePct?.toString() ?? null,
          retrievedAt,
          fetchRunId: runId,
          source,
        }))
      )
      .onConflictDoUpdate({
        target: [consumerPriceIndex.category, consumerPriceIndex.recordedAt],
        set: {
          // `excluded.*`: ogni riga dell'INSERT ha il suo valore (vedi
          // CLAUDE.md, savePricePointsBulk).
          indexValue: sql`excluded.index_value`,
          // COALESCE: se una risposta arriva senza la variazione di un mese
          // che l'aveva, il valore già salvato non si cancella. Un valore
          // nuovo e diverso lo sostituisce (ed è registrato come correzione).
          yoyChangePct: sql`coalesce(excluded.yoy_change_pct, ${consumerPriceIndex.yoyChangePct})`,
          retrievedAt: sql`excluded.retrieved_at`,
          // Il backfill scrive senza run e non cancella l'id del cron.
          fetchRunId: sql`coalesce(excluded.fetch_run_id, ${consumerPriceIndex.fetchRunId})`,
        },
      });
    saved += chunk.length;
  }

  // Le correzioni si registrano DOPO che il dato è salvato: se il registro
  // non è scrivibile, `logCorrectionIfChanged` lo scrive in console e il
  // salvataggio resta valido (il logging non fa mai fallire il fetch).
  let corrections = 0;
  if (logCorrections) {
    for (const c of candidates.filter(isCorrection)) {
      corrections++;
      await logCorrectionIfChanged(c);
    }
  }

  return { saved, corrections, latestRecordedAt: last };
}
