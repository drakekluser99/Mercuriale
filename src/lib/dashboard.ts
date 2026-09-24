import { cache } from "react";
import {
  getLatestCommodityPrices,
  getLatestFuelPrices,
  getCommodityPriceHistory,
  getFuelPriceHistory,
  getLatestWeeklyNarratives,
  getLatestItalianFuelPrices,
  getLatestFetchRuns,
  getFuelAverageHistory,
  getLatestEuWeightedAverageRows,
  getLatestSwissFuelRows,
  getRecentChokepointTransits,
  getConsumerPriceIndex,
} from "@/lib/db/queries";
import { summarizeInflation } from "@/lib/inflation";
import { buildInflationChart } from "@/lib/inflationChart";
import { monthToDate } from "@/lib/fetchers/istatNic";
import {
  CHOKEPOINT_SHORT_NAMES,
  furthestFromNormal,
  summarizeChokepoints,
} from "@/lib/chokepointStatus";
import { loadShippingChart } from "@/lib/shippingChartData";
import { summarizeSwissFuel } from "@/lib/swissFuel";
import { summarizeEuWeightedAverage } from "@/lib/euWeightedAverage";
import { groupCommodityHistory, groupFuelHistory, priceMovers } from "@/lib/priceHistory";
import { displayCommodityPrice } from "@/lib/commodityDisplay";
import {
  formatCommodityPrice,
  formatDate,
  formatDateTime,
  formatFuelPrice,
  formatDecimal,
  formatPercent,
  shortUnit,
  currencySymbol,
} from "@/lib/format";
import { computeFreshness, getFreshnessConfig } from "@/lib/freshness/compute";
import { computeEuropeFuelStats } from "@/lib/europeFuelStats";
import { computeItalianFuelStats } from "@/lib/italianFuelStats";
import { provinceForCode } from "@/lib/provinces";
import {
  italyVsEuAverage,
  italyVsNeighbours,
  euPetrolTaxShare,
  biggestMover,
  euPetrolSpread,
  provincePetrolSelfSpread,
} from "@/lib/sectionHighlights";
import { valueAtOrBefore, daysBefore } from "@/lib/pastValue";
import { figureOfTheDay } from "@/lib/annualFigures";
import type { TickerStat } from "@/components/TickerBand";

/**
 * DATI DELLE PAGINE — 16 set 2026.
 *
 * Fino al 15 settembre tutti questi calcoli vivevano dentro `app/page.tsx`,
 * perché la home era l'unica pagina. Con la home divisa in pagine (vedi
 * src/lib/siteNav.ts) ogni pagina ha bisogno solo di una parte: qui ci
 * sono le "porzioni" (`loadFuel`, `loadCommodities`, ...), ciascuna con
 * le sue query.
 *
 * `cache()` di React: dentro UNA richiesta, chiamare due volte la stessa
 * funzione esegue la query una volta sola. La home usa diverse porzioni
 * che condividono query (i prezzi dei carburanti servono a tre di loro):
 * senza `cache` le stesse righe verrebbero lette più volte. Fra una
 * richiesta e l'altra non si ricorda niente: le pagine restano dinamiche.
 *
 * Le finestre temporali (90 giorni, 30 giorni, ...) sono calcolate DENTRO
 * le funzioni in cache e non passate come argomento: `cache` confronta gli
 * argomenti, e due `new Date()` diversi non sarebbero mai "uguali".
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Un solo "adesso" per richiesta: tutte le freschezze usano lo stesso. */
export const getNow = cache(() => new Date());

