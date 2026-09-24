import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  timestamp,
  varchar,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * COMMODITIES
 * Anagrafica delle materie prime globali (petrolio, oro, grano...).
 * Una riga per ogni materia prima che tracciamo, non per ogni prezzo:
 * i prezzi nel tempo vivono nella tabella `priceHistory` qui sotto.
 */
export const commodities = pgTable("commodities", {
  id: serial("id").primaryKey(),
  // Simbolo usato dalla fonte dati (es. "WTI", "BRENT", "WHEAT")
  symbol: varchar("symbol", { length: 32 }).notNull().unique(),
  name: text("name").notNull(), // es. "West Texas Intermediate"
  category: varchar("category", { length: 32 }).notNull(), // "energy" | "metal" | "agricultural"
  unit: varchar("unit", { length: 32 }).notNull(), // es. "USD per barrel"
});

/**
 * PRICE_HISTORY
 * Storico dei prezzi di mercato globali. Una riga per ogni rilevazione
 * nel tempo, collegata a una materia prima tramite commodityId.
 */
export const priceHistory = pgTable(
  "price_history",
  {
    id: serial("id").primaryKey(),
    // `integer` e non `serial`: è una chiave esterna, il valore lo fornisce
    // sempre il codice (l'id della commodity). `serial` le darebbe una
    // sequence e un DEFAULT nextval() inutili e potenzialmente fuorvianti.
    commodityId: integer("commodity_id")
      .notNull()
      .references(() => commodities.id),
    // `numeric` invece di `float`: evita errori di arrotondamento sui prezzi
    price: numeric("price", { precision: 12, scale: 4 }).notNull(),
    // `recorded_at` è la data DEL DATO (a quale giornata si riferisce il
    // prezzo). `retrieved_at` è quando il nostro fetcher l'ha acquisito:
    // due cose diverse, es. un prezzo mensile datato 01/07 acquisito il
    // 20/07. Serve a distinguere "fonte ferma" da "fonte che non ha
    // ancora pubblicato". Nullable: le righe salvate prima di questa
    // colonna hanno acquisizione non tracciata.
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
    retrievedAt: timestamp("retrieved_at"),
    source: varchar("source", { length: 64 }).notNull(), // es. "alpha_vantage"
  },
  (table) => ({
    // Indice: le query più comuni filtrano per materia prima + data,
    // questo indice le rende molto più veloci man mano che la tabella cresce
    commodityDateIdx: index("price_history_commodity_date_idx").on(
      table.commodityId,
      table.recordedAt
    ),
    // Vincolo di unicità: una sola rilevazione per (materia prima, data).
    // Serve da bersaglio all'upsert in savePricePoints: se la fonte
    // ricalcola/corregge un valore già salvato lo AGGIORNIAMO, invece di
    // accumulare righe duplicate a ogni run del cron.
    commodityRecordedUnique: uniqueIndex(
      "price_history_commodity_recorded_at_unique"
    ).on(table.commodityId, table.recordedAt),
  })
);

/**
 * REGIONS
 * Aree geografiche per cui tracciamo prezzi al consumo (non di mercato).
 * Un continente può avere più country_code null (es. "European Union"
 * come aggregato), oppure un paese specifico (es. "Germany", countryCode "DE").
 */
export const regions = pgTable("regions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // es. "Germany", "United States"
  countryCode: varchar("country_code", { length: 2 }), // ISO 3166-1 alpha-2, nullable per aggregati
  continent: varchar("continent", { length: 32 }).notNull(), // "europe" | "north_america" | "oceania" | "latam"
});

/**
 * RETAIL_FUEL_PRICES
 * Prezzi medi al consumo dei carburanti per regione (benzina, diesel...).
 * Concettualmente separata da priceHistory perché la fonte, la valuta
 * e la frequenza di aggiornamento sono diverse dai prezzi di mercato globali.
 */
