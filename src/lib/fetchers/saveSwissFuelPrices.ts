import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { swissFuelPrices } from "@/lib/db/schema";
import type { SwissFuelPoint } from "./swissFuelPrices";

/**
 * Salva i prezzi svizzeri (blocco D). Stesso schema di
 * saveEuWeightedAverages: INSERT a blocchi con upsert sul vincolo unico
 * (carburante, mese). Il BFS ripubblica ogni mese l'intera serie, quindi
 * un valore rivisto aggiorna la riga invece di duplicarla; e se il cambio
 * BCE non c'era al primo giro, arriva al giro successivo.
 */
const CHUNK_SIZE = 500;

export async function saveSwissFuelPrices(
  points: SwissFuelPoint[],
  source: string
): Promise<{ saved: number; latestRecordedAt: Date | null }> {
  const retrievedAt = new Date();
  let saved = 0;

  for (let i = 0; i < points.length; i += CHUNK_SIZE) {
    const chunk = points.slice(i, i + CHUNK_SIZE);
    await db
      .insert(swissFuelPrices)
      .values(
        chunk.map((p) => ({
          fuelType: p.fuelType,
          priceChf: p.priceChf.toString(),
          chfPerEur: p.chfPerEur?.toString() ?? null,
          recordedAt: new Date(p.month),
          retrievedAt,
          source,
        }))
      )
      .onConflictDoUpdate({
        target: [swissFuelPrices.fuelType, swissFuelPrices.recordedAt],
        set: {
          priceChf: sql`excluded.price_chf`,
          // COALESCE: se questa volta il cambio manca, non si cancella
          // quello salvato in un giro precedente.
          chfPerEur: sql`coalesce(excluded.chf_per_eur, ${swissFuelPrices.chfPerEur})`,
          retrievedAt: sql`excluded.retrieved_at`,
        },
      });
    saved += chunk.length;
  }

  const latest = points.map((p) => p.month).sort().at(-1);
  return { saved, latestRecordedAt: latest ? new Date(latest) : null };
}