const commodityPricesQ = cache(() => getLatestCommodityPrices());
const fuelPricesQ = cache(() => getLatestFuelPrices());
// Materie prime 90 giorni, carburanti 30: le mensili (rame, mais...) in 30
// giorni non avrebbero nessun punto e sparirebbero dal grafico.
const commodityHistoryQ = cache(() =>
  getCommodityPriceHistory(new Date(getNow().getTime() - 90 * DAY_MS))
);
const fuelHistoryQ = cache(() =>
  getFuelPriceHistory(new Date(getNow().getTime() - 30 * DAY_MS))
);
// Poco più di un anno di medie, per il "un anno fa" del calcolatore.
const fuelYearHistoryQ = cache(() =>
  getFuelAverageHistory(new Date(getNow().getTime() - 400 * DAY_MS))
);
const narrativesQ = cache(() => getLatestWeeklyNarratives());
const italianPricesQ = cache(() => getLatestItalianFuelPrices());
const fetchRunsQ = cache(() => getLatestFetchRuns());
// Dati accessori: se la tabella non esiste ancora (deploy prima di
// `db:migrate`) la pagina funziona lo stesso, senza quella parte.
const euWeightedQ = cache(() =>
  getLatestEuWeightedAverageRows().catch((err) => {
    console.error("Media UE ponderata non disponibile:", err);
    return [];
  })
);
// Traffico marittimo: 30 giorni bastano per la media degli ultimi 7 anche
// quando la fonte pubblica in ritardo (esce una volta a settimana).
const chokepointQ = cache(() =>
  getRecentChokepointTransits(new Date(getNow().getTime() - 30 * DAY_MS)).catch((err) => {
    console.error("Traffico marittimo non disponibile:", err);
    return [];
  })
);
// Inflazione (ISTAT, NIC): tutto lo storico, poche centinaia di righe.
const inflationQ = cache(() =>
  getConsumerPriceIndex().catch((err) => {
    console.error("Inflazione non disponibile:", err);
    return [];
  })
);
const swissQ = cache(() =>
  getLatestSwissFuelRows().catch((err) => {
    console.error("Carburanti Svizzera non disponibili:", err);
    return [];
  })
);

export const CATEGORY_LABELS: Record<string, string> = {
  energy: "Energia",
  metal: "Metalli",
  // Sostantivo e non "Agricole": l'etichetta sta da sola in una colonna.
  agricultural: "Agricoltura",
};

const CONTINENT_LABELS: Record<string, string> = {
  europe: "Europa",
  north_america: "Nord America",
  oceania: "Oceania",
  latam: "America Latina",
};

/**
 * Da quale fonte arriva ciascun continente, per la freschezza. Mappa
 * esplicita e NON esaustiva: `getFreshnessConfig` lancia un errore su una
 * fonte sconosciuta, e un continente non elencato resta semplicemente
 * senza etichetta invece di far cadere la pagina.
 */
const CONTINENT_SOURCES: Record<string, string> = {
  europe: "eu_weekly_oil_bulletin",
  north_america: "eia_us",
};

/** Colonne dell'export materie prime (chiavi = colonne CSV / campi JSON). */
export const COMMODITY_EXPORT_COLUMNS = [
  { key: "materia_prima", label: "Materia prima" },
  { key: "simbolo", label: "Simbolo" },
  { key: "categoria", label: "Categoria" },
  { key: "prezzo", label: "Prezzo" },
  { key: "unita", label: "Unità" },
  { key: "data", label: "Data" },
];

const findRun = (runs: Awaited<ReturnType<typeof getLatestFetchRuns>>, job: string) =>
  runs.find((r) => r.job === job) ?? null;

// ─── Materie prime ──────────────────────────────────────────────────────

export const loadCommodities = cache(async () => {
  const [prices, history] = await Promise.all([commodityPricesQ(), commodityHistoryQ()]);
  const now = getNow();
  const series = groupCommodityHistory(history);

  // Conversione di SOLA visualizzazione (cotone da cents/pound a
  // cents/kg): il dato grezzo resta intatto.
  const rows = prices.map((c) => {
    const display = displayCommodityPrice(c.symbol, parseFloat(c.price), c.unit);
    const freshnessConfig = getFreshnessConfig(c.source, c.symbol);
    return {
      ...c,
      displayPrice: display.unit === c.unit ? c.price : display.price.toFixed(4),
      displayUnit: display.unit,
      freshnessState: computeFreshness(c.recordedAt, freshnessConfig, now),
      freshnessLabel: freshnessConfig.label,
      ageDays: Math.floor((now.getTime() - c.recordedAt.getTime()) / DAY_MS),
      recordedAtFormatted: formatDate(c.recordedAt),
    };
  });

  const exportRows = rows.map((c) => ({
    materia_prima: c.name,
    simbolo: c.symbol,
    categoria: CATEGORY_LABELS[c.category] ?? c.category,
    prezzo: c.displayPrice,
    unita: c.displayUnit,
    data: c.recordedAt.toISOString().slice(0, 10),
  }));

  return {
    rows,
    exportRows,
    series,
    topMover: biggestMover(priceMovers(series)),
  };
});

// ─── Carburanti (Europa, USA, confinanti) ───────────────────────────────