export const retailFuelPrices = pgTable(
  "retail_fuel_prices",
  {
    id: serial("id").primaryKey(),
    // FK: `integer`, non `serial` (vedi price_history.commodityId).
    regionId: integer("region_id")
      .notNull()
      .references(() => regions.id),
    fuelType: varchar("fuel_type", { length: 32 }).notNull(), // "petrol" | "diesel"
    price: numeric("price", { precision: 10, scale: 4 }).notNull(),
    // Prezzo AL NETTO delle imposte, stessa unità e valuta di `price`.
    // La differenza `price - price_net` è il carico fiscale: accisa, IVA e
    // altre imposte indirette messe insieme.
    //
    // Nullable, e non con default 0, per due ragioni. La prima è storica:
    // le righe salvate prima di questa colonna non hanno il netto e non lo
    // avranno mai — uno zero le farebbe leggere come "100% tasse". La
    // seconda è che la Commissione non pubblica il netto per ogni paese e
    // ogni settimana: dove manca, il carico fiscale NON si calcola e la
    // pagina deve dirlo, non stimarlo per differenza da una media.
    //
    // Solo la fonte `eu_weekly_oil_bulletin` la valorizza: l'EIA pubblica
    // il prezzo alla pompa e basta.
    priceNet: numeric("price_net", { precision: 10, scale: 4 }),
    // Accisa, in euro al litro — Fase 3 della roadmap. Dal foglio "Excise
    // duties" del file storico UE, già convertita da valuta nazionale a
    // euro dal fetcher (vedi euOilBulletinHistory.ts). Nullable come
    // priceNet: solo `eu_weekly_oil_bulletin` la valorizza, e non per ogni
    // paese/settimana (il foglio delle accise non copre sempre tutto lo
    // storico dal 2005).
    exciseEur: numeric("excise_eur", { precision: 10, scale: 4 }),
    // Aliquota IVA in percentuale (es. 22.000), dal foglio "VAT". Si salva
    // l'ALIQUOTA e non l'importo in euro: l'importo si deriva a valle come
    // (price_net + excise_eur) * vat_rate_percent / 100 — così se la
    // formula di derivazione cambia un giorno non serve ricalcolare e
    // riscrivere ogni riga già salvata.
    vatRatePercent: numeric("vat_rate_percent", { precision: 6, scale: 3 }),
    currency: varchar("currency", { length: 3 }).notNull(), // ISO 4217, es. "EUR", "USD"
    unit: varchar("unit", { length: 16 }).notNull().default("liter"), // "liter" | "gallon"
    // Vedi price_history.retrievedAt: data del dato vs data di acquisizione.
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
    retrievedAt: timestamp("retrieved_at"),
    source: varchar("source", { length: 64 }).notNull(), // es. "eu_weekly_oil_bulletin", "eia_us"
  },
  (table) => ({
    regionDateIdx: index("retail_fuel_region_date_idx").on(
      table.regionId,
      table.recordedAt
    ),
    // Stessa logica di price_history: una sola rilevazione per
    // (regione, tipo carburante, data). Bersaglio dell'upsert nei
    // fetcher EU/US. Il fuel_type entra nella chiave perché per la
    // stessa regione e data salviamo sia benzina che diesel.
    regionFuelRecordedUnique: uniqueIndex(
      "retail_fuel_region_fuel_recorded_at_unique"
    ).on(table.regionId, table.fuelType, table.recordedAt),
  })
);

/**
 * FETCH_RUNS
 * Un record per ogni esecuzione di un cron di acquisizione: quando è
 * partita, se è riuscita, quanti punti ha salvato, l'errore se c'è stato.
 *
 * Perché serve: oggi i fetcher fanno try/catch e loggano su console, ma
 * non resta traccia strutturata. Senza questo non si può costruire una
 * pagina "Stato dei dati" né una freshness che distingua "fonte rotta"
 * da "fonte che non ha ancora pubblicato". È il posto dove intercettare
 * anche i fallimenti silenziosi (Alpha Vantage risponde HTTP 200 con un
 * rate limit al posto dei dati: `pointsSaved` a 0 quando ne attendevamo
 * di più è il segnale).
 */
export const fetchRuns = pgTable(
  "fetch_runs",
  {
    id: serial("id").primaryKey(),
    source: varchar("source", { length: 64 }).notNull(), // "alpha_vantage" | "eu_weekly_oil_bulletin" | "eia_us"
    job: varchar("job", { length: 64 }).notNull(), // es. "fetch-market-prices-3"
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"), // null = run ancora in corso o interrotta
    ok: boolean("ok"), // null finché non finita
    pointsSaved: integer("points_saved"),
    // La `recordedAt` più recente fra i punti salvati in QUESTO run — non
    // "adesso" (quello è `finishedAt`), ma la data del dato più fresco che
    // la fonte ci ha dato. Serve a Fase 3 (registro correzioni): distingue
    // "la fonte non pubblica da settimane" (`latestRecordedAt` fermo) da
    // "il nostro cron non gira" (`finishedAt` assente). Nullable: un run
    // fallito prima di salvare qualsiasi punto non ne ha uno, e le righe
    // scritte prima di questa colonna non lo avranno mai.
    latestRecordedAt: timestamp("latest_recorded_at"),
    errorText: text("error_text"),
  },
  (table) => ({
    sourceStartedIdx: index("fetch_runs_source_started_idx").on(
      table.source,
      table.startedAt
    ),
  })
);

