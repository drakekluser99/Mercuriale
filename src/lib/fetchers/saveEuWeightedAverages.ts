import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { euWeightedAverages } from "@/lib/db/schema";
import type { EuWeightedAveragePoint } from "./euOilBulletinHistory";

/**
 * Salva la media UE ponderata (blocco C, 15 set 2026).
 *
 * Un solo INSERT per blocco di righe invece di uno per riga: il cron ne
 * scrive 2 a settimana, ma il backfill di dieci anni ne scrive ~1.000, e
 * su `neon-http` ogni query è una richiesta HTTP separata.
 *
 * "Upsert": se la settimana esiste già (la Commissione a volte ripubblica
 * valori rivisti) si aggiorna la riga invece di fallire sul vincolo unico.
 * `excluded` è il nome che Postgres dà alla riga che si stava cercando di
 * inserire: `excluded.price` = il nuovo prezzo.
 */
const CHUNK_SIZE = 500;

export async function saveEuWeightedAverages(
  points: EuWeightedAveragePoint[],
  source: string
): Promise<number> {
  const retrievedAt = new Date();
  let written = 0;

  for (let i = 0; i < points.length; i += CHUNK_SIZE) {
    const chunk = points.slice(i, i + CHUNK_SIZE);
    await db
      .insert(euWeightedAverages)
      .values(
        chunk.map((p) => ({
          fuelType: p.fuelType,
          price: p.pricePerLiter.toString(),
          priceNet: p.priceNetPerLiter?.toString() ?? null,
          recordedAt: new Date(p.date),
          retrievedAt,
          source,
        }))
      )
      .onConflictDoUpdate({
        target: [euWeightedAverages.fuelType, euWeightedAverages.recordedAt],
        set: {
          price: sql`excluded.price`,
          priceNet: sql`excluded.price_net`,
          retrievedAt: sql`excluded.retrieved_at`,
        },
      });
    written += chunk.length;
  }

  return written;
}