export const loadFuel = cache(async () => {
  const [prices, history, runs, euWeightedRows, swissRows] = await Promise.all([
    fuelPricesQ(),
    fuelHistoryQ(),
    fetchRunsQ(),
    euWeightedQ(),
    swissQ(),
  ]);
  const now = getNow();

  const byContinent = new Map<string, typeof prices>();
  for (const fuel of prices) {
    const list = byContinent.get(fuel.continent) ?? [];
    list.push(fuel);
    byContinent.set(fuel.continent, list);
  }

  // Righe già pronte per FuelPriceTable (Client Component): date e
  // freschezza calcolate qui, lato server, e passate come stringhe.
  const tables = Array.from(byContinent.entries()).map(([continent, fuels]) => ({
    continent,
    label: CONTINENT_LABELS[continent] ?? continent,
    fuels: fuels.map((f) => ({
      regionName: f.regionName,
      fuelType: f.fuelType as "petrol" | "diesel",
      price: f.price,
      currency: f.currency,
      recordedAtFormatted: formatDate(f.recordedAt),
      freshness: CONTINENT_SOURCES[continent]
        ? computeFreshness(f.recordedAt, getFreshnessConfig(CONTINENT_SOURCES[continent]), now)
        : undefined,
    })),
  }));

  // Media SEMPLICE dei 27 (Malta pesa come la Germania): per questo le
  // etichette dicono "media dei 27". La ponderata è `euWeighted`.
  const { countries, average } = computeEuropeFuelStats(prices);

  const usFuels = byContinent.get("north_america") ?? [];
  const usPrice = (type: string) => {
    const f = usFuels.find((x) => x.fuelType === type);
    return f ? parseFloat(f.price) : null;
  };

  return {
    prices,
    byContinent,
    tables,
    series: groupFuelHistory(history),
    countries,
    average,
    usPetrol: usPrice("petrol"),
    usDiesel: usPrice("diesel"),
    euWeighted: summarizeEuWeightedAverage(euWeightedRows),
    swiss: summarizeSwissFuel(swissRows),
    neighbours: italyVsNeighbours(countries),
    italyGap: italyVsEuAverage(countries, average),
    euTaxShare: euPetrolTaxShare(average),
    countrySpread: euPetrolSpread(countries),
    runs: {
      eu: findRun(runs, "fetch-eu-fuel-prices"),
      us: findRun(runs, "fetch-us-fuel-prices"),
      swiss: findRun(runs, "fetch-ch-fuel-prices"),
    },
  };
});

// ─── Italia per provincia ───────────────────────────────────────────────