/**
 * DATA_CORRECTIONS
 * Fase 3 della roadmap (igiene dei dati). Una riga ogni volta che un
 * fetcher SOVRASCRIVE un valore già salvato con uno diverso — non la prima
 * volta che un valore viene scritto (quella non corregge niente, riempie
 * una casella vuota).
 *
 * Perché serve: gli upsert di questo progetto (vedi savePricePoints.ts,
 * saveEuFuelPrices.ts...) sono pensati apposta per lasciare che una fonte
 * corregga un dato già pubblicato — è un comportamento voluto, non un bug.
 * Ma finora la correzione avveniva in silenzio: il valore vecchio spariva
 * senza lasciare traccia. Se un domani un prezzo mostrato su una pagina
 * paese cambia rispetto a ieri, oggi non c'è modo di distinguere "la fonte
 * ha rivisto la settimana scorsa" da "abbiamo un bug nel parsing" — questa
 * tabella è quella traccia.
 *
 * Generica per tabella e campo (non una tabella "price_history_corrections"
 * più una "retail_fuel_prices_corrections"...) perché lo stesso identico
 * evento — "un fetcher ha aggiornato un valore che esisteva già" — capita
 * su più tabelle e più colonne (price, price_net, excise_eur,
 * vat_rate_percent). Una tabella sola con `table_name`/`field` come stringhe
 * evita di dover ripetere la stessa struttura quattro volte e rende la
 * pagina "cosa è cambiato" (se un giorno servirà) una sola query invece di
 * un'unione fra tabelle diverse.
 *
 * NON scritta per ogni fetcher: solo dove una "correzione" ha senso perché
 * la stessa fonte pubblica ripetutamente la stessa data (Alpha Vantage, il
 * bollettino UE, l'EIA). Il backfill storico e il cron MIMIT non la usano —
 * vedi i commenti in savePricePointsBulk, saveRetailFuelPricesBulk e
 * saveMimitPrices per il perché caso per caso.
 */
export const dataCorrections = pgTable(
  "data_corrections",
  {
    id: serial("id").primaryKey(),
    tableName: varchar("table_name", { length: 64 }).notNull(), // "price_history" | "retail_fuel_prices"
    // Etichetta leggibile dell'entità corretta, es. "WTI" o "Germany petrol"
    // — non un id numerico: questa tabella esiste per essere letta da un
    // umano (o da una pagina "cosa è cambiato"), non solo interrogata.
    entityLabel: text("entity_label").notNull(),
    field: varchar("field", { length: 32 }).notNull(), // "price" | "price_net" | "excise_eur" | "vat_rate_percent"
    oldValue: numeric("old_value", { precision: 12, scale: 4 }).notNull(),
    newValue: numeric("new_value", { precision: 12, scale: 4 }).notNull(),
    // La data DEL DATO corretto (es. la settimana che è stata rivista), non
    // il momento in cui ce ne siamo accorti — quello è `detectedAt`. Stessa
    // distinzione di recordedAt/retrievedAt nelle altre tabelle.
    recordedAt: timestamp("recorded_at").notNull(),
    detectedAt: timestamp("detected_at").notNull().defaultNow(),
    source: varchar("source", { length: 64 }).notNull(),
    // Nullable: `startFetchRun` può tornare null se `fetch_runs` non è
    // scrivibile in quel momento (vedi fetchRunLog.ts) — la correzione va
    // registrata comunque, solo senza il collegamento al run che l'ha vista.
    runId: integer("run_id").references(() => fetchRuns.id),
  },
  (table) => ({
    tableRecordedIdx: index("data_corrections_table_recorded_idx").on(
      table.tableName,
      table.recordedAt
    ),
  })
);

