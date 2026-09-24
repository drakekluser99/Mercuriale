import { getCommoditySymbolHistory, getRecentChokepointTransits } from "@/lib/db/queries";
import { WINDOW_DAYS } from "@/lib/chokepointStatus";
import { findHistoryWindow, type HistoryWindowKey } from "@/lib/historyWindows";
import { buildShippingChart } from "@/lib/shippingChart";

const DAY_MS = 86_400_000;

/**
 * Le serie del grafico transiti + Brent per un periodo (24 set 2026).
 * Una funzione sola per la pagina (periodo iniziale) e per /api/history
 * (gli altri periodi, al clic): le due strade non possono dare numeri
 * diversi per lo stesso periodo.
 *
 * I transiti si leggono da 6 giorni PRIMA dell'inizio del periodo: servono
 * alla media mobile a 7 giorni del primo giorno mostrato.
 */
export async function loadShippingChart(windowKey: HistoryWindowKey, now: Date) {
  const range = findHistoryWindow(windowKey);
  if (!range) throw new Error(`Periodo sconosciuto: ${windowKey}`);
  const from = new Date(now.getTime() - range.days * DAY_MS);
  const [transits, brent] = await Promise.all([
    getRecentChokepointTransits(new Date(from.getTime() - (WINDOW_DAYS - 1) * DAY_MS)),
    getCommoditySymbolHistory("BRENT", from),
  ]);
  return buildShippingChart(transits, brent, from.toISOString().slice(0, 10));
}