export const loadItaly = cache(async () => {
  const [prices, runs] = await Promise.all([italianPricesQ(), fetchRunsQ()]);
  // Media nazionale PESATA sul numero di impianti (vedi italianFuelStats).
  const { provinces, average } = computeItalianFuelStats(prices);
  // Lo slug si risolve qui, così il Client Component non importa
  // provinces.ts. Una sigla sconosciuta si scarta invece di far cadere la
  // pagina.
  const rows = provinces
    .map((p) => {
      const route = provinceForCode(p.provinceCode);
      if (!route) return null;
      return {
        provinceCode: p.provinceCode,
        provinceName: p.provinceName,
        slug: route.slug,
        petrolSelf: p.petrolSelf,
        dieselSelf: p.dieselSelf,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return {
    rows,
    average,
    spread: provincePetrolSelfSpread(provinces),
    run: findRun(runs, "fetch-mimit-prices"),
  };
});

// ─── Traffico marittimo ─────────────────────────────────────────────────

/**
 * Periodo iniziale del grafico transiti + Brent: un anno, abbastanza per
 * vedere la rottura di Hormuz (marzo 2026) e il traffico prima. Per Bab
 * el-Mandeb (rottura a dicembre 2023) serve "5 anni", a un clic.
 */
export const SHIPPING_CHART_INITIAL_WINDOW = "1a" as const;

/**
 * Grafico della pagina /traffico-marittimo: un anno di transiti e di
 * Brent. Letto a parte da `loadShipping`, che serve anche alla home: lì il
 * grafico non c'è, e quella query sarebbe lavoro buttato a ogni visita.
 */
export const loadShippingChartInitial = cache(() =>
  loadShippingChart(SHIPPING_CHART_INITIAL_WINDOW, getNow()).catch((err) => {
    console.error("Grafico traffico marittimo non disponibile:", err);
    return [];
  })
);

export const loadShipping = cache(async () => {
  const [rows, runs] = await Promise.all([chokepointQ(), fetchRunsQ()]);
  const now = getNow();
  const freshnessConfig = getFreshnessConfig("imf_portwatch");
  const chokepoints = summarizeChokepoints(rows).map((s) => {
    const latest = new Date(`${s.latestDate}T00:00:00Z`);
    return {
      ...s,
      freshness: computeFreshness(latest, freshnessConfig, now),
      ageDays: Math.floor((now.getTime() - latest.getTime()) / DAY_MS),
    };
  });
  return {
    chokepoints,
    headline: furthestFromNormal(chokepoints),
    run: findRun(runs, "fetch-chokepoint-transits"),
  };
});

// ─── Calcolatore ────────────────────────────────────────────────────────

export const loadCalculator = cache(async () => {
  const [fuel, yearHistory] = await Promise.all([loadFuel(), fuelYearHistoryQ()]);
  const now = getNow();
  const yearSeries = groupFuelHistory(yearHistory);
  // Prezzo medio un mese e un anno fa (regole in src/lib/pastValue.ts).
  const pastPetrol = (continent: string) => {
    const points = yearSeries.find((s) => s.key === `${continent}|petrol`)?.points ?? [];
    return {
      petrolMonthAgo: valueAtOrBefore(points, daysBefore(now, 30))?.value ?? null,
      petrolYearAgo: valueAtOrBefore(points, daysBefore(now, 365))?.value ?? null,
    };
  };
  return {
    europe: { ...fuel.average, ...pastPetrol("europe") },
    us: {
      petrol: fuel.usPetrol,
      diesel: fuel.usDiesel,
      currency: "USD",
      ...pastPetrol("north_america"),
    },
    euTaxShare: fuel.euTaxShare,
    available: fuel.average.petrol !== null || fuel.usPetrol !== null,
  };
});

function shippingStat(headline: Awaited<ReturnType<typeof loadShipping>>["headline"]): TickerStat {
  if (!headline || headline.mean7 === null || headline.deviationPct === null) {
    return { key: "traffico", label: "Traffico marittimo", value: "n/d" };
  }
  return {
    key: "traffico",
    label: CHOKEPOINT_SHORT_NAMES[headline.key],
    value: formatDecimal(headline.mean7),
    unit: "navi/g",
    note: `normale ${formatDecimal(headline.baseline, 0)} · ${formatPercent(headline.deviationPct, 0)}`,
  };
}

// ─── Panoramica (home) ──────────────────────────────────────────────────

export const loadSummary = cache(async () => {
  const [commodities, fuel, narratives, shipping] = await Promise.all([
    loadCommodities(),
    loadFuel(),
    narrativesQ(),
    loadShipping(),
  ]);
  const now = getNow();

  // "Maggiori variazioni": le finestre sono diverse (90 e 30 giorni) e la
  // pagina lo dichiara riga per riga.
  const topMovers = [
    ...priceMovers(commodities.series).map((m) => ({ ...m, windowDays: 90 })),
    ...priceMovers(fuel.series).map((m) => ({ ...m, windowDays: 30 })),
  ]
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 5);

  const timestamps = [
    ...commodities.rows.map((c) => c.recordedAt.getTime()),
    ...fuel.prices.map((f) => f.recordedAt.getTime()),
  ];
  const lastUpdated = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;

  // "Fonti in linea": una fonte conta se almeno una serie NON è
  // `non_aggiornato` (`in_attesa` è il funzionamento previsto).
  const sourceStates = new Map<string, boolean>();
  for (const c of commodities.rows) {
    const ok = sourceStates.get(c.source) ?? false;
    sourceStates.set(c.source, ok || c.freshnessState !== "non_aggiornato");
  }
  for (const [continent, fuels] of fuel.byContinent.entries()) {
    const source = CONTINENT_SOURCES[continent];
    if (!source) continue;
    const mostRecent = new Date(Math.max(...fuels.map((f) => f.recordedAt.getTime())));
    const state = computeFreshness(mostRecent, getFreshnessConfig(source), now);
    sourceStates.set(source, (sourceStates.get(source) ?? false) || state !== "non_aggiornato");
  }
  // IMF PortWatch: in linea se almeno un passaggio ha il dato nei tempi.
  if (shipping.chokepoints.length > 0) {
    sourceStates.set(
      "imf_portwatch",
      shipping.chokepoints.some((c) => c.freshness !== "non_aggiornato")
    );
  }
  const sourcesOnline = Array.from(sourceStates.values()).filter(Boolean).length;
  const sourcesTotal = sourceStates.size;

  const changeOf = (series: typeof commodities.series, key: string) =>
    priceMovers(series).find((m) => m.key === key)?.changePct ?? null;
  const changeNote = (pct: number | null, windowDays: number) =>
    pct === null
      ? {}
      : {
          note: `${formatPercent(pct)} · ${windowDays}gg`,
          noteTone: (pct >= 0 ? "up" : "down") as "up" | "down",
        };

  const brent = commodities.rows.find((c) => c.symbol === "BRENT") ?? null;
  const avg = fuel.average;
  const headerStats: TickerStat[] = [
    {
      key: "brent",
      label: "Brent",
      value: brent ? formatCommodityPrice(parseFloat(brent.displayPrice)) : "n/d",
      unit: brent ? shortUnit(brent.displayUnit) : undefined,
      ...changeNote(changeOf(commodities.series, "BRENT"), 90),
    },
    {
      key: "benzina",
      label: "Benzina UE",
      value: avg.petrol !== null ? formatFuelPrice(avg.petrol) : "n/d",
      unit: avg.petrol !== null ? `${currencySymbol(avg.currency)}/L` : undefined,
      ...changeNote(changeOf(fuel.series, "europe|petrol"), 30),
    },
    {
      key: "diesel",
      label: "Diesel UE",
      value: avg.diesel !== null ? formatFuelPrice(avg.diesel) : "n/d",
      unit: avg.diesel !== null ? `${currencySymbol(avg.currency)}/L` : undefined,
      ...changeNote(changeOf(fuel.series, "europe|diesel"), 30),
    },
    // Traffico marittimo (24 set 2026): il passaggio più lontano dal
    // normale, media degli ultimi 7 giorni. Nota in tono NEUTRO: il verde
    // "in discesa" direbbe una buona notizia, la ruggine "in salita" il
    // contrario del vero. Il nome del passaggio è l'etichetta: se un
    // giorno l'altro si allontana di più, la cella lo dice da sé.
    shippingStat(shipping.headline),
    {
      key: "ultimo-dato",
      label: "Ultimo dato",
      value: lastUpdated ? formatDateTime(lastUpdated) : "n/d",
      note: "Materie prime: ogni giorno",
    },
    {
      key: "fonti",
      label: "Fonti in linea",
      value: sourcesTotal > 0 ? `${sourcesOnline} / ${sourcesTotal}` : "n/d",
      // Con un problema la cella dice quante fonti sono ferme e porta a
      // /stato-dati; altrimenti mostra la cadenza.
      ...(sourcesTotal > 0 && sourcesOnline < sourcesTotal
        ? {
            note: `${sourcesTotal - sourcesOnline} ferma oltre l'attesa`,
            noteTone: "up" as const,
            href: "/stato-dati",
          }
        : { note: "Carburanti: settimanale" }),
    },
  ];

  return {
    narratives,
    topMovers,
    figure: figureOfTheDay(now),
    lastUpdated,
    headerStats,
    // Curva in filigrana nell'header: il Brent, l'unica serie con abbastanza
    // punti da avere una forma.
    heroSeries: commodities.series.find((s) => s.key === "BRENT")?.points ?? [],
  };
});

/**
 * /inflazione (24 set 2026): una scheda per serie, con freschezza. La
 * freschezza è di tutta la fonte (una cadenza sola, mensile): si calcola
 * sul mese più recente fra le serie.
 */
export const loadInflation = cache(async () => {
  const [rows, runs] = await Promise.all([inflationQ(), fetchRunsQ()]);
  const now = getNow();
  const series = summarizeInflation(rows);
  const latestMonth = series.map((s) => s.month).sort().at(-1) ?? null;
  const freshness = latestMonth
    ? computeFreshness(monthToDate(latestMonth), getFreshnessConfig("istat_nic"), now)
    : null;
  return {
    // Solo i punti del grafico vanno al browser, non le righe grezze.
    chartPoints: buildInflationChart(rows),
    series,
    headline: series.find((s) => s.code === "00") ?? null,
    latestMonth,
    freshness,
    run: findRun(runs, "fetch-istat-nic"),
  };
});