/**
 * WEEKLY_NARRATIVES
 * Le 2-3 righe "cosa è cambiato questa settimana" mostrate in home,
 * generate dal cron carburanti UE confrontando la settimana appena
 * arrivata con quella precedente (vedi generateWeeklyNarrative.ts).
 *
 * ARCHIVIATE, non ricalcolate a ogni richiesta: sono una dichiarazione
 * fatta in un momento preciso ("questa settimana il diesel è salito di
 * 3 centesimi"), non una vista live sui dati attuali. Se un domani un
 * valore storico venisse corretto, la narrazione di una settimana passata
 * non deve cambiare sotto i piedi di chi l'ha già letta.
 */
export const weeklyNarratives = pgTable(
  "weekly_narratives",
  {
    id: serial("id").primaryKey(),
    // Data della rilevazione più recente confrontata — la settimana
    // "nuova" del confronto, non il momento in cui la riga è stata
    // generata (quello è `createdAt`).
    weekOf: timestamp("week_of").notNull(),
    // "it_petrol" | "it_diesel" | "eu_mover" — vedi NarrativeEntry in
    // generateWeeklyNarrative.ts.
    kind: varchar("kind", { length: 32 }).notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // Bersaglio dell'upsert: se il cron rigira sulla stessa settimana
    // (prima che ne arrivi una nuova) aggiorna la riga invece di duplicarla.
    weekKindUnique: uniqueIndex("weekly_narratives_week_kind_unique").on(
      table.weekOf,
      table.kind
    ),
    weekOfIdx: index("weekly_narratives_week_of_idx").on(table.weekOf),
  })
);

/**
 * PROVINCES
 * Fase 4 (ricerca preliminare 4 set 2026, ricerca completata più avanti).
 * Le 107 province italiane — tabella SEPARATA da `regions` e non
 * un'estensione gerarchica di essa: `regions` è già in produzione (pagine
 * paese UE, EuropeFuelMap), e farla gerarchica ora avrebbe voluto dire
 * toccare codice che oggi funziona per una feature che non lo tocca ancora.
 * Anagrafica minima: MIMIT dà solo la sigla nella colonna `Provincia`
 * dell'anagrafica impianti, non il nome per esteso (vedi
 * `src/lib/provinces.ts`, che la sigla la porta a un nome e uno slug URL —
 * quella tabella scritta a mano è la fonte del nome, questa riga sul DB
 * serve solo da bersaglio di chiave esterna per i prezzi).
 */
export const provinces = pgTable("provinces", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 2 }).notNull().unique(), // sigla, es. "MI"
  name: text("name").notNull(), // es. "Milano" — da src/lib/provinces.ts
});

/**
 * RETAIL_FUEL_PRICES_IT
 * Prezzi carburanti per PROVINCIA, aggregati dal cron a partire dal CSV
 * stazione-per-stazione del MIMIT (23.981 impianti attivi, ~93.000 righe
 * prezzo/giorno misurate il 4 set 2026 — vedi CLAUDE.md). Tabella
 * SEPARATA da `retail_fuel_prices` (che resta il dato UE/USA, per PAESE):
 * unità di misura diversa (provincia vs paese), fonte diversa, e soprattutto
 * granularità diversa — mescolarle in una tabella sola avrebbe richiesto
 * far finta che "provincia" e "paese" fossero la stessa colonna `region_id`.
 *
 * Deliberatamente NON una riga per stazione: 93.000 righe/giorno
 * salvate per sempre farebbero ~34 milioni di righe l'anno, contro le
 * ~28.000 di dieci anni di storico UE. Il cron scarica il CSV stazione per
 * stazione, aggrega per (provincia, carburante, self/servito) e scarta il
 * dettaglio — la riga per stazione non sopravvive oltre l'esecuzione del
 * cron. Se un giorno servisse il dettaglio (es. una mappa di densità), è
 * una scelta ESPLICITA da riprendere, non un default silenzioso.
 */
