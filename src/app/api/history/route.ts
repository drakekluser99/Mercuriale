import { NextRequest, NextResponse } from "next/server";
import {
  getCommodityPriceHistory,
  getFuelAverageHistory,
} from "@/lib/db/queries";
import { groupCommodityHistory, groupFuelHistory } from "@/lib/priceHistory";
import { downsampleSeries, findHistoryWindow } from "@/lib/historyWindows";
import { loadShippingChart } from "@/lib/shippingChartData";

/**
 * GET /api/history?kind=commodities|fuel|chokepoints&window=1m|3m|1a|5a|10a
 *
 * Serie storiche per i grafici della home, quando si sceglie una finestra
 * diversa da quella caricata con la pagina (15 set 2026). La home continua
 * a caricare subito 90 giorni (materie prime) e 30 (carburanti): le
 * finestre lunghe arrivano da qui SOLO se qualcuno le chiede, così la
 * prima visita resta leggera.
 *
 * Risponde con le stesse `PriceSeries` che il grafico riceve dalla pagina,
 * già sfoltite (vedi historyWindows.ts). Non è un'API "pubblica" come
 * /api/data: nessun CORS aperto, forma pensata per il grafico.
 *
 * `kind=chokepoints` (24 set 2026) risponde con `{ window, chokepoints }`:
 * le serie del grafico transiti + Brent (vedi src/lib/shippingChart.ts),
 * già raggruppate a blocchi sui periodi lunghi.
 *
 * CACHE: lo storico cambia al massimo qualche volta al giorno (i cron),
 * quindi la CDN di Vercel può tenere la risposta per un'ora
 * (`s-maxage=3600`) e servirla ancora per un giorno mentre la rinnova in
 * background (`stale-while-revalidate`). Senza, ogni clic su "10 anni"
 * rifarebbe la query intera sul database.
 */

export const maxDuration = 10;

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  const windowKey = request.nextUrl.searchParams.get("window") ?? "";
  // `range` e non `window`: `window` è un nome globale del browser, meglio
  // non riusarlo nemmeno sul server per non confondere chi legge.
  const range = findHistoryWindow(windowKey);

  // Parametri validati contro elenchi chiusi: un valore sconosciuto è un
  // errore esplicito (400), non un ripiego silenzioso su un default.
  if ((kind !== "commodities" && kind !== "fuel" && kind !== "chokepoints") || !range) {
    return NextResponse.json(
      {
        error:
          "Parametri non validi: kind=commodities|fuel|chokepoints, window=1m|3m|1a|5a|10a",
      },
      { status: 400 },
    );
  }

  const since = new Date(Date.now() - range.days * 24 * 60 * 60 * 1000);

  const headers = {
    "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  };

  try {
    if (kind === "chokepoints") {
      const chokepoints = await loadShippingChart(range.key, new Date());
      return NextResponse.json({ window: range.key, chokepoints }, { headers });
    }

    const series =
      kind === "commodities"
        ? groupCommodityHistory(await getCommodityPriceHistory(since))
        : groupFuelHistory(await getFuelAverageHistory(since));

    return NextResponse.json(
      { window: range.key, series: downsampleSeries(series) },
      { headers },
    );
  } catch (err) {
    console.error("Errore in /api/history:", err);
    return NextResponse.json(
      { error: "Storico non disponibile in questo momento" },
      { status: 500 },
    );
  }
}