export const retailFuelPricesIt = pgTable(
  "retail_fuel_prices_it",
  {
    id: serial("id").primaryKey(),
    provinceId: integer("province_id")
      .notNull()
      .references(() => provinces.id),
    fuelType: varchar("fuel_type", { length: 32 }).notNull(), // "petrol" | "diesel" — solo i due standard, non le varianti brandizzate (vedi mimit.ts)
    // Self e servito sono colonne SEPARATE e non una media unica: in
    // Italia il self è quasi sempre più economico di alcuni centesimi,
    // media insieme sarebbe un numero che non corrisponde al prezzo che
    // paga né chi fa self né chi si fa servire. Nullable: una provincia
    // può non avere impianti con servito attivo quel giorno.
    priceSelfAvg: numeric("price_self_avg", { precision: 10, scale: 4 }),
    priceServedAvg: numeric("price_served_avg", { precision: 10, scale: 4 }),
    // Quanti impianti hanno contribuito a ciascuna media — trasparenza sul
    // campione, stesso principio del "fonte, data, limiti" del progetto:
    // una media su 2 impianti non è la stessa cosa di una su 200, e la
    // pagina deve poterlo dire.
    selfStationCount: integer("self_station_count"),
    servedStationCount: integer("served_station_count"),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    unit: varchar("unit", { length: 16 }).notNull().default("liter"),
    recordedAt: timestamp("recorded_at").notNull(), // data dell'estrazione MIMIT ("Estrazione del ..."), non oggi
    retrievedAt: timestamp("retrieved_at"),
    source: varchar("source", { length: 64 }).notNull().default("mimit"),
  },
  (table) => ({
    provinceDateIdx: index("retail_fuel_it_province_date_idx").on(
      table.provinceId,
      table.recordedAt
    ),
    // Bersaglio dell'upsert: una sola riga per (provincia, carburante,
    // data), stesso pattern di retail_fuel_prices e price_history.
    provinceFuelRecordedUnique: uniqueIndex(
      "retail_fuel_it_province_fuel_recorded_at_unique"
    ).on(table.provinceId, table.fuelType, table.recordedAt),
  })
);

/**
 * EU_WEIGHTED_AVERAGES
 * Blocco C (15 set 2026). La media UE PONDERATA pubblicata dalla
 * Commissione nel file storico del bollettino (colonne `EU_*`), una riga
 * per settimana e carburante.
 *
 * Perché serve accanto alla nostra "media dei 27": la nostra è una media
 * SEMPLICE — Malta pesa quanto la Germania. Quella della Commissione pesa
 * ogni paese per i suoi consumi, quindi è più vicina a "quanto paga in
 * media un litro un automobilista europeo". Mostrarle entrambe, con il
 * nome giusto, è più onesto che sceglierne una.
 *
 * Perché una tabella a parte e non una riga "EU" in `regions`: tutte le
 * query su `retail_fuel_prices` leggono `regions` come elenco di PAESI
 * (mappa, media dei 27, classifiche). Un finto paese "EU" entrerebbe in
 * ognuna e andrebbe escluso a mano ovunque; basta dimenticarlo una volta
 * per avere una media calcolata anche sulla media. Qui non può succedere.
 */
export const euWeightedAverages = pgTable(
  "eu_weighted_averages",
  {
    id: serial("id").primaryKey(),
    fuelType: varchar("fuel_type", { length: 32 }).notNull(), // "petrol" | "diesel"
    // €/litro, imposte incluse — stessa unità di retail_fuel_prices.price.
    price: numeric("price", { precision: 10, scale: 4 }).notNull(),
    // €/litro al netto delle imposte. Nullable per la stessa ragione di
    // retail_fuel_prices.price_net: se la Commissione non lo pubblica, il
    // carico fiscale medio non si calcola.
    priceNet: numeric("price_net", { precision: 10, scale: 4 }),
    recordedAt: timestamp("recorded_at").notNull(), // settimana del bollettino
    retrievedAt: timestamp("retrieved_at"),
    source: varchar("source", { length: 64 })
      .notNull()
      .default("eu_weekly_oil_bulletin"),
  },
  (table) => ({
    fuelRecordedUnique: uniqueIndex("eu_weighted_avg_fuel_recorded_at_unique").on(
      table.fuelType,
      table.recordedAt
    ),
  })
);

/**
 * SWISS_FUEL_PRICES
 * Blocco D, parte 3 (15 set 2026): prezzi medi mensili dei carburanti in
 * Svizzera, dall'Ufficio federale di statistica (BFS, tabella LIK
 * "Durchschnittspreise für Energie und Treibstoffe", su-d-05.02.91).
 *
 * Tabella separata, come `eu_weighted_averages`, e per la stessa ragione:
 * `retail_fuel_prices` + `regions` con continente "europe" sono la base
 * della "media dei 27". La Svizzera non è nell'UE, pubblica in CHF e una
 * volta al mese: mescolarla lì la farebbe entrare in medie e classifiche
 * a cui non appartiene.
 *
 * Si salva il prezzo in FRANCHI (il dato della fonte) e il cambio BCE
 * medio dello stesso mese. L'euro si calcola in lettura: se un giorno si
 * volesse un altro cambio, i dati originali sono intatti.
 */
export const swissFuelPrices = pgTable(
  "swiss_fuel_prices",
  {
    id: serial("id").primaryKey(),
    fuelType: varchar("fuel_type", { length: 32 }).notNull(), // "petrol" | "diesel"
    // CHF al litro, come pubblicato (due decimali nella fonte).
    priceChf: numeric("price_chf", { precision: 10, scale: 4 }).notNull(),
    // Franchi per 1 euro, media mensile BCE. Nullable: il BFS può
    // pubblicare prima che il cambio del mese sia disponibile, e in quel
    // caso il prezzo in euro semplicemente non si mostra.
    chfPerEur: numeric("chf_per_eur", { precision: 10, scale: 6 }),
    // Primo giorno del mese a cui si riferisce la media.
    recordedAt: timestamp("recorded_at").notNull(),
    retrievedAt: timestamp("retrieved_at"),
    source: varchar("source", { length: 64 }).notNull().default("bfs_lik"),
  },
  (table) => ({
    fuelRecordedUnique: uniqueIndex("swiss_fuel_fuel_recorded_at_unique").on(
      table.fuelType,
      table.recordedAt
    ),
  })
);

/**
 * CHOKEPOINT_TRANSITS
 * Traffico marittimo nei passaggi obbligati (23 set 2026): transiti
 * giornalieri di navi da IMF PortWatch, dataset "Daily Chokepoint Transit
 * Calls and Trade Volume Estimates". Solo i passaggi in CHOKEPOINTS
 * (src/lib/fetchers/portwatch.ts: Hormuz, Bab el-Mandeb, Suez), non tutti
 * e 28.
 *
 * Tabella a sé e non un'altra riga in `price_history`: non è un prezzo,
 * non ha valuta né unità di prezzo, e mescolarla con le materie prime la
 * farebbe entrare in "Maggiori variazioni" e nelle altre classifiche.
 *
 * Il dato è giornaliero ma la fonte lo pubblica una volta a settimana (di
 * norma il martedì), a blocchi di sette giorni: il cron gira ogni giorno e
 * l'upsert sul vincolo unico riscrive i giorni già salvati invece di
 * duplicarli.
 */
export const chokepointTransits = pgTable(
  "chokepoint_transits",
  {
    id: serial("id").primaryKey(),
    // Chiave nostra, stabile e leggibile ("hormuz" | "bab_el_mandeb"), non
    // il `portname` della fonte: se PortWatch un giorno rinomina un
    // passaggio, il fetcher si ferma con un errore (vedi portwatch.ts) e
    // lo storico già salvato non cambia chiave sotto i piedi.
    chokepoint: varchar("chokepoint", { length: 32 }).notNull(),
    // Il giorno a cui si riferisce il conteggio (campo `date` della fonte),
    // a mezzanotte UTC. `timestamp` e non `date` per coerenza con tutte le
    // altre tabelle dati e con chi le legge (freschezza, fetch_runs,
    // getLatest*), che lavorano con oggetti Date.
    recordedAt: timestamp("recorded_at").notNull(),
    // Numero di navi transitate quel giorno (campo `n_total`: tutte le
    // categorie — container, rinfuse, tanker, ro-ro, carico generale).
    transitCalls: integer("transit_calls").notNull(),
    // Stima della capacità transitata (campo `capacity`, così come la
    // pubblica la fonte). È una STIMA costruita dal FMI sui segnali AIS
    // delle navi, non una misura: il nome della colonna lo dice. Unità:
    // tonnellate metriche di carico (verificato sui dati il 24/9/2026, vedi
    // "Il carico stimato" in ShippingMethodology.tsx). Nullable: se la fonte non la dà quel giorno resta
    // vuota, non diventa zero.
    tradeVolumeEst: numeric("trade_volume_est", { precision: 16, scale: 2 }),
    retrievedAt: timestamp("retrieved_at"),
    // Il run che ha scritto (o riscritto) la riga per ultimo. Nullable per
    // la stessa regola di fetchRunLog.ts: se `fetch_runs` non è
    // scrivibile, `startFetchRun` restituisce null e il dato si salva lo
    // stesso — il logging non deve mai far fallire il fetch.
    fetchRunId: integer("fetch_run_id").references(() => fetchRuns.id),
    source: varchar("source", { length: 64 }).notNull().default("imf_portwatch"),
  },
  (table) => ({
    // Bersaglio dell'upsert: una sola riga per (passaggio, giorno).
    chokepointRecordedUnique: uniqueIndex(
      "chokepoint_transits_chokepoint_recorded_at_unique"
    ).on(table.chokepoint, table.recordedAt),
  })
);

/**
 * CONSUMER_PRICE_INDEX
 * Inflazione in Italia (24 set 2026): indice dei prezzi al consumo per
 * l'intera collettività (NIC) di ISTAT, mensile, dataset
 * `167_745_DF_DCSP_NIC1B2025_6` ("tutte le basi"). Quattro serie: indice
 * generale (`00`), alimentari e bevande analcoliche (`01`), "carrello della
 * spesa" (`FOODHPC`) e beni energetici (`ENRGY`).
 *
 * Tabella a sé e non un'altra riga in `price_history`: non è un prezzo ma
 * un numero indice, senza valuta né unità, e mescolarlo con le materie
 * prime lo farebbe entrare in "Maggiori variazioni".
 *
 * L'indice si salva NELLA BASE IN CUI ISTAT LO PUBBLICA (2015=100 fino a
 * dicembre 2025, 2025=100 da gennaio 2026), e il raccordo si applica in
 * lettura. Stesso principio di `swiss_fuel_prices`, che salva i franchi e
 * il cambio e calcola l'euro dopo: il dato in tabella resta confrontabile
 * riga per riga con la fonte, e se un coefficiente di raccordo venisse
 * corretto non ci sarebbe niente da riscrivere.
 */
export const consumerPriceIndex = pgTable(
  "consumer_price_index",
  {
    id: serial("id").primaryKey(),
    // Il codice ECOICOP della fonte ("00", "01", "FOODHPC", "ENRGY"), non
    // una chiave inventata: è lo standard europeo, stabile da un cambio di
    // base all'altro, e con lo stesso codice si ritrova la serie su
    // IstatData.
    category: varchar("category", { length: 16 }).notNull(),
    // Primo giorno del mese a mezzanotte UTC (la fonte dà "AAAA-MM"), come
    // `swiss_fuel_prices`.
    recordedAt: timestamp("recorded_at").notNull(),
    // Anno base dell'indice (2015 o 2025): dice in quale "scala" è
    // espresso `index_value`. Un intero leggibile e non il codice
    // DATA_TYPE della fonte ("39", "85"), che da solo non dice niente;
    // la corrispondenza sta nel fetcher.
    baseYear: integer("base_year").notNull(),
    // Numero indice (misura 4), come pubblicato: un decimale nella fonte.
    indexValue: numeric("index_value", { precision: 10, scale: 3 }).notNull(),
    // Variazione % sullo stesso mese dell'anno prima (misura 7), già
    // calcolata da ISTAT: è il numero dell'inflazione nei comunicati, e
    // non richiede raccordi fra basi. Nullable: se la fonte non la dà per
    // un mese resta vuota, non si ricava dall'indice.
    yoyChangePct: numeric("yoy_change_pct", { precision: 6, scale: 2 }),
    retrievedAt: timestamp("retrieved_at"),
    // Il run che ha scritto la riga per ultimo; nullable per la regola di
    // fetchRunLog.ts (il logging non fa mai fallire il fetch), come in
    // `chokepoint_transits`.
    fetchRunId: integer("fetch_run_id").references(() => fetchRuns.id),
    source: varchar("source", { length: 64 }).notNull().default("istat_nic"),
  },
  (table) => ({
    // Bersaglio dell'upsert: un solo valore per (serie, mese). Le basi non
    // si sovrappongono (la 2015 finisce a dicembre 2025, la 2025 comincia a
    // gennaio 2026, verificato con la query 9 del 24/9), quindi la base NON
    // fa parte della chiave: se un giorno ISTAT pubblicasse lo stesso mese
    // in due basi, il conflitto farebbe emergere il problema invece di
    // salvare due valori per lo stesso mese.
    categoryRecordedUnique: uniqueIndex(
      "consumer_price_index_category_recorded_at_unique"
    ).on(table.category, table.recordedAt),
  })
);
