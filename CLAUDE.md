@AGENTS.md

# Mercuriale — contesto del progetto

(Nome visualizzato del sito: "Mercuriale" — dal nome storico italiano del
listino ufficiale dei prezzi all'ingrosso pubblicato dalle Camere di
Commercio. Rinominato il 3 set 2026, prima si chiamava "Prezzario": quel
nome è un termine tecnico già occupato — in Italia il *prezzario* è
l'elenco dei prezzi unitari per le opere pubbliche che ogni Regione
pubblica per legge — quindi prometteva un contenuto diverso da quello del
sito e metteva la ricerca organica in competizione con la pubblica
amministrazione. Il repository GitHub resta `commodity-tracker`, così come
i nomi di file e le variabili interne.)

Progetto open source che raccoglie e mostra prezzi di materie prime globali
e carburanti al consumo, ispirato nello spirito (non nei contenuti) a
progetti di trasparenza dati pubblici come DoveVannoINostriSoldi.it:
ogni dato deve avere fonte, data, e limiti dichiarati esplicitamente.

## Stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS
- Drizzle ORM + Neon Postgres (serverless)
- Deploy: Vercel, collegato a GitHub (`drakekluser99/commodity-tracker`),
  deploy automatico ad ogni push su `main`
- Identità Git di questo repo: `drakekluser99@gmail.com` (NON l'account
  di lavoro dell'utente — non cambiare mai questa configurazione)
- **`overrides` in `package.json`: `d3-color: ^3.1.0`.** Forza la
  versione di questa dipendenza transitiva (usata sotto `react-simple-maps`,
  la mappa Europa) invece di lasciare che npm risolva quella richiesta
  dal pacchetto a monte. Non toccare/rimuovere senza motivo: trovato senza
  commento durante l'analisi tecnica del 7/9/2026 — se un domani si scopre
  perché è stato aggiunto, va scritto qui.
- **Test automatici: Vitest** (`npm test` per una run singola, `npm run
  test:watch` per lo sviluppo). Aggiunto il 7/9/2026, copertura ancora
  volutamente minima: solo le funzioni PURE più delicate (formattazione in
  `src/lib/format.ts`, il calcolo di freschezza in
  `src/lib/freshness/compute.ts`, le statistiche fiscali/di ranking in
  `src/lib/europeFuelStats.ts` e `src/lib/italianFuelStats.ts`). Niente
  test di componenti React o di route: richiederebbero fixture DB/API
  molto più pesanti per un beneficio, al momento, minore. Dal 15 al 24
  set la copertura si è allargata ai parser delle fonti (MIMIT,
  PortWatch, ISTAT, con il file VERO in `src/lib/fetchers/fixtures/`),
  al traffico marittimo, al raccordo NIC e ai dati dei grafici: 204 test
  il 24/9. `vitest.config.ts`
  usa `vite-tsconfig-paths` per risolvere l'alias `@/*` leggendo lo stesso
  `tsconfig.json` di Next.js, invece di duplicare a mano il mapping.

## Architettura

- `src/lib/db/schema.ts` — 5 tabelle: `commodities`, `price_history`
  (materie prime globali), `regions`, `retail_fuel_prices` (carburanti
  per regione), `fetch_runs` (esiti dei cron di acquisizione).
  `price_history` ha un `uniqueIndex` su `(commodity_id, recorded_at)` e
  `retail_fuel_prices` uno su `(region_id, fuel_type, recorded_at)`: sono
  il bersaglio dell'upsert nei fetcher, evitano righe duplicate a ogni
  run del cron. Le colonne FK (`commodity_id`, `region_id`) sono
  `integer`, non `serial` (erano `serial`: sequence + `DEFAULT nextval()`
  inutili su una FK — corretto in migrazione `0002`). `retail_fuel_prices` ha anche
  `price_net` (3 set 2026): il prezzo AL NETTO delle imposte, dalla
  Commissione — la differenza `price - price_net` è il carico fiscale.
  Nullable e senza default: uno zero avrebbe fatto leggere ogni riga
  precedente come "100% tasse", e dove la fonte non pubblica il netto il
  carico fiscale NON si calcola, non si stima per differenza da una media.
  Solo `eu_weekly_oil_bulletin` la valorizza, l'EIA dà il prezzo alla pompa
  e basta. **Fase 3 (4 set 2026)**: due colonne in più, `exciseEur`
  (accisa, €/L) e `vatRatePercent` (aliquota IVA, %) — stessa logica di
  `priceNet`: `numeric` nullable, senza default, valorizzate solo da
  `eu_weekly_oil_bulletin` e non per ogni paese/settimana. L'importo IVA
  in euro NON si salva: si deriva a valle da `(priceNet + exciseEur) *
  vatRatePercent / 100` (vedi `europeFuelStats.ts`), così la formula si
  aggiorna in un solo posto se un giorno cambia. `price_history` e
  `retail_fuel_prices` hanno sia `recorded_at` (data DEL DATO) sia
  `retrieved_at` (quando il fetcher l'ha acquisito, nullable): due cose
  diverse, servono per distinguere "fonte ferma" da "fonte che non ha
  ancora pubblicato". Migrazioni applicate al DB Neon fino alla `0009`
  (4 set 2026: `0006`/`0007` aggiungono `weekly_narratives`, `0008`
  aggiunge `excise_eur`/`vat_rate_percent`, `0009` aggiunge `provinces` e
  `retail_fuel_prices_it`, Fase 4). Storico: `retrieved_at` è
  `NULL` per le righe salvate prima della
  `0004` e si popola dal primo run successivo di ogni cron; `fetch_runs`
  parte vuota e si riempie allo stesso modo. `regions.name` ha un vincolo
  `UNIQUE` (migrazione `0005` — vedi "Errori noti": prima non c'era, e i
  fetcher EU/US creavano una riga regione nuova ad ogni run)
- `src/lib/db/queries.ts` — query di lettura (ultimo prezzo per ogni
  commodity/regione). NON filtrano per data (vedi "Errori noti")
- `src/lib/freshness/` — modello di freshness a 3 stati (`aggiornato` /
  `in_attesa` / `non_aggiornato`), sostituisce `commodityFreshness.ts`
  (rimosso, faceva solo 1 soglia binaria). `config.ts` ha
  `FRESHNESS_CONFIG`: una entry per `source:symbol` (Alpha Vantage — ogni
  commodity ha una cadenza diversa, 1gg per energia/3gg grace, 30gg per
  metalli-agricole/10gg grace) o per `source` da solo (`eu_weekly_oil_bulletin`,
  `eia_us` — 7gg/3gg grace, condivisa da tutta la fonte). `compute.ts` ha
  `computeFreshness` (calcolo puro, `now` iniettabile) e
  `getFreshnessConfig` (lookup `source:symbol` → `source` → **lancia un
  errore esplicito** se manca una config, mai un default silenzioso —
  coerente col bug Alpha Vantage sotto). Oggi cablato solo sulla tabella
  materie prime in `page.tsx` (via `LatestCommodityPrice.source`,
  aggiunto a `queries.ts`); i carburanti non hanno ancora un badge
  freshness (vedi "Cosa manca")
- `src/lib/commodityDisplay.ts` — conversioni di SOLA visualizzazione
  (es. cotone da cents/pound a cents/kg); il dato grezzo salvato non si
  tocca mai
- `src/lib/format.ts` — formattazione per la UI italiana: numeri con
  separatori it-IT (`13.542,82`), unità/valute abbreviate (`$/barile`,
  `$/t`, `€/L`), percentuali col segno e minus tipografico. Mappa unità
  esplicita con fallback alla stringa originale (niente perdita
  silenziosa). Usato da tabella materie prime, `FuelPriceTable`, card
  "Maggiori variazioni", `FuelImpactCalculator`. Il dato grezzo NON si
  tocca (DB/export/API invariati); l'unità originale della fonte resta
  nel `title` della cella
- `src/lib/priceHistory.ts` — trasforma le righe grezze di storico in
  serie pronte per il grafico: `groupCommodityHistory` (una serie per
  simbolo), `groupFuelHistory` (continente × carburante, media UE sui
  paesi presenti in quella data). `priceMovers` calcola la variazione %
  tra primo e ultimo punto di ogni serie (salta serie con <2 punti o
  primo valore 0) e alimenta la sezione "Maggiori variazioni" della
  homepage. Logica separata da React apposta per testarla con Node
- `src/lib/fetchers/` — un fetcher per fonte dati + gli helper di salvataggio:
  - `alphaVantage.ts` — API REST, materie prime globali, 10 simboli
    divisi in 5 batch da 2 (`COMMODITY_BATCH_1`…`_5`). Le chiamate
    dentro un batch sono SEQUENZIALI con pausa di 2s: le richieste
    parallele sforavano il rate limit gratuito della API (anche sulle
    connessioni simultanee, non solo sul conteggio). `fetchOne` logga
    con `console.error` le risposte anomale (campo `Information`/`Note`/
    `Error Message` al posto di `data`) invece di ingoiarle
  - `euOilBulletinHistory.ts` (3 set 2026) — **il fetcher UE in uso dal
    cron del giovedì.** Scarica il file STORICO della Commissione ("Price
    developments 2005 onwards", ~4,3 MB): tutte le settimane dal 2005 e un
    secondo foglio coi prezzi AL NETTO delle imposte. Un file solo, un
    parser solo, e la scomposizione fiscale che si aggiorna da sé ogni
    settimana.
    Il parsing è per **chiave esatta** e non per somiglianza: la riga 1 di
    ogni foglio contiene chiavi macchina (`IT_price_with_tax_euro95`), così
    se la Commissione riordina le colonne il parser regge, e se ne rinomina
    una fallisce dicendo QUALE manca — non "12 colonne su 54", da cui non
    si diagnostica niente.
    Due fatti verificati sui dati veri e annotati nel file: i prezzi sono
    già in EURO e non in valuta nazionale (la Danimarca a 2524 per 1000 l è
    plausibile in euro; in corone sarebbe un decimo del reale), e la riga
    più recente coincide con quanto il bollettino settimanale aveva già
    salvato — il cambio di fonte non muove i numeri già in pagina.
    Trappole del formato, tutte osservate: colonne `CTR` di separazione,
    `XX_exchange_rate` intercalate SOLO per i 7 paesi fuori dall'euro,
    colonne `UK_*` presenti nell'intestazione ma senza dati (le righe
    recenti sono più corte dell'header — un parser posizionale ci
    sbatterebbe), righe di disclaimer in coda scartate perché la colonna 1
    non contiene una data, date in ordine DECRESCENTE.
    Il cron chiede `latestOnly`: senza, ogni giovedì riscriverebbe ~56.000
    righe per aggiornarne 54. `maxDuration` della rotta è passato da 10 a
    **60 s** — il file pesa 4,3 MB ed ExcelJS lo apre per intero (7 fogli,
    uno da 12.000 righe). Se la durata reale in `fetch_runs` si avvicina al
    limite, la strada è leggere in streaming invece di caricare in memoria.
    Verificato prima di spedirlo: 12 controlli contro una ricostruzione
    fedele del layout, compresi i valori reali dell'Italia e lo scatto
    della guardia quando una colonna sparisce.
    **Fase 3 (4 set 2026): scomposizione accisa/IVA.** Il file storico ha
    anche i fogli `VAT` ed `Excise duties` (ispezionati, `Excise duties -
    components` e `Other Indirect Taxes` deliberatamente esclusi — vedi
    "Cosa manca"), diversi in forma dai fogli prezzi: sono A EVENTI (una
    riga solo quando l'aliquota/accisa CAMBIA, non ogni settimana) e usano
    celle Excel unite (il codice paese compare solo sulla prima riga del
    blocco, va "portato avanti" a mano riga per riga). Tre funzioni nuove:
    `readExchangeRates` (legge `${codice}_exchange_rate` dal foglio prezzi,
    serve a convertire l'accisa da valuta nazionale a euro per i paesi
    fuori dall'euro — imprecisione nota e accettata nelle settimane a
    cavallo di un'adozione dell'euro, il tasso di cambio è solo
    settimanale), `readTaxEventSheet` (gestisce le celle unite, produce per
    paese una lista di eventi ordinata per data), `valueAsOf` (lookup
    "as-of": l'ultimo evento con data ≤ la settimana cercata, `null` se il
    foglio non copre ancora quel paese in quel periodo — mai un valore
    indovinato)
  - `euOilBulletin.ts` — **NON più collegato al cron** (3 set 2026). Resta
    perché lo usa `scripts/inspect-eu-bulletin.ts` ed è un parser validato
    che vale come ripiego. Non ricollegarlo senza motivo: perderebbe il
    prezzo netto, e con quello la scomposizione fiscale. Scarica e parsa il
    file XLSX settimanale della Commissione, parsing DIFENSIVO per nome
    colonna (non posizione), validato contro dati reali
  - `eiaUs.ts` — API REST EIA (governo USA), carburanti settimanali
  - `savePricePoints.ts` / `saveEuFuelPrices.ts` / `saveUsFuelPrices.ts`
    — persistenza. Usano `onConflictDoUpdate` sul vincolo unique: se la
    fonte ripropone la stessa data aggiornano il prezzo, non duplicano.
    Valorizzano `retrieved_at` con un timestamp unico per run (aggiornato
    anche sul re-fetch dello stesso dato). `saveEuFuelPrices.ts` /
    `saveUsFuelPrices.ts` inseriscono anche in `regions` con
    `onConflictDoNothing({ target: regions.name })` — target esplicito,
    vedi "Errori noti" sul vincolo `UNIQUE` mancante
  - `savePricePointsBulk` (`savePricePoints.ts`) / `saveRetailFuelPricesBulk`
    (`saveRetailFuelBulk.ts`) — scritture massive per `scripts/backfill.ts`,
    ACCANTO alle funzioni del cron, non al posto loro. Il driver è `neon-http`:
    ogni query è una richiesta HTTP, quindi due query per punto sono perfette
    su 2 punti e inservibili su 10.000. Qui: una query per l'anagrafica, poi
    `INSERT` a blocchi di 500 righe. La deduplica su `(commodity, data)` prima
    di scrivere NON è opzionale: due righe uguali nello stesso statement fanno
    fallire l'intero blocco con "ON CONFLICT DO UPDATE command cannot affect
    row a second time". `excluded.price` nel `set` perché in un INSERT
    multi-riga ogni riga ha un prezzo diverso: un valore costante li appiattirebbe
    tutti sullo stesso numero
  - `fetchRunLog.ts` — `startFetchRun` / `finishFetchRun`: registrano
    l'esito di ogni run in `fetch_runs`. Regola: il logging NON fa mai
    fallire il fetch (try/catch interno; `startFetchRun` torna `null` se
    il DB è giù, `finishFetchRun` no-op su `null`)
- `src/lib/cronAuth.ts` — `isAuthorizedCronRequest(request)`, l'unico
  punto in cui si verifica `CRON_SECRET` (3 set 2026). Prima il confronto
  era in linea in ogni route: **nega l'accesso se il segreto manca**
  (prima `Bearer ${undefined}` diventava la stringa "Bearer undefined" e
  chiunque la inviasse passava — vedi "Errori noti") e confronta gli
  SHA-256 con `timingSafeEqual`. Non reintrodurre il confronto in linea
- `src/app/api/cron/*/route.ts` — 11 route (erano 8: dal 15 set anche
  `fetch-ch-fuel-prices`, dal 24 set `fetch-chokepoint-transits` e
  `fetch-istat-nic` — vedi le voci "Traffico marittimo" e "Sezione
  inflazione" in fondo a "Cosa manca") protette da `CRON_SECRET`
  (header `Authorization: Bearer`, via `isAuthorizedCronRequest`),
  schedulate in `vercel.json`:
  `fetch-market-prices-1`…`-5` (materie prime, ogni batch a un'ora
  diversa: 06/08/10/12/14 UTC — su Hobby i cron hanno precisione
  oraria ±59min, quindi vanno distanziati di ore non di minuti),
  `fetch-eu-fuel-prices` (giovedì; **ogni giorno dal 15 set 2026, sera**), `fetch-us-fuel-prices` (**ogni giorno
  alle 23 UTC** dal 15 set 2026 — prima lunedì 18 UTC, ma l'EIA sposta il
  giorno di pubblicazione dopo le festività: il dato del 7/9 è uscito
  mercoledì 9/9 ed è arrivato sul sito solo lunedì 14. Upsert idempotente,
  quindi i giorni senza novità non creano righe nuove; motivazione estesa
  in testa alla route),
  `fetch-mimit-prices` (ogni giorno, 05 UTC — prima del primo batch
  materie prime delle 06, per distribuire il carico sulla giornata).
  Il limite Hobby è 100 cron job/progetto, uno al giorno ciascuno.
  **`fetch-mimit-prices` (7/9/2026)**: costruita su un fetcher
  (`src/lib/fetchers/mimit.ts`) che al momento di scriverla non era mai
  stato verificato contro un file reale (rete del container cloud bloccata
  verso mimit.gov.it). **Verificato lo stesso giorno da Yuri con
  `npm run inspect:mimit` contro il file vero**: 23.985 impianti
  riconosciuti, 93.097 righe prezzo, **0 righe orfane, 0 sigle provincia
  sconosciute**, 428 combinazioni provincia×carburante×self/servito. Il
  parsing regge — i 57 "carburanti scartati" erano tutti nomi commerciali
  attesi (Blue Diesel, HVOlution, GPL, metano, ecc.), il filtro funziona
  come da commento in `mimit.ts`. La route continua comunque a loggare
  sempre i contatori di scarto (`diagnostics`) e a rifiutarsi di scrivere
  se più del 50% delle righe prezzo risulta orfana (probabile parsing
  rotto, non un problema dei dati) — rete di sicurezza permanente, non
  un preflight una tantum.
  **Da questo cron, `fetch_runs` ha per la prima volta dati reali anche
  per `source = "mimit"`** (prima il cron MIMIT non scriveva lì): questo
  sblocca l'estensione della "freschezza visibile" (vedi sotto) anche a
  `/provincia/[slug]`, finora esplicitamente esclusa perché quel dato
  sarebbe stato inventato.
  Ogni route (via `runMarketPriceCron` o direttamente) apre e chiude un
  record in `fetch_runs`. `ok: true` = "run finita senza eccezioni", NON
  "tutto salvato": `points_saved` sotto l'atteso (es. rate limit Alpha
  Vantage a HTTP 200) è il segnale da leggere a valle.
  **`points_saved` conta le righe TOCCATE, non le date nuove** (3 set
  2026): `savePricePoints` usa `onConflictDoUpdate`, quindi se la fonte
  ripropone la stessa `recorded_at` l'upsert aggiorna la riga esistente e
  la conta lo stesso. Un batch da 2 commodity riporta `points_saved: 2`
  sia quando arriva un prezzo nuovo sia quando riscrive per la
  centesima volta lo stesso. Non è una metrica di freschezza — per
  quella si guarda `max(recorded_at)` nelle tabelle dati (vedi
  "Diagnosi 3 set 2026" sotto)
- `src/app/api/data/route.ts` — endpoint pubblico `GET /api/data`: JSON
  con gli ultimi prezzi (stessi dati della homepage, da `queries.ts`).
  CORS aperto (`Access-Control-Allow-Origin: *`) + handler `OPTIONS`
  esplicito per il preflight (Next ne genera uno automatico ma senza gli
  header CORS). Valori GREZZI, nessuna conversione di visualizzazione
  (cotone in cents/pound). `force-dynamic`, nessuna cache
- `src/app/page.tsx` — homepage. **Dal 16 set 2026 è una panoramica e il
  dettaglio sta in pagine dedicate (vedi la voce "Recensione del 16 set
  2026" in fondo): la descrizione qui sotto è storica.** Era una
  dashboard con sezione "Maggiori
  variazioni" (in cima, senza numero d'indice: top 5 scostamenti da
  `priceMovers`, materie prime 90gg + carburanti 30gg con la finestra
  dichiarata per riga; ruggine = in salita, verde = in discesa) — copre
  nella sostanza il punto 15 del brief ("cosa è cambiato"), ma è una
  classifica dei 5 maggiori scostamenti assoluti tra TUTTE le serie, non
  una frase narrativa per singola voce: non garantisce che un indicatore
  specifico (es. Brent) compaia se non è tra i 5 (verificato 1 set 2026).
  Poi mappa Europa, calcolatore d'impatto, tabelle materie prime/carburanti. Ogni
  tabella ha i pulsanti "Scarica CSV/JSON" (`DownloadDataButtons`). Nav
  header = "tab bar" connessa (contenitore unico + `border-l` tra le
  voci). Contenuto a `max-w-7xl` (1280px). Footer piatto (bordo
  superiore, niente `rounded-t-*` né gradiente decorativo), divisori
  `border-l` tra le colonne (solo `lg`); colonna "Progetto" con
  Metodologia + Glossario. Tabella materie prime: badge a 3 stati nella
  colonna Data (da `src/lib/freshness/`) — nessun badge se `aggiornato`,
  `system-signal-wait` (ocra) se `in_attesa`, `system-signal-up`
  (ruggine) se `non_aggiornato`. `LinkedinGlyph` è una SVG
  inline (lucide non ha icone brand). Footer, colonna "Progetto": il link
  "Codice sorgente" (1 set 2026) riusa `Code2` di lucide — già usato per
  lo stesso `GITHUB_URL` nell'header — invece di una SVG brand dedicata,
  per coerenza col fatto che l'header stesso non tenta un logo GitHub
  reale (non esiste in lucide 1.34.0, vedi "Errori noti").

  **Header e footer (3 set 2026, restyling "chrome scuro")**: header e
  footer stanno su `bg-system-chrome`, le sezioni in mezzo restano
  sull'avorio. L'header contiene, nell'ordine:
  1. `HeroBackdrop` (`src/components/HeroBackdrop.tsx`) — la curva reale
     del Brent a 90 giorni disegnata in filigrana dietro il wordmark,
     dalla serie `commoditySeries` già calcolata (nessuna nuova query).
     È in posizione assoluta e ritagliata dall'`overflow-hidden`
     dell'header; nascosta sotto `sm` (con `preserveAspectRatio="none"`
     su uno schermo stretto e alto diventa una montagna verticale che
     compete col wordmark). **Attenzione**: essendo posizionata, dipinge
     sopra il contenuto in flusso normale — per questo `TickerBand` e la
     `<nav>` hanno `relative`. Toglierlo fa riapparire la curva sopra la
     fascia.
  2. Wordmark "MERCURIALE" (`MercurialeMark` 38px + testo maiuscolo
     spaziato, `text-[30px]` su mobile → `sm:text-4xl` → `lg:text-5xl`:
     la scala mobile è tarata a video, a `text-4xl` il wordmark andava
     sotto l'hamburger a 390px). Resta un `<p>`, non un heading — l'h1
     vero è la riga sotto, che descrive il CONTENUTO della pagina
     (rilevante per SEO/accessibilità); il nome del prodotto da solo non
     porta segnale tematico. L'occhiello sotto ha un cursore lampeggiante
     (`animate-caret`), `aria-hidden` + `select-none`.
  3. `TickerBand` (`src/components/TickerBand.tsx`) — la fascia sintetica,
     ora a 5 valori: Brent, benzina UE, diesel UE, ultimo dato, e **fonti
     in linea** (nuova, 3 set 2026). Ogni valore ha sotto una riga di
     contesto: variazione percentuale nella finestra della serie (dai
     `priceMovers` già calcolati) per i primi tre, cadenza per gli ultimi
     due. Sostituisce la fila di 4 `StatusLabel` — componente RIMOSSO in
     questo commit, non più usato da nessuna parte.
     "Fonti in linea" (`sourcesOnline / sourcesTotal`) conta le fonti che
     hanno almeno una serie nello stato `aggiornato`: non è una lettura di
     `fetch_runs` (quella dice se il nostro cron è partito), dice se il
     DATO è arrivato. Per i carburanti la fonte si deduce dal continente
     via `CONTINENT_SOURCES` in `page.tsx` — mappa esplicita e NON
     esaustiva di proposito, perché `getFreshnessConfig` lancia un errore
     sulle fonti sconosciute: un continente non mappato resta fuori dal
     conteggio invece di far saltare la homepage.
  4. La `<nav>` a piena larghezza sul chrome, con Metodologia e Glossario
     spinti a destra da `ml-auto`.
  Il footer ha lo stesso trattamento più un filo ambra (`h-0.5
  bg-system-chrome-accent/50`) come segno di chiusura. `MobileNav`: il
  pulsante hamburger usa i token `system-chrome-*` (vive nell'header), il
  pannello a tendina resta chiaro come le sezioni dati.

- `src/app/metodologia/page.tsx` — pagina trasparenza (fonti, limiti,
  frequenza aggiornamento, licenza MIT). Spiega anche il badge "non
  aggiornato" e documenta l'API pubblica `/api/data` (sezione 05, con
  esempio di risposta). **Allineata al modello di freshness a 3 stati e
  a "media dei 27" (Fase 1, 3 set 2026)** — prima descriveva solo il
  vecchio badge binario
- `src/app/glossario/page.tsx` — pagina FAQ/glossario (WTI vs Brent,
  Weekly Oil Bulletin, EIA, cadenza giornaliera vs mensile, badge "non
  aggiornato" → rimanda a metodologia). Stesso pattern di
  `metodologia/page.tsx` (helper `Section`, header "torna alla dashboard").
  Stessa nota: allineata al modello a 3 stati (Fase 1, 3 set 2026)
- `src/app/paese/[slug]/page.tsx` (Fase 2, 3 set 2026) — pagina per
  singolo paese UE (`/paese/italia`, 27 slug generati staticamente da
  `generateStaticParams`, contenuto letto a ogni richiesta via
  `force-dynamic` come la home). Mostra prezzo alla pompa, netto, quota
  fiscale, posizione in classifica (`rankByTaxShare`) e confronto con la
  media dei 27 — stessa formula della home, non ricalcolata (vedi
  `europeFuelStats.ts`). Se lo slug è valido ma manca ancora un prezzo per
  quel paese (es. subito dopo l'aggiunta), mostra una pagina onesta invece
  di un 404: l'URL è corretto, manca solo il dato.
  **Scomposizione accisa/IVA (Fase 3, 4 set 2026)**: `FuelStatCard` mostra
  Accisa/IVA/Altre imposte SOLO quando tutti e tre i valori sono
  disponibili — un oggetto `breakdown` (non tre variabili sciolte) perché
  TypeScript lo restringe correttamente dentro `{breakdown && (...)}`,
  a differenza di un booleano calcolato a parte (bug intercettato prima
  della consegna, avrebbe fallito `tsc --noEmit`). "Altre imposte" si
  mostra solo sopra 0,0005 €/L, per non stampare un residuo di
  arrotondamento come se fosse una voce fiscale reale
- `src/lib/europeFuelStats.ts` (Fase 2, esteso in Fase 3) —
  `computeEuropeFuelStats` ricostruisce, dai prezzi europei più recenti,
  sia il dato per paese sia la media dei 27: prima viveva solo dentro
  `page.tsx`, estratto perché `/paese/[slug]` lo doveva vedere
  IDENTICO (stesso arrotondamento, stessa esclusione dei paesi senza
  netto dalla media). `taxPerLiter`/`taxSharePercent`/`rankByTaxShare`
  vengono da qui. Fase 3 aggiunge `vatEurPerLiter` (IVA in €/L, calcolata
  e MAI salvata: base imponibile = netto + accisa, così come si applica
  per legge nell'UE) e `otherTaxesPerLiter` (residuo = lordo − netto −
  accisa − IVA, copre "Other Indirect Taxes" e gli scarti di
  arrotondamento tra fogli — clampato a 0 solo in visualizzazione, mai
  nei dati salvati)
- `src/lib/countries.ts` (Fase 2) — `EU_COUNTRY_SLUGS`,
  `englishNameForSlug`/`routeForCountry`: il ponte fra lo slug URL
  (`italia`) e la chiave grezza in inglese usata da `regions.name`
  (`Italy`). Un solo registro, usato sia da `/paese/[slug]` sia dai link
  della mappa verso le pagine paese
- `src/lib/sources.ts` + `src/components/SourceNote.tsx` (Fase 2,
  gerarchia delle fonti, 3 set 2026) — `SOURCES` è il registro unico di
  fonte → `kind` (`primaria` = ente istituzionale con mandato pubblico,
  Commissione Europea/EIA; `aggregata` = intermediario commerciale, Alpha
  Vantage). `SourceNote` (estratto qui da un'implementazione copiata a
  mano fra homepage e pagina paese) mostra un badge per ogni `kind`
  presente nelle fonti citate, deduplicato — due fonti primarie nella
  stessa nota non producono due badge identici. Un solo posto per
  aggiungere una fonte futura (MIMIT in Fase 4): basta una voce in
  `SOURCES`, tutto il resto la eredita
- `src/lib/narrative/generateWeeklyNarrative.ts` +
  `src/lib/fetchers/saveWeeklyNarrative.ts` (Fase 2, "cosa è cambiato
  questa settimana", 3 set 2026) — funzione pura (stesso principio di
  `priceHistory.ts`: niente IO, si testa con dati finti) che confronta due
  settimane di prezzi carburante UE e genera 2-3 frasi narrative: benzina
  e diesel in Italia (sempre, se c'è una variazione) più il paese con lo
  scostamento maggiore sulla benzina fra gli altri 26. Scompone la
  variazione in prodotto/tassa quando entrambe le settimane hanno il
  netto ("il diesel è salito di 3 centesimi, tutti di prodotto, zero di
  tassa") — non un'altra tabella di percentuali, che esiste già come
  "Maggiori variazioni" in home. Le righe si ARCHIVIANO in
  `weekly_narratives` (non si ricalcolano a ogni richiesta): una
  dichiarazione fatta in un momento preciso non deve cambiare sotto i
  piedi di chi l'ha già letta se un dato storico viene corretto in
  seguito. Generate dal cron `fetch-eu-fuel-prices` dopo il salvataggio
  dei prezzi, upsert su `(week_of, kind)`
- `src/components/MercurialeMark.tsx` (3 set 2026) — il marchio del
  progetto: due assi con i terminali a T e una stella a quattro punte
  nell'incrocio (un dato su un grafico). Componente React inline e non
  `<img>`: eredita il colore dai token via `currentColor`, quindi UN file
  serve sia l'ambra del chrome (`system-chrome-accent`) sia la ruggine
  dell'avorio (`system-accent`). Ha sostituito `ProvenanceStamp` in header
  (38px) e footer (28px). **`ProvenanceStamp` NON è stato rimosso** e resta
  nelle note "Fonte:": il marchio dice "questo sito è Mercuriale", il
  timbro dice "questo numero ha una fonte" — due messaggi diversi — e a
  14px i tratti sottili del marchio collassano mentre il timbro regge.
  L'SVG di partenza dell'utente era un bitmap ricalcato (39 path, 34 KB di
  coordinate decimali, sfondo opaco): ridisegnato a mano in sei path.
  L'estremità destra dell'asse del tempo è un disco pieno e non un
  terminale a T — è "l'ultima rilevazione", come il punto finale della
  curva di HeroBackdrop; nel disegno originale era un pallino rosso che
  fluttuava slegato e leggeva come un badge di notifica.
  **Nota**: la stella a lati concavi è il glifo diventato universale per
  "contenuto generato da AI", che su un sito la cui promessa è la
  verificabilità lavora contro. Sostituire le quattro `Q` con altrettante
  `L` dà un rombo a lati diritti e chiude la questione — deciso di restare
  fedeli al disegno originale, ma la manopola è lì.
- `src/app/icon.svg` / `apple-icon.svg` / `opengraph-image.tsx` (3 set
  2026) — convenzioni di nome dell'App Router: Next li trova da sé e
  genera i `<link>` e i meta tag, quindi in `layout.tsx` NON vanno
  dichiarate icone (sarebbe un doppione). La favicon non è il marchio
  rimpicciolito ma un secondo disegno (tratti da 3 a 4 unità, assi
  accorciati, disco tolto): a 16-32px i tratti sottili collassano —
  verificato rasterizzando. `opengraph-image.tsx` usa `ImageResponse`, che
  renderizza JSX con **Satori**, non con un browser: niente Tailwind (solo
  stili inline), `display: flex` esplicito su ogni contenitore con più di
  un figlio, e `currentColor` NON eredita nulla (non c'è albero CSS) — per
  questo il marchio è ridisegnato inline in quel file e va aggiornato in
  due posti se cambia. Il testo usa il font di sistema e non IBM Plex:
  caricarlo sarebbe una fetch di rete in build per un'immagine che si
  guarda a 200px in una timeline. `twitter.card` è passato a
  `summary_large_image`.
- `src/components/EuropeFuelMap.tsx` — mappa interattiva (react-simple-maps,
  atlante 50m — NON usare 110m, omette paesi piccoli come Malta/Lussemburgo).
  Inquadratura stretta sull'Europa con dati (`rotate: [-13,-50]`,
  `scale: 900`, viewBox 800×490): riduce il grigio a est. Cipro e Malta
  finiscono ai bordi sud-est. Scala colore divergente centrata sulla
  media UE (`euAveragePetrol`, 1 set 2026), non più rampa monocroma
  min/max — scarto firmato `(prezzo - media) /
  (max - min)`, clampato con fattore `*2`, verde (`system-signal-down`) sotto
  media / ruggine (`system-signal-up`) sopra, centro neutro
  `system-border` (NON `system-panel`, troppo simile al fill "nessun
  dato" `#f0ebe0`). Box fissi "più economico/più caro" RIMOSSI (erano
  sovrapposti alla cartografia).
  **Restyling e vista fiscale (3 set 2026)**. Tre aggiunte, tutte perché il
  colore da solo non si traduce in numeri senza passarci sopra il mouse:
  (a) **barra-legenda continua** costruita con la STESSA `divergingColor`
  dei paesi — una rampa ridisegnata a mano comincerebbe a mentire appena si
  ritocca la formula. La tacca della media sta alla sua posizione
  proporzionale REALE: sui dati del 31 ago cade al 55%, e disegnarla a metà
  racconterebbe una simmetria che non c'è;
  (b) **tre riquadri nominati** sotto la mappa — più economico, Italia, più
  caro — ciascuno col quadratino di colore dalla stessa funzione, che è il
  ponte per ritrovare quel paese sulla cartografia. L'Italia c'è SEMPRE,
  anche quando non è un estremo. Stanno sotto e non sopra: i box
  sovrapposti erano stati tolti apposta perché coprivano i paesi;
  (c) **due selettori**: `FUELS` (benzina/diesel) × `MEASURES` (prezzo/quota
  fiscale). Sono due DIMENSIONI, non quattro chip in fila — con quattro
  voci il lettore deve ricostruire da sé che sono assi incrociati. `unit` e
  `format` vivono in `MEASURES` perché sono ciò che distingue una misura
  dall'altra (tre decimali e "€/L" contro uno e "%"). **Terza misura
  "Accisa" aggiunta in Fase 3 (4 set 2026)**: una voce in più in
  `MEASURES`, dai fogli fiscali del file storico (`petrolExciseEur`/
  `dieselExciseEur`) — esattamente il caso per cui il registro era nato,
  ha pagato la seconda volta senza toccare il resto del componente.
  Il centro della scala per la quota fiscale è la **quota della media**
  `(media pompa − media netto) / media pompa`, NON la media delle quote dei
  27: rispondono a domande diverse e sui dati veri differiscono di quasi
  due punti. Lo scostamento cambia unità con la misura — millesimi per i
  prezzi, punti percentuali per le quote.
  `euAveragePetrol` è diventato `euAverage` con quattro numeri (lordo e
  netto per entrambi i carburanti): ogni metrica ha bisogno della PROPRIA
  media come centro, e usare quella della benzina mentre si disegna il
  diesel colorerebbe mezza Europa dalla parte sbagliata. Resta un oggetto
  di soli numeri — è un Client Component.
  Corretto un difetto latente: con zero valori per la metrica attiva,
  `Math.min(...[])` vale `Infinity` e finiva stampato come "Infinity €/L".
  L'Italia ha un contorno ambra permanente, il paese in hover uno di
  inchiostro più spesso: due segnali distinti che non si confondono. Il
  tooltip mostra tutte e quattro le combinazioni con in evidenza quella
  attiva — sono già in memoria, e si legge "2,017 €/L di cui il 51,4% è
  tassa" senza cambiare vista.
  Il titolo della sezione è "Prezzo dei **carburanti** in Europa": con la
  mappa commutabile, "benzina" smentiva il grafico sotto. Statico e non
  legato alla metrica attiva, altrimenti sarebbe l'unica sezione con
  l'intestazione renderizzata lato client.
  Header doc in testa al file spiega la formula della scala divergente
  direttamente nel codice, non solo qui
- `src/components/FuelImpactCalculator.tsx` — calcolatore costo
  pieno/trasporti, EU vs USA, senza conversione EUR/USD (valute
  originali fianco a fianco). Header doc in testa al file (1 set 2026,
  audit design system) — prima ne era privo.
  **Due righe fiscali (3 set 2026)**: imposte sul pieno e quota fiscale del
  prezzo. È la sottrazione della mappa portata sulla cifra che una persona
  riconosce — "51,4%" è un'informazione, "di questi 100,84 € di pieno,
  51,83 sono imposte" è la stessa informazione dopo che ti ha toccato. Per
  gli USA mostrano "—": l'EIA non pubblica il netto, e il carico fiscale
  americano NON si stima applicando la percentuale europea
- `src/components/FuelPriceTable.tsx` — tabella carburanti con ricerca
  live e anteprima compressa (metà paesi più economici, metà più cari;
  ordinamento per prezzo medio benzina+diesel crescente). Header doc
  esistente ampliato (1 set 2026, audit design system) per coprire anche
  ricerca/ordinamento/modalità di visualizzazione, non solo il "perché"
  dell'anteprima
- `src/components/MobileNav.tsx` — menu hamburger mobile. Prop `items`
  (ancore alla dashboard, con icona) e `pageLinks` (link a pagine —
  Metodologia, Glossario — resi come `next/link`, senza icona). Stesso
  trattamento "tab bar" connessa del menu desktop, in verticale
- `src/components/DownloadDataButtons.tsx` — pulsanti "Scarica CSV/JSON"
  per una tabella. Costruisce il file nel browser (Blob + object URL),
  nessun endpoint dedicato. CSV con escaping RFC 4180 (campo quotato solo
  se contiene `,`/`"`/a-capo, virgolette raddoppiate). Usato dalla
  tabella materie prime in `page.tsx` e da `FuelPriceTable`
- `src/components/PriceHistoryChart.tsx` — grafico storico con selettore
  a chip (una serie alla volta — unità/valute incompatibili tra serie,
  vedi commento nel file). `AreaChart`/`Area` di recharts (1 set 2026,
  era `LineChart`/`Line`), `type="monotone"` invariato: sotto la linea
  c'è una `<linearGradient>` che sfuma da `system-accent` (ambra, opacità 0.25)
  a trasparente. L'`id` del gradiente viene da `useId()`, NON un id
  fisso in stringa — la homepage monta due istanze insieme (materie
  prime + carburanti) e un id fisso in `<defs>` farebbe collidere i due
  `<linearGradient>` nello stesso DOM (verificato: senza `useId()` i due
  `url(#id)` puntano entrambi alla prima `<defs>` trovata)
- `CONTRIBUTING.md` / `.github/ISSUE_TEMPLATE/segnala-dato-errato.yml`
  (1 set 2026) — convenzioni per contributor esterni (fonte/data/limiti
  sempre dichiarati, niente fallimenti silenziosi, vincoli `UNIQUE`
  prima di `onConflictDo*`) + template issue strutturato per segnalare
  un dato che non corrisponde alla fonte ufficiale, senza scrivere
  codice. `package.json` ha ora anche `description`/`repository`/
  `homepage`/`license` (mancavano; `private: true` resta invariato)

- `scripts/backfill.ts` (3 set 2026) — backfill dello storico prezzi:
  `npx tsx scripts/backfill.ts <commodities|us-fuel> [--from AAAA-MM-GG]
  [--only SIMBOLI] [--dry-run]`. NON costa richieste aggiuntive ad Alpha
  Vantage: ogni risposta conteneva GIÀ l'intera serie in `json.data` e il
  cron ne usava solo `data[0]`, scartando il resto — `fetchOne` è ora un
  involucro di `fetchCommoditySeries`, unica implementazione del parsing
  per cron e backfill. `intervalForCategory` dichiara che gli endpoint
  energia accettano `daily` e metalli/agricole solo `monthly`: non è una
  preferenza nostra, è un limite della fonte (per questo il rame si muove
  una volta al mese). Default a 10 anni — senza limite il WTI giornaliero
  risale al 1986 e scriverebbe decine di migliaia di righe che nessuna
  schermata mostra. Idempotente (stesse chiavi uniche del cron): si
  rilancia senza duplicare e riprende dopo un'interruzione.
  **Esito del primo lancio reale (3 set 2026)**: `commodities` 8013/8367
  righe — cotone, zucchero e caffè fuori per quota Alpha Vantage esaurita
  (~25 richieste/giorno, consumate anche dai batch del cron chiamati a
  mano nella stessa giornata); `us-fuel` 1044/1044 senza intoppi (quota
  EIA separata). `--only COTTON,SUGAR,COFFEE` esiste per riprendere i
  mancanti senza rilanciare tutti e dieci i simboli: su 25 richieste al
  giorno, sette sprecate per riscrivere righe identiche sono la
  differenza tra recuperarli oggi e rimandare. `selectCommodities`
  fallisce forte su un simbolo sconosciuto invece di filtrare a vuoto —
  stesso principio di `getFreshnessConfig`, mai un default silenzioso
  Dal 3 set 2026 c'è anche il target **`eu-fuel`**: un solo download da
  4,3 MB copre 27 paesi, due carburanti, tutte le settimane, con prezzo
  alla pompa E netto. Default a 10 anni anche qui.
  **Rilancio Fase 3 (4 set 2026)**, dopo l'aggiunta di `excise_eur`/
  `vat_rate_percent` allo schema: 27.374 rilevazioni (2016-09-05 →
  2026-08-31, 507 settimane), tutte e 27.374 con prezzo netto, accisa e
  aliquota IVA valorizzati. Il backfill NON si lancia da solo dopo una
  migrazione — il cron settimanale aggiorna solo l'ultima settimana, lo
  storico già salvato resta con le colonne nuove a `NULL` finché non lo si
  rilancia a mano
- `scripts/inspect-eu-history-taxes.ts` (Fase 3, 4 set 2026) — ispezione
  di sola lettura dei 4 fogli del file storico mai letti prima (`VAT`,
  `Excise duties`, `Excise duties - components`, `Other Indirect Taxes`).
  Script separato da `inspect-eu-history.ts` (che guarda solo i primi 3
  fogli prezzi/netto/consumi) perché all'inizio VAT/Excise sembravano
  assenti — non lo erano, semplicemente nessuno script li apriva
- `scripts/inspect-eu-history.ts` (3 set 2026) — ispeziona il file
  STORICO del bollettino UE ("Price developments 2005 onwards", ~4,3 MB),
  diverso da quello settimanale usato in `euOilBulletin.ts`. Contiene i
  prezzi al netto delle imposte, l'IVA e le accise: **lo stesso download**
  serve sia il backfill europeo sia la scomposizione del prezzo alla
  pompa (vedi "Cosa manca"). Solo ispezione — il parser va scritto su un
  layout osservato, non ancora fatto

## Convenzioni di stile del codice

- Commenti in italiano, spiegano il "perché" non il "cosa" (il progetto
  serve anche per imparare, chi legge il codice vuole capire le scelte)
- Font: `body` usa IBM Plex Sans (`var(--font-plex-sans)`, caricato in
  `layout.tsx`); `font-mono` (IBM Plex Mono) per prezzi, date, unità,
  codici. Erano Geist Sans/Mono fino al 3 set 2026: Plex è una
  superfamiglia con Sans e Mono disegnati insieme, quindi le cifre in
  colonna e il testo che le descrive hanno lo stesso "colore" tipografico.
  I pesi vanno dichiarati esplicitamente in `layout.tsx` (Plex NON è una
  variable font su Google Fonts: senza `weight`, next/font non sa quali
  file scaricare). NON rimettere `Arial` letterale sul body.
- **Schema cromatico: chrome scuro + dati chiari** (restyling 3 set 2026).
  Header, fascia sintetica, barra di navigazione e footer sono su bruno
  scuro (token `system-chrome-*`); tutte le sezioni di dati — tabelle,
  mappa, grafici, calcolatore — restano su avorio chiaro. Non è un dark
  mode: non c'è nessun blocco `prefers-color-scheme: dark` e `globals.css`
  dichiara `color-scheme: light` (tutti gli input del sito vivono nelle
  sezioni chiare). Non aggiungere un dark mode parziale, e non spostare
  contenuto-dato sul chrome: la scelta è che i numeri si leggano scuri su
  chiaro, che è più riposante per la lettura estesa.
- Formattazione di numeri/unità/valute nella UI: sempre via
  `src/lib/format.ts` (separatori it-IT). Mai `toFixed` col punto nei
  componenti. Il dato grezzo (DB, `/api/data`, export CSV/JSON) NON si
  formatta; l'unità originale della fonte va tenuta nel `title`.
- Palette colori: token `system-*` definiti in `src/app/globals.css` dentro
  `@theme` (Tailwind v4, non `tailwind.config.ts`). Non scrivere più hex a
  mano nelle classi — usare sempre le utility generate:
  Rinnovata il 3 set 2026 (era verde petrolio su grigio freddo, ora ambra
  su avorio caldo — vedi il blocco di commento in testa a `globals.css`
  per il perché). **Attenzione a due separazioni che è facile ricompattare
  per sbaglio:**

  1. **Accento di marca ≠ colori di segnale.** Prima `system-accent`
     faceva entrambi i lavori (era il verde del brand E il colore di
     "prezzo in discesa"): funzionava per caso, perché verde = giù. Con
     l'ambra no — ambra e ruggine sono vicine e le due direzioni
     diventerebbero indistinguibili. Ora `system-accent` è SOLO marca, e
     il significato sta in `system-signal-*`. Se cambia il marchio, il
     significato dei numeri non deve cambiare.
  2. **Ogni colore ha una versione per fondo chiaro e una per fondo
     scuro.** `system-accent` (#8a5a10) è tarato per l'avorio,
     `system-chrome-accent` (#e8a33d) per il bruno; idem per i segnali
     (`system-signal-up` vs `system-chrome-signal-up`). Usare quello
     sbagliato dà testo illeggibile — la ruggine #b0461f sul bruno del
     chrome dà circa 2.3:1, sotto ogni soglia. Non "riusare lo stesso hex
     tanto si vede".

  - `system-bg` (#f8f5ee) — sfondo pagina
  - `system-panel` (#f0ebe0) — sfondo pannelli secondari, PIATTO, stesso
    piano della pagina (es. hover di riga tabella)
  - `system-surface` (#fffdf8, 1 set 2026) — sfondo di una card/pannello
    SOLLEVATO sopra `system-bg` (header, footer, tabelle, tooltip,
    dropdown, input di ricerca), sempre accoppiato a un bordo o un'ombra.
    Diverso da `system-panel` proprio per questo: non è piatto. Introdotto
    per dare un nome ai 15 usi ripetuti di `bg-white` sparsi nel sito
    (stesso ruolo, nessun token dedicato prima) — trovati durante l'audit
    design system sotto, migrati 1:1 (nessuna modifica visiva: bianco
    puro prima e dopo)
  - `system-ink` (#191509) — testo principale
  - `system-ink-secondary` (#57503f) — testo secondario (paragrafi, nav)
  - `system-ink-muted` (#6f6857, era #8b8371 fino al 16 set 2026) — dettagli minori (text-xs, celle tabella)
  - `system-border` (#e4dccb) — bordi standard
  - `system-border-subtle` (#f0ebe0) — divisori più leggeri
  - `system-accent` (#8a5a10) — ambra scura: SOLO marca (link, hover,
    wordmark, timbro), mai significato
  - `system-signal-up` (#b0461f) — ruggine: valore in salita / sopra media
  - `system-signal-down` (#3f6f4a) — verde bosco: in discesa / sotto media
  - `system-signal-wait` (#7a6122, era #8a6f28 fino al 16 set 2026) — ocra spento, stato "in_attesa" del
    modello di freshness a 3 stati (`src/lib/freshness/`). Tono neutro e
    non un ambra "warning" acceso: comunica "in attesa del prossimo dato",
    non un problema
  - `system-series-1…3` (#7b4fb0 / #00959e / #a06a00, 24 set 2026) —
    colori di IDENTITÀ per grafici con più serie (oggi: inflazione),
    validati con lo script della skill dataviz; mai significato
  - `system-chrome` (#14110c) / `system-chrome-raised` (#1c1811) — fondo
    del chrome e strato sollevato sopra di esso (la fascia sintetica). La
    differenza è volutamente minima: deve leggersi come uno strato, non
    come un blocco diverso
  - `system-chrome-ink` (#efe7d8) / `system-chrome-ink-muted` (#9a8f7c) /
    `system-chrome-border` (#2c2519) — inchiostri e bordi sul chrome
  - `system-chrome-accent` (#e8a33d) — l'ambra sul fondo scuro
  - `system-chrome-signal-up` (#ef8a5a) / `system-chrome-signal-down`
    (#6fcf9a) — i due segnali schiariti per il fondo scuro

  I token rimossi il 3 set 2026: `system-accent-down` e
  `system-accent-wait` (diventati `system-signal-up`/`-wait`). Se trovi
  ancora un riferimento in una pagina o in un commento, è un residuo.

  Eccezione voluta: i colori SVG grezzi dentro `EuropeFuelMap.tsx` (fill dei
  paesi senza dati, stroke dei confini) restano hex letterali perché sono
  attributi JS/SVG, non classi Tailwind — non vanno migrati.

  **Audit design system (1 set 2026)**: verifica manuale (grep su `src/`
  per hex/classi colore fuori palette e per spaziature arbitrarie, lettura
  dei componenti principali) — non l'esecuzione di uno strumento o una
  skill dedicata (nessuna skill con questo nome è installata in questo
  progetto). Ha prodotto il token `system-surface` sopra e ha aggiunto/
  ampliato la documentazione di intestazione di `EuropeFuelMap.tsx` e
  `FuelImpactCalculator.tsx` (mancava del tutto) e `FuelPriceTable.tsx`
  (esisteva già ma copriva solo il "perché" dell'anteprima compressa, non
  ricerca/ordinamento — vedi sotto). Nessun'altra criticità trovata:
  naming dei componenti coerente, `SystemCard` ancora usato come
  documentato, nessuna spaziatura arbitraria oltre a quella già nota sul
  wordmark header. (`StatusLabel`, citato qui prima, è stato rimosso col
  restyling del 3 set 2026: lo sostituisce `TickerBand`.)
- **Animazioni**: si anima SOLO a partire da uno stato già visibile — mai
  `opacity: 0` in attesa di uno scroll o di un IntersectionObserver. Chi
  arriva con JS lento, chi ha le animazioni disattivate e il primo
  fotogramma catturato dai social devono vedere la pagina già leggibile.
  Le tre animazioni esistenti (`animate-scan-in` sulle celle della fascia,
  `animate-caret` sul cursore dell'occhiello, `animate-draw` sulla curva
  dell'hero) sono CSS pure, dichiarate in `globals.css`: nessun Client
  Component, nessun rischio di hydration mismatch, zero KB di bundle. Sono
  tutte azzerate dentro `@media (prefers-reduced-motion: reduce)` — non
  rallentate, TOLTE, portando ogni elemento allo stato finale. Niente GIF
  né immagini decorative: se serve movimento o texture, si generano dai
  dati (vedi `HeroBackdrop`).
- Font numeri: sempre `font-mono tabular-nums` per allineamento colonne
- Ogni sezione dati ha una nota "Fonte: ..." sotto (componente
  `SourceNote`) — non rimuoverle, è il principio cardine del progetto
- `SystemCard` (`src/components/SystemCard.tsx`) è deliberatamente
  riservato a contenuti "speciali" (oggi: solo `SourceItem` in
  `metodologia/page.tsx`, la scheda di ogni fonte dati) — verificato
  1 set 2026, un solo punto d'uso in tutto il codice. Non usarlo per
  card generiche di layout: se si diffonde perde il segnale "questo è
  un elemento particolare", che è il motivo per cui esiste

## Errori noti e già risolti (non ripeterli)

- `react-simple-maps` richiede `--legacy-peer-deps` (dichiara supporto
  solo fino a React 18, ma funziona bene con React 19) — c'è già un
  `.npmrc` con `legacy-peer-deps=true` che lo gestisce automaticamente
- **Server Component → Client Component**: mai passare funzioni (incluse
  icone lucide-react) come prop da `page.tsx` a un componente con
  `"use client"` — causa "Functions cannot be passed directly to Client
  Components" A RUNTIME (non lo cattura né `tsc` né `eslint`, solo
  visitando la pagina o con `npm run dev`). Se serve un'icona in un
  client component, definiscila lì dentro, non passarla come prop.
- **`lucide-react` (1.34.0) non ha icone di brand**: niente `Linkedin`,
  `Github`, `Twitter` ecc. (`typeof Linkedin === "undefined"`). Per un
  logo di brand serve una SVG inline — vedi `LinkedinGlyph` in
  `page.tsx` (`fill="currentColor"` per ereditare il colore del link)
- `drizzle-kit` non legge `.env.local` di default (è una convenzione
  solo di Next.js) — `drizzle.config.ts` lo carica esplicitamente con
  `dotenv`
- **Colonne FK: usare `integer`, non `serial`.** `serial` aggiunge una
  sequence e un `DEFAULT nextval()` che su una chiave esterna non
  servono e mascherano un INSERT senza valore. Inoltre `drizzle-kit
  generate` NON rileva il passaggio `serial`→`integer` (genera solo un
  `SET DATA TYPE` no-op): il `DROP DEFAULT` va aggiunto a mano alla
  migrazione (vedi `0002`)
- **Migrazioni non automatiche**: dopo aver toccato `schema.ts`,
  `npm run db:generate` crea il file SQL, `npm run db:migrate` lo applica
  al DB Neon. Il deploy su Vercel NON esegue le migrazioni. I save dei
  fetcher includono le colonne nuove nella query: se il DB è indietro
  rispetto allo schema, i cron falliscono
- Vulnerabilità dipendenze: quando `npm audit` segnala qualcosa,
  verificare se c'è un fix non-breaking prima di ignorarlo; se il fix
  richiede un downgrade breaking e il rischio non è applicabile al
  nostro uso, documentarlo nel commit invece di lasciarlo silenzioso
- **Alpha Vantage + parallelo = rate limit silenzioso**: chiamare più
  endpoint commodity in parallelo (`Promise.all`) fa tornare ad alcune
  richieste `{"Information": "..."}` con HTTP 200 al posto di `data`.
  Vanno fatte SEQUENZIALI con pausa. Il free tier è ~25 richieste/giorno
  + limite sulle connessioni simultanee. Bug originale: Aluminum/Sugar/
  Coffee mai salvate perché erano gli ultimi del batch parallelo
- **Cron su Vercel Hobby**: precisione solo oraria (±59 min) e massimo
  una esecuzione al giorno per cron. Per distanziare davvero due job
  servono ORE diverse nello `schedule`, non minuti. Espressioni
  sotto-giornaliere (`*/30 * * * *`, `0 * * * *`) fanno FALLIRE il deploy
- `getLatestCommodityPrices`/`getLatestFuelPrices` non filtrano per data:
  mostrano l'ultimo valore salvato "per sempre", anche se vecchio di
  mesi. Mitigazione PARZIALE: le materie prime hanno il badge freshness
  a 3 stati (`src/lib/freshness/`); i carburanti no. Se cambi la cadenza
  di una fonte, aggiorna anche `FRESHNESS_CONFIG` in
  `src/lib/freshness/config.ts`
- **Bypass di `CRON_SECRET` con il segreto mancante (corretto 3 set
  2026).** Il controllo era `authHeader !== \`Bearer ${process.env.CRON_SECRET}\``.
  In JavaScript `undefined` interpolato in un template literal diventa la
  STRINGA "undefined": senza la variabile d'ambiente (deploy di preview,
  variabile cancellata) il segreto atteso diventava letteralmente
  `Bearer undefined` e chiunque poteva far scattare i cron, bruciando il
  rate limit giornaliero di Alpha Vantage. Regola generale: un controllo
  di sicurezza che non può funzionare deve NEGARE, non aprire. Ora tutto
  passa da `src/lib/cronAuth.ts`
- **`regions.name` senza vincolo `UNIQUE` (corretto in migrazione `0005`,
  1 set 2026).** Prima, `saveEuFuelPrices.ts`/`saveUsFuelPrices.ts`
  chiamavano `insert(regions).onConflictDoNothing()` senza un vincolo su
  cui appoggiarsi: Postgres non aveva modo di rilevare il conflitto, quindi
  INSERIVA sempre una riga regione nuova (una per ogni punto petrol/diesel
  processato, non una per country). A cascata, anche il vincolo unique su
  `retail_fuel_prices` (`region_id, fuel_type, recorded_at`) non scattava
  mai per lo stesso paese, perché `region_id` cambiava ad ogni run: ogni
  cron EU/US duplicava le righe-prezzo invece di aggiornarle. Bonificati
  81 duplicati in `regions` e 54 righe-prezzo duplicate in
  `retail_fuel_prices` (dati identici, solo `region_id`/`retrieved_at`
  diversi — verificato prezzo per prezzo prima della cancellazione). Ora
  `regions.name` ha `.unique()` in `schema.ts` e i due fetcher passano
  `onConflictDoNothing({ target: regions.name })` esplicito

- **`.env.local` scritto con la codifica sbagliata** (3 set 2026). Un file
  creato con la redirezione di PowerShell (`"CHIAVE=x" > .env.local`) su
  Windows PowerShell 5.1 viene salvato in **UTF-16LE**, non UTF-8: `dotenv`
  non riconosce nessuna riga e `tsx` stampa `injected env (0)` senza alcun
  errore. Stesso effetto con un BOM davanti (`Set-Content -Encoding utf8`
  su PS 5.1 lo aggiunge). Scriverlo con
  `[System.IO.File]::WriteAllLines("$PWD\.env.local", $lines)`, che usa
  UTF-8 senza BOM. Verifica senza esporre i valori: il primo byte di
  `[System.IO.File]::ReadAllBytes(".env.local")` dev'essere la lettera
  iniziale della prima chiave (`0x44` per `DATABASE_URL`); `0xEF` è un BOM,
  `0xFF` è UTF-16
- **Le variabili `Secret` su Vercel sono write-only** (3 set 2026): una
  volta salvate non si rileggono e non si possono riconvertire in `Config`.
  Se il valore serve altrove va rigenerato dalla fonte. `vercel env pull`
  NON è la scorciatoia: collega la cartella a un progetto Vercel, e se
  l'account attivo è quello aziendale invece del personale si finisce con
  un `.vercel/project.json` che punta all'organizzazione sbagliata. Per tre
  variabili conviene copiarle a mano; per sistemare lo scope:
  `npx vercel whoami` / `teams ls` / `switch`
- **Due cloni locali diversi sul PC** (3 set 2026).
  `C:\Users\ammin\progetti\commodity-tracker` è il clone di lavoro vero.
  Esiste anche `C:\Users\ammin\Documents\commodity-tracker`, stesso
  remote ma fermo indietro nella cronologia: usarlo per errore è costato
  mezza sessione (il sito in locale non mostrava il restyling perché si
  lavorava, senza saperlo, nella cartella sbagliata). I due hanno anche
  `.env.local` DIVERSI. Prima di dare per scontato "a che punto siamo",
  controlla sempre il percorso e `git log --oneline -5`; prima di
  aggiungere una variabile d'ambiente, verifica con `Select-String` se
  esiste già — una riga duplicata produce 401 che sembrano casuali su
  chiamate identiche
- **Branch locale sbagliato senza accorgersene** (4 set 2026). Il clone
  di lavoro (`C:\Users\ammin\progetti\commodity-tracker`) era rimasto
  checked out su un branch di feature (`mappa-legenda`) invece di
  `main`, con `main` locale 20 commit indietro rispetto a
  `origin/main` (merge di PR fatti su GitHub mai scaricati in locale
  con `git pull`). `git push origin main` da un branch diverso da
  `main` prova a pushare il ref locale `main` — vecchio — non il
  branch corrente: il rifiuto `[rejected] ... fetch first` che ne
  risulta è fuorviante, sembra un problema di sincronizzazione remota
  quando in realtà si sta pushando la cosa sbagliata. Prima di ogni
  `git push origin main`, controllare `git status` (branch corrente +
  eventuali merge a metà) e non dare per scontato di essere su `main`
  solo perché è lì che si vuole finire. Recupero pulito quando càpita:
  `git merge --abort` (se c'è un merge a metà) → `git checkout main` →
  `git pull origin main` → `git cherry-pick <branch-con-il-commit-buono>`
  per portare solo il commit che serve, senza tutto il resto del branch
  di feature → `git push origin main`
- **Environment variable "sensitive" visibile nella UI di Vercel ma
  assente a runtime** (4 set 2026, vedi bullet `EIA_API_KEY` /
  `CRON_SECRET` più sopra). Non fidarsi dello screenshot delle
  Environment Variables come prova che una route la vede: verificare
  con una route di debug temporanea che riporta `!!process.env.X` e la
  lunghezza (mai il valore). Se conferma l'assenza, cancellare la
  entry su Vercel e ricrearla digitando il nome a mano (non
  incollandolo) — sospetto principale è un carattere invisibile nel
  campo Key, indistinguibile a schermo
- **`.gitignore`, `.env*` non copre tutti i nomi.** Il pattern `.env*`
  non intercetta un file senza punto iniziale (es. `Claude
  outputs/env.local`, una copia locale delle variabili d'ambiente fatta
  da una sessione Cowork). `git add -A` l'ha messo in staging con dentro
  `DATABASE_URL`, `CRON_SECRET` e le chiavi API vere, a un passo dal
  commit su un repo pubblico (4 set 2026, sessione registro correzioni —
  intercettato con `git status` prima del commit, mai finito in git:
  confermato con `git log --all --oneline -- <file>` vuoto). Aggiunta
  la riga `/Claude outputs/` esplicita al `.gitignore`. **Prima di
  ogni `git add -A`/`git commit` in questo repo, leggere `git status`
  per intero e cercare in particolare file con `env`, `secret`, `key`
  nel nome che non siano quelli attesi** — non fidarsi del fatto che
  `.gitignore` esista, verificarne l'effetto riga per riga quando un
  file nuovo compare in staging da una cartella non vista prima

- **Data MIMIT letta nel formato sbagliato → righe doppie (corretto 15 set
  2026).** `parseExtractedOn` cercava `gg/mm/aaaa`, ma la riga reale è
  "Estrazione del 2026-09-14" (ISO). La lettura falliva sempre e
  `saveMimitPrices` ripiegava in silenzio su `new Date()`: ogni run (cron
  delle 05 e ogni Run manuale) salvava 214 righe con l'ORARIO del download
  come `recorded_at`, e il vincolo unico non scattava mai. Sintomo visibile:
  in `/stato-dati` il "dato più recente" MIMIT coincideva al minuto con
  l'ultima esecuzione. Ora il parser vive in
  `src/lib/fetchers/mimitExtractedOn.ts` (puro, testato, accetta ISO e
  gg/mm/aaaa, rifiuta date impossibili) e se la data non si legge il run
  FALLISCE invece di inventarla. Pulizia del DB: cancellate le righe con
  `recorded_at` diverso dalla mezzanotte. Lezione generale: un parser
  scritto senza aver visto il dato vero non deve avere un ripiego
  silenzioso — `inspect-mimit.ts` ora stampa anche la data interpretata

## Workflow con l'utente

- L'utente alterna claude.ai (chat web, dove Claude prepara modifiche in
  un sandbox e le passa come prompt da incollare) e Claude Code (accesso
  diretto al repo locale). Quando lavori qui, hai accesso diretto: usa
  `git log --oneline` per vedere la cronologia reale invece di fidarti
  di quello che un prompt dice di aver già fatto.
- Verifica SEMPRE con `npx tsc --noEmit` e `npx eslint` prima di
  committare. Per modifiche che toccano il confine Server/Client
  Components, esegui anche `npm run dev` e visita la pagina prima del
  push (vedi errore noto sopra). Se la modifica tocca una delle funzioni
  pure coperte da test (vedi Stack), esegui anche `npm test`.
- Dopo il push, Vercel ridispiega automaticamente — non serve azione
  manuale su Vercel.
- Claude su claude.ai lavora su un clone nel cloud e produce **patch git**
  (`mercuriale-NN.patch`), che l'utente applica con `git am` e pusha dal
  proprio PC: il container non ha credenziali per il repository e non può
  pushare. Verifiche obbligatorie fra `git am` e `git push`:
  `npx tsc --noEmit` e `npx eslint`.
- `git push` aggiorna SOLO il branch, e Vercel ne fa una **Preview**. La
  produzione cambia solo quando la pull request viene fusa in `main`
  (3 set 2026: mezz'ora persa a guardare l'URL di produzione aspettando
  modifiche che erano ferme sul branch). Tre livelli distinti: `commit` →
  `localhost:3000`, `push` → URL Preview, merge in `main` → produzione.
- **Terza modalità di lavoro (Cowork, 4 set 2026)**: Claude guida l'utente
  a distanza sul suo PC via bridge device — legge/scrive file, ma NON ha
  una shell diretta su quella macchina (niente `device_bash` in questa
  configurazione): i comandi vanno incollati dall'utente in PowerShell e
  l'output torna qui per la verifica. `gh` CLI NON è installato sul PC
  dell'utente: per controllare lo stato di una PR si usa il browser
  (in-app o dell'utente) su `github.com/drakekluser99/commodity-tracker`,
  non `gh pr status`. Prima di assumere che una modifica descritta in un
  riepilogo di sessione precedente sia "ancora da fare", verificare con
  `git log --oneline` e lo stato reale della PR: in questa sessione tutta
  la Fase 3 risultava già committata e già mergiata quando è iniziata,
  nonostante il riepilogo la descrivesse come lavoro in sospeso.
- **`adm.gov.it` (Agenzia delle Dogane) blocca il fetch automatico**
  (4 set 2026, ricerca per "numero del giorno"): sia le pagine HTML sia
  i PDF dei comunicati stampa tornano 403 al tool di ricerca web, anche
  se l'URL è corretto e pubblicamente indicizzato da Google — restano
  raggiungibili da un browser normale. Stesso per `finanze.gov.it` (i
  bollettini mensili delle entrate tributarie). Per un dato di queste
  fonti, cercare la citazione ripresa da stampa specializzata (in questo
  caso Il Riformista) invece di insistere sul fetch diretto, e linkare
  comunque la pagina istituzionale come `sourceUrl` per il lettore.

## Cosa manca / prossimi passi naturali

Direzione di fondo (brief di allineamento): Mercuriale deve diventare un
"osservatorio aperto dei prezzi" — quanto costa, da dove viene il dato,
quanto è aggiornato, com'è rispetto al contesto, come sta cambiando.
Rafforzare il principio fonte/data/limiti, non diluirlo con funzioni
decorative. Escluso per ora: redesign totale, Oceania/LatAm,
estrapolazioni causali. (Media UE ponderata e storico lungo, esclusi in
origine, sono stati fatti il 15 set 2026: vedi i blocchi A e C in fondo.)

**PUNTO DI RIPRESA — fine sessione 24 set 2026, sera tardi (Claude Code
nel cloud, dopo le PR #29 e #30).** Leggere questo blocco per primo. Il
dettaglio è nelle voci in fondo a questa sezione: "Traffico marittimo",
"CI rifatta", "Ricognizione ISTAT", "Sezione inflazione" e "Controllo
grafico di tutto il sito".

| PR | Cosa |
|---|---|
| drakekluser99/Mercuriale#11, #12, #13 | Traffico marittimo, backend: tabella `chokepoint_transits`, cron IMF PortWatch, storico dal 2019, baseline del "normale", soglie e stati |
| #14 | Pagina `/traffico-marittimo` (sezione 05) con le schede |
| #15 | Grafico transiti con il Brent sotto |
| #16 | Mappa regionale Italia–Golfo; Italia disegnata per ultima anche in `EuropeFuelMap` |
| #17 | Home: sesta cella nella fascia, quinta anteprima |
| #18 | Metodologia, sezione 04 "Traffico marittimo" |
| #19 | Metodologia: tutte e nove le fonti dei dati |
| #20 | Canale di Suez (terzo passaggio) |
| #22 | CLAUDE.md: la freschezza su `/provincia/[slug]` era già fatta dal 7/9 |
| #23 | Carico stimato (campo `capacity`, tonnellate metriche) nelle schede dei passaggi |
| #24 | CLAUDE.md: CI rifatta in `.github/workflows/` (la vecchia era nella radice e non era mai partita) |
| #25 | CLAUDE.md: ruleset "Proteggi main" e ricognizione ISTAT sul NIC |
| #26 | CLAUDE.md: storico NIC dal 1996 e questo punto di ripresa |
| #27 | Inflazione: schema, fetcher ISTAT, raccordo, cron, backfill, pagina `/inflazione` (06), pagine secondarie nell'header |
| #28 | Inflazione: grafico dal 2016, anteprima in home, metodologia |
| #29 | Controllo grafico PC/telefono: barra, numero del giorno, tabella province, formati del grafico (voce "Controllo grafico" in fondo) |
| #30 | Tabelle di Europa, calcolatore e materie prime leggibili su telefono |
| #31 | Pagine `/paese/[slug]` e `/provincia/[slug]` nella cornice comune (header scuro, barra, link di ritorno) |

- **Stato**: traffico marittimo e sezione inflazione COMPLETI, tutto in
  `main` e in produzione: dati ISTAT (512 righe dal 2016), cron
  `fetch-istat-nic` attivo ogni giorno alle 11 UTC, pagina `/inflazione`
  (sezione 06) con schede e grafico, anteprima in home, metodologia,
  pagine secondarie nell'header, README aggiornato (PR
  drakekluser99/Mercuriale#27 e #28, fuse il 24/9). Nessuna PR aperta.
  Da verificare nei prossimi giorni: la prima riga di `fetch-istat-nic`
  in `/stato-dati` (`ok`, 4 serie × 8-12 mesi di punti salvati) e, verso
  il 16 ottobre, che il dato di settembre arrivi da solo.
- **CI e protezione di `main`**: `.github/workflows/ci.yml` gira a ogni
  PR e push su `main` (typegen, tipi, lint, test). Il ruleset "Proteggi
  main" blocca il merge finché il check `check` non è verde: una PR
  appena aperta risulta "blocked" per ~40 secondi, è normale.
- **Vincoli ISTAT da non dimenticare**: 5 richieste al minuto per IP,
  blocco di 1-2 giorni se superato; dal cloud ISTAT non si raggiunge e
  Yuri ha deciso di NON aprire i domini (le verifiche le lancia lui dal
  PC); il cron fa UNA richiesta per esecuzione, nessun nuovo tentativo.
- **Ultima sessione (24/9, sera tardi)**: controllo grafico di tutte le
  pagine su PC e telefono con le correzioni (PR
  drakekluser99/Mercuriale#29) e tabelle di Europa, calcolatore e
  materie prime rifatte per il telefono (#30). Preparati per Yuri, FUORI
  dal repository: una bozza del post LinkedIn su traffico marittimo e
  inflazione, e lo script Playwright `cattura-linkedin.js` che dal suo PC
  fa screenshot e video del sito in produzione (dal cloud il sito non si
  raggiunge). Pubblicare il post tocca a lui.
  **Metodo del controllo grafico, da riusare**: dal cloud il database non
  si raggiunge, quindi si sostituisce TEMPORANEAMENTE
  `src/lib/db/queries.ts` con una versione a dati finti (stesse firme e
  tipi, valori deterministici), si avvia `next dev` con un
  `DATABASE_URL` fittizio e si fotografano le pagine vere con Playwright
  (l'atlante del mondo servito con `page.route`, vedi "Mappa regionale").
  Prima del commit si rimette l'originale e si verifica con `git status`
  che `queries.ts` non compaia. Attenzione: `pkill -f "next dev"` nella
  stessa riga di altri comandi interrompe anche quelli; lanciarlo da solo.
- **Nessun lavoro nuovo concordato.** Idee emerse ma NON decise: altre
  divisioni ECOICOP (es. `04` abitazione, `07` trasporti) nella pagina
  inflazione; una settima sezione richiederebbe di rifare la barra (a
  1280 px è piena); gli altri script con `process.exit()` (vedi la voce
  "Sezione inflazione").
- **Resta aperto, e dipende da Yuri**: rilanciare `npm run
  chokepoint:baselines` circa una volta al mese; dominio personalizzato
  (`SITE_URL`); manutenzione annuale di `/numeri`; **rifare gli
  screenshot di `docs/readme/`** (mostrano la home di prima della
  divisione in pagine: dal cloud non si possono fare con i dati veri);
  verificare sul sito ISTAT la licenza dei dati (probabilmente CC BY
  4.0, non ancora scritta in metodologia perché non verificata);
  pubblicare il post LinkedIn (numeri da ricontrollare sul sito il giorno
  stesso: PortWatch aggiorna il martedì).
- **Resta aperto, lavoro di codice**: la barra delle sezioni sta in
  1280 px senza margine, un'etichetta più lunga la fa scorrere di nuovo.
  (`/paese/[slug]` e `/provincia/[slug]` nella cornice comune: fatto il
  25/9, vedi "Pagine paese e provincia nella cornice comune" in fondo.)
- **Come si è lavorato**: sessione Claude Code nel cloud, con accesso
  diretto al repo e alle PR via GitHub. Un passo alla volta: codice e
  screenshot con dati finti (Playwright, pagina di prova temporanea mai
  committata), push sul branch, verifica di Yuri sulla Preview, poi PR e
  merge fatti da Claude quando la CI è verde. Dal cloud database,
  PortWatch, ISTAT, jsdelivr e `portwatch.imf.org` NON si raggiungono:
  backfill, query e verifiche sui dati li lancia Yuri dal PC
  (PowerShell, `curl.exe` e non `curl`) e carica file o output in chat.
  Nel container nuovo `node_modules` manca: `npm ci`, poi `npx next
  typegen` prima di `npx tsc --noEmit`.
  **Regola imparata**: aggiornare CLAUDE.md PRIMA del merge (con il
  numero della PR verificato), altrimenti in `main` resta scritto "in
  attesa di verifica".

**Registro aggiornamenti del 15 set 2026** (in ordine di commit; il
dettaglio di ciascuno è nelle voci in fondo a questa sezione o in "Errori
noti"):

| Commit | Tipo | Cosa | File / tabelle principali |
|---|---|---|---|
| a3a127f | feat | Indice sezioni fisso 01–05 con sezione attiva | `SectionNav.tsx`, `page.tsx` |
| 3708f5d | fix | Cron carburanti USA ogni giorno (23 UTC) | `vercel.json`, route USA |
| d2fa443 | fix | Data estrazione MIMIT letta anche in ISO, niente ripiego sull'ora corrente | `mimitExtractedOn.ts` (+ pulizia DB) |
| 2f56b05 | feat | Cremisi `system-mark`, cifra chiave per sezione, "Come citare", stati più chiari in `/stato-dati` | `KeyFigure`, `SectionHeading`, `CiteBox`, `sectionHighlights.ts`, `site.ts` |
| 9f38187 | feat | Grafici da 1 mese a 10 anni, freschezza sui carburanti (blocco A) | `/api/history`, `historyWindows.ts`, `PriceHistoryChart`, `FreshnessBadge` |
| 3fae9b7 | feat | Mappa province, calcolatore "un mese/anno fa", nomi italiani materie prime (blocco B) | `ItalyProvinceMap`, `public/geo/…2025…`, `pastValue.ts`, `commodityNames.ts` |
| c4473e8 | feat | Media UE ponderata + riquadri su desktop (blocco C) | tabella `eu_weighted_averages` (migr. 0011) |
| 7cfe74f | feat | Riquadri Italia vs Francia/Austria/Slovenia (blocco D1) | `NeighbourTiles.tsx`, `italyVsNeighbours` |
| 460d64e | feat | Raccolta `/numeri`, cifra del giorno a rotazione (blocco D2) | `annualFigures.ts`, `app/numeri`, fonte `eurostat` |
| 7a1e6e4 | feat | Svizzera: BFS mensile + cambio BCE (blocco D3) | tabella `swiss_fuel_prices` (migr. 0012), cron `fetch-ch-fuel-prices` |
| 4ac5647 | fix | Soglie di freschezza materie prime: energia 8+4, mensili 80+15 | `freshness/config.ts`, testi |
| 89db3b4 | fix | Bollettino UE controllato ogni giorno (15 UTC) | `vercel.json`, route UE, testi |

Operazioni manuali legate a questi commit (da lanciare in locale, non le
fa il deploy): `npm run db:migrate` (0011, 0012), `npm run
backfill:eu-fuel`, `npm run backfill:ch-fuel`, backfill delle materie
prime mancanti con `--only`, pulizia delle righe MIMIT con data
sbagliata. Se una tabella nuova risulta vuota in produzione, il primo
sospetto è una di queste non lanciata.

**Stato al 15 set 2026 (fine sessione Cowork).** Tutti i punti proposti
quel giorno sono fatti: feedback visitatori, blocchi A, B, C e D (parti
1-3) e la correzione delle soglie di freschezza (voci in fondo a questa
sezione). Resta aperto:
- **Dominio personalizzato**: lo configura Yuri su Vercel; poi va cambiato
  `SITE_URL` in `src/lib/site.ts` (lo usano layout, robots e sitemap) e
  `homepage` in `package.json`.
- **Manutenzione annuale a mano** della raccolta `/numeri`
  (`annualFigures.ts`): ADM ogni primavera, Eurostat quando escono i dati
  2025 (marzo e luglio 2027).
- Le voci qui sotto marcate come "manca"/"da fare" vanno lette alla luce
  delle voci più recenti in fondo: diverse sono state superate (es. la
  freschezza dei carburanti, fatta nel blocco A).

- **Freshness a 3 stati — FATTO per le materie prime (1 set 2026) e per
  i carburanti (blocco A, 15 set 2026; il testo qui sotto è storico).** `src/lib/freshness/` (config
  source/symbol-aware + calcolo con grace period) è cablato sulla
  tabella materie prime in `page.tsx`. Per estenderlo ai carburanti
  serve: aggiungere `source`/`fuelType` (o region) alle query di
  `LatestFuelPrice` (oggi non selezionano `source`, come per le
  commodity prima del fix), e wirare il badge nella tabella/mappa
  carburanti — la config `FRESHNESS_CONFIG` in `config.ts` ha già le
  entry `eu_weekly_oil_bulletin`/`eia_us` pronte, manca solo l'uso
- **Prosa metodologia/glossario allineata al modello a 3 stati — FATTO**
  (Fase 1, 3 set 2026): `metodologia/page.tsx` e `glossario/page.tsx`
  menzionano ora anche `in_attesa`, non solo il vecchio badge binario
- **Pagina pubblica "Stato dei dati" — FATTO (Cowork, 4 set 2026, sessione
  serale).** `/stato-dati` (`src/app/stato-dati/page.tsx`), collegata in
  nav desktop/mobile/footer come Metodologia e Glossario. Due sezioni:
  - **Pipeline di acquisizione**: una card per JOB (non per fonte —
    Alpha Vantage ha 5 job, uno per batch) con l'ultima esecuzione
    registrata, badge di stato, punti salvati, dato più recente. Due
    scelte non ovvie: (a) NESSUN badge di freschezza per i 5 batch Alpha
    Vantage, perché mescolano commodity a cadenza diversa (es. batch 2:
    gas naturale giornaliero + rame mensile) e un giudizio unico
    nasconderebbe la serie più lenta — badge calcolato solo per
    `eu_weekly_oil_bulletin`/`eia_us`, dove tutta la fonte condivide
    un'unica cadenza; (b) un run rimasto `ok: null` (mai concluso) da
    più di `STALE_RUN_MINUTES` (10) passa da "in corso" a "interrotto":
    le funzioni cron di Vercel hanno `maxDuration` di pochi secondi, un
    run così vecchio è quasi certamente un crash che non ha mai chiamato
    `finishFetchRun`, non un'esecuzione ancora in volo.
  - **Correzioni recenti**: le ultime righe di `data_corrections`,
    formattate per campo (`vat_rate_percent` è un'aliquota con `%`, non
    un prezzo — usare `formatFuelPrice` l'avrebbe mostrata come un
    prezzo per errore).
  - Dichiara esplicitamente cosa NON copre (sezione "Limiti di questa
    pagina"): il cron MIMIT non scrive ancora in `fetch_runs` (solo
    conteggio righe), quindi non compare.
  - Nuove query in `src/lib/db/queries.ts`: `getLatestFetchRuns()`
    (dedup per job, stessa tecnica delle altre `getLatest*`) e
    `getRecentCorrections(limit)`.
  - **Non verificata con `tsc`/`eslint` in questa sessione**: nessuna
    shell sul PC dell'utente disponibile (solo il bridge file), solo
    scrittura diretta dei file. Commit `ad22850` fatto e pushato
    dall'utente senza segnalare errori di build.
- **Registro correzioni** (Fase 3, ancora da fare): quando una fonte
  ripubblica un valore DIVERSO per la stessa data, oggi
  l'`onConflictDoUpdate` lo sovrascrive e la vecchia versione sparisce.
  Serve un upsert CONDIZIONALE (nuova riga solo se il valore differisce
  dall'ultimo salvato) — richiede di toccare il vincolo unique
  `(commodity_id, recorded_at)`, il tie-break di `getLatest*` e il dedup
  nello storico: va progettato a parte, NON con un insert puro
  (reintrodurrebbe il bug dei duplicati). Va di pari passo con
  `latest_recorded_at` in `fetch_runs`, sotto
- **"Numero del giorno" da fonte annuale — FATTO (Cowork, 4 set 2026,
  sessione serale).** Ultima voce della roadmap del 3 settembre. Sezione
  "Il numero del giorno" in home (simbolo `§`, senza numero d'indice —
  stesso trattamento di "Cosa è cambiato"/"Maggiori variazioni"), fra
  "Maggiori variazioni" e la mappa carburanti.
  **Scelta della fonte** (ricerca via web search in sessione, due
  candidati verificati): 39 mld € (accise specifiche benzina+gasolio,
  fonte Annuario Statistico ACI 2025 — ma ACI non dichiara la propria
  fonte primaria) contro **26,7 mld €** (accisa sui "prodotti
  energetici", categoria fiscale più ampia di solo benzina/gasolio, ma
  con fonte DIRETTA: Agenzia delle Dogane e dei Monopoli, bilancio
  annuale dell'attività, dati 2024). Scelto il secondo — decisione
  chiesta esplicitamente all'utente (AskUserQuestion): meno "pulito"
  nello scope, ma la fonte è quella istituzionale giusta, non un
  intermediario. `adm.gov.it` blocca il fetch automatico (verificato: i
  PDF ufficiali tornano 403 al tool di ricerca), il numero è verificato
  da una citazione diretta ripresa da stampa specializzata (Il
  Riformista) del bilancio ADM presentato agli Stati Generali di maggio
  2025 — link in `sourceUrl` punta comunque alla pagina istituzionale
  ADM, raggiungibile da un browser normale anche se non dal tool.
  **Struttura scelta apposta per non ripetere l'errore isolato
  nell'analisi competitor** (un numero statico spacciato per vivo):
  `src/lib/annualFigures.ts` (in origine UN oggetto `ANNUAL_FIGURE`;
  **dal 15 set 2026 è l'array `ANNUAL_FIGURES`**, vedi "Blocco D, parte
  2"), con `year` esplicito che finisce in etichetta ("dati 2024"). Non è un cron: **va aggiornato A MANO**
  ogni primavera quando l'ADM pubblica il bilancio dell'anno precedente
  (i due comunicati trovati durante la ricerca sono di maggio 2025 e
  maggio 2026) — il commento in testa al file lo dice esplicitamente. Se
  questo file non viene toccato per anni, l'etichetta "dati 2024" resta
  ferma e continua a dirlo onestamente, invece di far sembrare il numero
  più fresco di quanto sia.
  Aggiunte di contorno: nuovo `SourceId` `"adm"` in `src/lib/sources.ts`
  (kind `primaria`), nuovo `formatBillionsEur()` in `src/lib/format.ts`
  (1 decimale, non 2 come i prezzi — un miliardo con 2 decimali
  implicherebbe una precisione che una cifra di bilancio "circa" non
  ha), nuova voce ADM in "Fonti dei dati" di `metodologia/page.tsx`.
  **Non verificato con `tsc`/`eslint`** in questa sessione, stesso
  motivo del bullet "Stato dei dati" sopra — nessuna shell sul PC
  disponibile.
- **Localizzazione nomi paese — FATTO (2 set 2026)** per tabella
  carburanti e tooltip mappa. `src/lib/countryNames.ts`
  (`COUNTRY_NAMES_IT` + `localizedCountryName`, fallback esplicito al
  nome originale): mappa verificata contro i 28 valori distinti reali di
  `regions.name` (27 UE + `United States`). È SOLO presentazione — il
  nome inglese resta la chiave grezza per il join di `EuropeFuelMap`
  (`geo.properties.name`, righe ~109-110, non toccato) e per l'export
  CSV/JSON (`exportRows.paese` in `FuelPriceTable`, non toccato). La
  ricerca di `FuelPriceTable` matcha sia il nome inglese sia quello
  italiano (digitare "Germania" o "Germany" trova lo stesso paese).
  Manca ancora: nomi paese nella legenda/etichette estremi della mappa e
  nelle serie del grafico carburanti (oggi ancora "media UE" aggregata,
  non per-paese, quindi non urgente)
- **Calcolatore d'impatto — manca la dimensione temporale/comparativa**
  (brief punto 14, verificato 1 set 2026): `FuelImpactCalculator.tsx`
  mostra solo prezzi ATTUALI (benzina/diesel, costo pieno auto, costo
  carburante/100km camion) per EU vs USA. Nessun confronto "vs mese
  scorso", nessuna deviazione dalla media (quella esiste solo nel
  tooltip della mappa, `EuropeFuelMap.tsx`, non nel calcolatore)
- **Gerarchia fonti — FATTO** (Fase 2, 3 set 2026): `src/lib/sources.ts`
  (registro `SOURCES`, fonte → `primaria`/`aggregata`) + `SourceNote.tsx`
  mostrano un badge per `kind` accanto a ogni nota "Fonte:", deduplicato.
  Resta un accenno nella sola prosa di `metodologia/page.tsx` (non un
  badge), non ancora verificato se vale la pena strutturarlo anche lì
- **API v1 / permalink / "Carta del prezzo" / widget / citazioni** —
  visione a lungo termine del brief, tutto dipendente da metadati e
  freshness stabili. Non prima. `/api/data` attuale è provvisorio
- **MIMIT (Fase 4, ricerca preliminare fatta il 4 set 2026)** — dati
  prezzi carburanti stazione-per-stazione, pubblicati OGNI GIORNO (con
  dato alle 8 del mattino precedente) su
  `mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti`,
  licenza IODL 2.0. Due CSV separati, separatore `|` (cambiato da virgola
  il 10 febbraio 2026, per evitare conflitti coi separatori dentro i
  campi):
  - `anagrafica_impianti_attivi.csv` — anagrafica: `idImpianto`, `Gestore`,
    `Bandiera` (marchio o "pompe bianche"), `Tipo Impianto`
    (Autostradale/Stradale), `Nome Impianto`, `Indirizzo`, `Comune`,
    `Provincia`, `Latitudine`/`Longitudine` (autodichiarate dal gestore,
    non verificate)
  - `prezzo_alle_8.csv` — prezzi: `idimpianto` (FK verso l'anagrafica),
    `descCarburante`, `prezzo` (3 decimali), `isSelf` (0/1, servito vs
    self-service — stesso distributore può avere due prezzi), `dtComu`
    (timestamp di comunicazione del gestore, non "le 8 di mattina" per
    ogni riga nonostante il nome del file)
  **Volume MISURATO il 4 set 2026** (scaricando i file per intero dal PC
  dell'utente, non stimato): 23.981 impianti attivi, 93.068 righe prezzo
  nell'estrazione del giorno — che salvate una per una farebbero ~34
  milioni di righe/anno, contro le ~28.000 di dieci anni di storico UE.
  **Decisione presa**: aggregazione per PROVINCIA (107, non i ~7.900
  comuni — troppo pochi impianti a comune, ~3 in media, per una media
  onesta) calcolata a livello di cron, riga per stazione mai salvata.
  Modello dati: tabella `provinces` SEPARATA da `regions` (non una
  gerarchia sulla tabella esistente — vedi schema.ts sopra), self e
  servito su due colonne distinte (in Italia il self costa quasi sempre
  meno, una media dei due sarebbe un prezzo che nessuno paga davvero).
  **Nota tecnica**: `mimit.gov.it` non è raggiungibile dalla rete del
  container cloud di Claude (egress bloccato per policy) — il download va
  fatto dal PC dell'utente o, più avanti, da un cron Vercel.
  **Scritto E VERIFICATO contro il file reale (4 set 2026)**:
  - `src/lib/provinces.ts` — le 107 province ISTAT, sigla → nome → slug,
    stessa impostazione manuale di `countries.ts`. Confermate tutte e 107
    le sigle reali del CSV, zero sconosciute dopo il fix sotto
  - `src/lib/db/schema.ts` — tabelle `provinces` (anagrafica minima,
    sigla+nome) e `retail_fuel_prices_it` (medie giornaliere per
    provincia×carburante×self/servito, con conteggio impianti per
    trasparenza sul campione) — migrazione `0009` generata e applicata
  - `src/lib/fetchers/mimit.ts` — `fetchAndAggregateMimit()`: scarica i
    due CSV, decodifica UTF-8 con fallback Windows-1252 (verificato:
    questo file è in UTF-8 vero, "CITTÀ SANT'ANGELO" arriva senza
    corruzione — il fallback resta per sicurezza, non ancora scattato),
    salta le due righe di intestazione (`Estrazione del...` + header
    colonne), filtra a `benzina`/`gasolio` standard (57 varianti
    brandizzate/altri carburanti scartate correttamente, es. "Blue
    Diesel", "HVOlution", GPL, Metano) e aggrega per
    provincia×carburante×self/servito.
    **Bug intercettato e corretto al primo lancio reale**: Provincia
    NON si legge da un indice fisso (colonna 7) — alcune righe
    dell'anagrafica hanno un numero di campi diverso da 10 (indirizzi o
    nomi impianto con un `|` residuo, nonostante il cambio di separatore
    di febbraio 2026), e un indice fisso dall'inizio leggeva un pezzo di
    indirizzo o il nome del Comune al posto della sigla su quelle righe
    (60 sigle sconosciute, 113 impianti scartati, 426 righe prezzo
    "orfane" al primo giro). Corretto leggendo Provincia/Latitudine/
    Longitudine dal FONDO della riga (`row[row.length - 3]` ecc.): sono
    sempre le ultime tre colonne qualunque cosa succeda prima. Dopo il
    fix: 23.981/23.981 impianti riconosciuti, 0 sigle sconosciute, 0
    righe orfane, 428/428 combinazioni provincia×carburante×self/servito
    possibili tutte presenti — il campione più pulito di qualunque fonte
    finora integrata
  - `src/lib/fetchers/saveMimitPrices.ts` — upsert su `provinces` (tutte e
    107, sempre) poi su `retail_fuel_prices_it` a blocchi da 500. Primo
    salvataggio reale: **214 righe** (107 province × 2 carburanti, self e
    servito nella stessa riga come da schema)
  - `scripts/inspect-mimit.ts` — `npx tsx scripts/inspect-mimit.ts`
    (contatori, nessuna scrittura) / `--save` (scrive). Il flusso
    dry-run-poi-save ha trovato il bug sopra PRIMA che toccasse il
    database — esattamente il motivo per cui esiste in due modalità
  **`/provincia/[slug]` — FATTO (Cowork, 4 set 2026)**: pagina per singola
  provincia (`/provincia/milano`, 107 slug generati staticamente da
  `generateStaticParams`, contenuto letto a ogni richiesta via
  `force-dynamic`, stesso pattern di `/paese/[slug]`). Mostra self,
  servito, differenza fra i due, media nazionale e posizione in classifica
  fra le 107 — non la scomposizione fiscale: l'accisa è uguale in tutta
  Italia, ripeterla per provincia non direbbe niente di nuovo, e la pagina
  lo dice esplicitamente con un link a `/paese/italia`. Se lo slug è valido
  ma manca ancora un prezzo, mostra una pagina onesta invece di un 404,
  stesso principio di `/paese/[slug]`.
  `src/lib/italianFuelStats.ts` (nuovo file, non un'estensione di
  `europeFuelStats.ts`: le due fonti danno dati di forma diversa — MIMIT
  non ha un prezzo netto da cui sottrarre) — `computeItalianFuelStats`
  ricostruisce il dato per provincia e la media nazionale; **la media è
  PESATA sul numero di impianti di ciascuna provincia**, a differenza della
  media "semplice" dei 27 paesi UE: lì non abbiamo i consumi reali per
  pesarla, qui invece il conteggio impianti è un dato che già salviamo
  (trasparenza sul campione), quindi ignorarlo come peso sarebbe stato lo
  scarto meno onesto, non il più semplice. `rankByPrice` usa la stessa
  convenzione di `rankByTaxShare` (rank 1 = valore più alto, qui il prezzo
  più caro). `src/lib/db/queries.ts` ha una nuova
  `getLatestItalianFuelPrices()` (stesso pattern di dedup di
  `getLatestFuelPrices`, su chiave provincia+carburante). `src/lib/sources.ts`
  ha una nuova voce `mimit` (`kind: "primaria"` — ente pubblico con mandato
  di legge, stessa categoria di Commissione Europea/EIA) e
  `src/lib/freshness/config.ts` una entry `mimit` (1 giorno atteso, 2 di
  grace — più stretta delle fonti settimanali perché una cadenza
  giornaliera che salta un giorno è già un segnale).
  **Collegamento alla UI — FATTO (Cowork, 4 set 2026)**: fino a qui le 107
  pagine esistevano ma si raggiungevano solo digitando l'URL a mano. Ora la
  home ha una sezione dedicata ("05 / Carburanti in Italia, provincia per
  provincia", `id="province"`, anche in `NAV_ITEMS`): media nazionale self
  (benzina/gasolio, la stessa pesata di `italianFuelStats.ts`) più una
  tabella ricercabile, `src/components/ItalyProvinceFuelTable.tsx` (nuovo
  file). Non è un'estensione di `FuelPriceTable.tsx` perché la forma dei
  dati è diversa — lì una riga è (paese, carburante), qui una riga è già
  una provincia intera con benzina e gasolio affiancati — ma riusa la
  stessa idea di UX (ricerca live + anteprima "solo gli estremi,
  economiche/care" + "mostra tutte"), utile con 107 righe invece delle 27
  di FuelPriceTable. Differenza voluta: ogni riga naviga al click (non solo
  il nome) verso `/provincia/[slug]`, perché con 107 righe un bersaglio
  piccolo sarebbe scomodo su mobile — il nome resta comunque un `<Link>`
  vero (non solo `onClick` sulla riga), altrimenti un motore di ricerca non
  vedrebbe nessun link scansionabile. `page.tsx` risolve lo slug di ogni
  provincia lato server con `provinceForCode` prima di passare le righe al
  componente client, così quest'ultimo non deve importare `provinces.ts`.
  **Ancora da fare**: un vero cron schedulato (oggi è uno script manuale,
  coerente con "non prima di uno sprint libero" della roadmap). Nessun
  altro punto noto in sospeso per la Fase 4.
- **Scomposizione fiscale — FATTA** (3 set 2026), ed è il contenuto che
  differenzia il sito. Il numero, sui dati del 31 agosto: dei 177 millesimi
  che l'Italia paga sopra la media dei 27, **155 sono imposte e 22 sono il
  carburante**. In Italia il 51,4% del prezzo alla pompa è tassa (8ª in UE,
  media 48%); per prezzo NETTO l'Italia è 18ª su 27 — il carburante da noi
  non costa particolarmente tanto, costa tanto il litro finito. Estremi:
  Malta 56,3% (ma è la più economica alla pompa), Svezia 29,6%.
  Nessuno di questi è una stima: sono sottrazioni fra due colonne dello
  stesso file, ripetibili ogni settimana per 27 paesi.
  **Estesa in Fase 3 (4 set 2026)**: il totale "di cui imposte" si scompone
  ora in Accisa/IVA/Altre imposte (vedi `europeFuelStats.ts` e i bullet
  sopra su `paese/[slug]/page.tsx` ed `euOilBulletinHistory.ts`).
  Verificato in produzione lo stesso 4 set: benzina in Italia 2,017 €/L,
  netto 0,980, imposte 1,037 = accisa 0,673 + IVA 0,364 (somma esatta).
- **DUE MEDIE UE DIVERSE — da sistemare.** Il file contiene le medie
  calcolate dalla Commissione (colonne `EU_`), che NON coincidono con le
  nostre: 1,950 €/L contro 1,840 sui dati del 31 agosto, **110 millesimi**.
  La nostra è una media semplice dei paesi (Malta pesa come la Germania),
  la loro è ponderata sui consumi. Con la loro, l'Italia è +67 e non +177.
  Nessuna delle due è sbagliata — rispondono a domande diverse — ma il sito
  ne mostra una e deve dire quale: le etichette ora dicono "media dei 27"
  invece di "media UE" (mappa, metodologia e glossario allineati —
  **FATTO, Fase 1, 3 set 2026**).
  Per mostrare ANCHE la ponderata servirebbe salvare la riga aggregata
  `EU_`, e lì c'è un problema di modello: finirebbe in `regions` come se
  fosse un paese, comparirebbe nella tabella carburanti e verrebbe
  conteggiata dentro la nostra stessa media. Serve una colonna
  `regions.kind` ('country' | 'aggregate') e quindi un'altra migrazione.
  **RISOLTO il 15 set 2026 in altro modo (Blocco C)**: la media ponderata
  vive in una tabella SEPARATA, `eu_weighted_averages`, e non in
  `regions` — vedi la voce "Blocco C" più sotto. Resta valido il divieto:
  NON aggiungere `EU_` a `regions`.
- **Fogli fiscali (VAT/Excise) — FATTO** (Fase 3, 4 set 2026): `VAT` ed
  `Excise duties` sono ora letti (`euOilBulletinHistory.ts`), la
  scomposizione accisa/IVA è in produzione su `/paese/[slug]` e come
  terza misura sulla mappa. `Excise duties - components` (scomposizione
  dell'accisa in sotto-voci) e `Other Indirect Taxes` restano
  deliberatamente esclusi — il loro effetto resta comunque visibile come
  residuo "Altre imposte" (lordo − netto − accisa − IVA), senza doverli
  leggere riga per riga
- **Storico: sbloccato** (3 set 2026). Prima c'erano 2 rilevazioni per
  serie — le variazioni si calcolavano su due punti e `HeroBackdrop` si
  rifiutava di disegnare (soglia: 8 rilevazioni). Ora `price_history` ha
  ~8.000 righe su 10 anni. Manca solo completare cotone, zucchero e caffè
  con `--only` (quota Alpha Vantage esaurita al primo lancio). Prossimo
  passo naturale ora che i dati ci sono: una finestra più lunga dei 90/30
  giorni attuali in `PriceHistoryChart`
- **`EIA_API_KEY` / `CRON_SECRET` su Vercel in `Production` — RISOLTO
  (4 set 2026).** Non era un problema di redeploy né di valore sbagliato:
  la variabile appariva correttamente nella UI di Vercel ("Production",
  con data) ma non arrivava a `process.env` a runtime — sospetto
  principale, un carattere invisibile finito nel campo **Key** al
  momento della creazione (es. uno spazio finale: `CRON_SECRET ` e
  `CRON_SECRET` sono indistinguibili nella UI). Isolato con una route di
  debug temporanea (`/api/debug/cron-secret-check`, pubblica, riportava
  solo presenza/lunghezza del segreto — mai il valore — poi RIMOSSA dal
  repo a diagnosi conclusa). **Cancellare la entry su Vercel e
  ricrearla da zero, digitando il nome invece di incollarlo**, ha
  risolto per entrambe le variabili. Verificato con una chiamata reale
  al cron (non solo con la UI): `{ ok: true, saved: 2 }`. Dettaglio
  completo nel project doc
  `mercuriale-riepilogo-4-set-2026-fix-cron-secret.md`. **Lezione**: se
  un giorno un'altra sensitive env var sembra presente nella UI ma il
  codice non la vede, non fidarsi dello screenshot — verificare a
  runtime con una route di debug, e se conferma l'assenza, cancellare e
  ricreare la entry (digitando il nome) prima di sospettare altro
- **Audit sicurezza (3 set 2026)**: fatto. Trovato e corretto il bypass
  di `CRON_SECRET` sopra; aggiunti header di sicurezza in
  `next.config.ts` (`X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`) — **attenzione**: se un giorno
  si fa il widget incorporabile del brief, `X-Frame-Options: DENY` va
  allentato in modo mirato sulla sola rotta del widget, non tolto.
  Nessuna CSP di proposito (va introdotta in `Report-Only` prima: i font
  di next/font e gli stili inline di recharts/react-simple-maps la
  romperebbero in silenzio). Verificato pulito: nessun
  `dangerouslySetInnerHTML`/`eval`, nessuna query SQL costruita a
  stringa, nessun segreto nel repo, `.env*` non tracciati. Le 6
  vulnerabilità `npm audit` restano: `esbuild` via `drizzle-kit` è
  dev-only, `uuid` via `exceljs` non è raggiungibile dal nostro uso
  (parsing in sola lettura di un file da fonte fissa) — entrambe
  fixabili solo con downgrade breaking
- **Audit ortografico (3 set 2026)**: fatto su tutto il testo visibile
  (homepage, metodologia, glossario, componenti, metadata, README,
  CONTRIBUTING). Nessun errore trovato
- **Diagnosi pipeline dati (3 set 2026, ~11:00 UTC).** Prima query reale
  su `fetch_runs` da quando la tabella esiste. Esito, fonte per fonte:
  - **Alpha Vantage: sana.** I batch 1-3 erano partiti quel giorno alle
    06:28 / 08:16 / 10:31 (orari `vercel.json` 06/08/10 UTC più il jitter
    di ±59min di Hobby), i batch 4-5 all'orario del giorno prima perché
    non era ancora il loro turno. Tutti `ok: true`, `points_saved: 2` =
    il numero atteso (2 commodity per batch). **Il dato in pagina era
    comunque vecchio**: metalli e agricole fermi al 1° luglio, energia
    al 1° settembre. Non è un guasto nostro — la fonte non pubblica
    (Alpha Vantage non aveva ancora rilasciato il mensile di agosto; le
    serie giornaliere hanno un ritardo fisiologico di un paio di
    giorni). `retrieved_at` avanzava ogni giorno, `recorded_at` no: è
    esattamente la distinzione per cui le due colonne esistono separate
  - **Carburanti UE: nessuna esecuzione automatica ancora osservata.**
    L'unica run in tabella era del 1 set alle 08:43 — ma era un martedì,
    e lo schedule è `0 12 * * 4` (giovedì 12:00 UTC). Era una chiamata
    MANUALE (lo conferma la run USA 15 secondi dopo, 08:43:56). Il primo
    giovedì utile da quando `fetch_runs` esiste era proprio il 3 set:
    verifica ancora da fare dopo le 12:00 UTC
  - **I cron su Vercel scattano da soli — RISPOSTA OTTENUTA per l'UE**
    (3 set 2026, ~15:30 UTC, verificato in Drizzle Studio). La riga 17 di
    `fetch_runs`: `eu_weekly_oil_bulletin` / `fetch-eu-fuel-prices`,
    `started_at` 2026-09-03 12:17:36 → `finished_at` 12:17:38, `ok: true`,
    **`points_saved: 54`** = 27 paesi × 2 carburanti, il numero esatto
    atteso. Nessuno l'ha lanciata a mano. La conferma è più larga di una
    riga sola: le run Alpha Vantage del 1, 2 e 3 settembre hanno tutte lo
    stesso ritmo 06:2x / 08:1x / 10:3x / 12:2x / 14:2x — è lo scheduler
    che funziona, non una coincidenza. Resta aperta SOLO la controparte
    USA: risposta lunedì dopo le 18:00 UTC
  - **Durata di una run non è un indicatore di salute, ma va guardata.**
    Stessa giornata, stesso file, stesso risultato: la run automatica su
    Vercel (12:17) è durata **1,7 s**, quella manuale dal PC dell'utente
    (13:50) **20,2 s** — dodici volte tanto, entrambe con `points_saved:
    54`. Era solo la rete (datacenter contro linea domestica). Ma 1,7 s
    per scaricare e parsare un XLSX è al limite del plausibile: se
    `points_saved` fosse stato basso, quella velocità sarebbe stata
    l'indizio che il download aveva restituito qualcosa di più piccolo
    del previsto. Si legge sempre insieme al conteggio, mai da sola
  - **Il fallimento silenzioso, conservato.** Riga 1 di `fetch_runs`
    (31 ago 19:19): `ok: TRUE` con **`points_saved: 0`**. Nessuna
    eccezione, nessun errore, zero righe salvate — Alpha Vantage che
    risponde HTTP 200 con un rate limit al posto dei dati. È esattamente
    il caso per cui `fetch_runs` esiste, e ora se ne ha la prova in
    tabella invece che a memoria
  - **Carburanti USA: nessun guasto in produzione.** La run in tabella
    riporta `ok: false` + `errorText: "EIA_API_KEY non configurata"`, ma
    su Vercel quella variabile ESISTE dal 27 ago in tutti e tre gli
    ambienti (Production, Preview, Development) — verificato a schermo.
    La conclusione corretta è che quella run **non girava su Vercel**:
    era la chiamata manuale delle 08:43 fatta in LOCALE, dove
    `.env.local` non ha `EIA_API_KEY`. Lo conferma la run UE 15 secondi
    prima, riuscita con 54 punti: il fetcher UE scarica un XLSX pubblico
    e non ha bisogno di chiavi, quindi in locale funziona lo stesso.
    **Lezione da non ripetere**: una riga di `fetch_runs` non dice DOVE
    ha girato il codice. Prima di dedurre un guasto in produzione da un
    errore di configurazione, va confrontato con le variabili
    effettivamente presenti su Vercel.
    **CORREZIONE della correzione (3 set 2026, pomeriggio)**: la frase
    "la variabile esiste su Vercel in tutti e tre gli ambienti,
    verificato a schermo" era FALSA. Uno screenshot di Settings →
    Environment Variables mostra `EIA_API_KEY` di tipo `Secret` presente
    solo sotto **`Preview`**, non sotto `Production`. La conclusione che
    non fosse un guasto in produzione resta corretta (quella run girava
    in locale), ma la prova addotta non lo era.
    Parte locale RISOLTA: `EIA_API_KEY` è ora in `.env.local` e la run
    manuale delle 13:50:29 del 3 set riporta `ok: true`, `points_saved:
    2`. **Ma funzionare in locale non dice nulla su Production** — è la
    stessa identica trappola di sopra, al contrario.
    **RISOLTO DAVVERO il 4 set 2026** — vedi il bullet
    "`EIA_API_KEY` / `CRON_SECRET` su Vercel in Production — RISOLTO"
    qualche riga sopra per la causa reale (non mancava su Production,
    non veniva letta a runtime per un problema nella entry stessa) e la
    correzione. Verificato con una chiamata autenticata reale al cron,
    non solo con la UI di Vercel
- **Colonna `latest_recorded_at` in `fetch_runs` — FATTO (4 set 2026,
  sessione registro correzioni).** Nasce dalla diagnosi sopra: siccome
  `points_saved` non distingue "dato nuovo" da "stesso dato riscritto",
  per capire se una fonte è ferma servivano due query e un ragionamento.
  Ora ogni run salva la `recorded_at` più recente vista fra i punti
  salvati (`savePricePoints`, `saveEuFuelPrices`, `saveUsFuelPrices`
  la calcolano e la passano a `finishFetchRun`). Manca ancora la pagina
  pubblica "Stato dei dati" che la userebbe — il dato in tabella c'è,
  la pagina no.
- **Registro delle correzioni (`data_corrections`) — FATTO (4 set 2026).**
  Fase 3 della roadmap, ultima voce rimasta. Una riga ogni volta che un
  fetcher sovrascrive un valore già salvato con uno diverso (non la
  prima scrittura — quella riempie una casella vuota, non corregge
  niente). Modulo `src/lib/fetchers/correctionsLog.ts`
  (`logCorrectionIfChanged`), tolleranza 0.00005 per non confondere
  arrotondamenti con vere correzioni. Wired solo nei cron veri (Alpha
  Vantage, bollettino UE — 4 campi: prezzo/netto/accisa/IVA —, EIA USA),
  NON nel backfill storico né nel cron MIMIT: nei commenti di
  `savePricePointsBulk`, `saveRetailFuelPricesBulk` e `saveMimitPrices`
  c'è scritto perché caso per caso (backfill = prima scrittura di
  migliaia di righe, non correzioni; MIMIT = ogni giorno è un'estrazione
  indipendente, non la revisione di un giorno passato). Nessuna UI
  ancora — è igiene dei dati, non user-facing, come da roadmap.
  **Con la pagina "Stato dei dati" e il "numero del giorno" (entrambi
  FATTO, Cowork, 4 set 2026, vedi i due bullet sopra) la roadmap del 3
  settembre 2026 è chiusa per intero, incluse le due voci di Fase 3 che
  erano rimaste aperte dopo questo bullet.** La roadmap non prevede una
  "fase 5": resta ferma qui finché non emerge un motivo nuovo.
- **Freschezza dei dati visibile accanto ai numeri — FATTO (Cowork,
  4 set 2026).** Idea 1 del brainstorm "come rendere il sito unico,
  diverso, utile": `/stato-dati` esisteva già ma andava scoperta
  navigandoci apposta. `SourceNote` (`src/components/SourceNote.tsx`)
  accetta ora un array opzionale `checks: { label, cadence, checkedAt }[]`
  che, quando presente, mostra sotto i badge di fonte una riga tipo
  "Controllato UE ogni giovedì, ultimo controllo 04/09/2026, 12:17" con
  link a `/stato-dati`. Riusa `getLatestFetchRuns()`, nessuna query nuova.
  Cablato SOLO dove un job ha cadenza singola e affidabile: home
  ("Cosa è cambiato", mappa Europa, tabella carburanti — job
  `fetch-eu-fuel-prices`/`fetch-us-fuel-prices`) e `/paese/[slug]`.
  Deliberatamente ESCLUSO da materie prime (Alpha Vantage, cadenza mista
  nello stesso job — stessa ragione di `SOURCE_LEVEL_FRESHNESS` in
  `/stato-dati`), "numero del giorno" (ADM, non è un cron) e
  `/provincia/[slug]` (MIMIT non scriveva ancora in `fetch_runs`, mostrare
  un "ultimo controllo" lì sarebbe stato un dato inventato). Pulizia di
  contorno: `formatDateTime`, prima duplicata in tre file, ora vive in
  `src/lib/format.ts` accanto a `formatDate`. Commit `cd201b9`.
  **Aggiornamento 7/9/2026**: con `fetch-mimit-prices` che ora apre/chiude
  un record in `fetch_runs` (vedi cron MIMIT sopra), l'esclusione di
  `/provincia/[slug]` non è più necessaria — il dato non sarebbe più
  inventato. **FATTO lo stesso 7/9 (commit `656c2b3`, verificato il
  24/9)**: `/provincia/[slug]` passa `checks` del job
  `fetch-mimit-prices` a `SourceNote` e mostra un avviso sopra i numeri
  quando la freschezza `mimit` non è `aggiornato`; `/italia` ha la stessa
  riga `checks`. La frase "non ancora cablato" scritta qui era rimasta
  indietro rispetto al codice.
- **Vercel Analytics — FATTO (Cowork, 4-7 set 2026), in preparazione
  della pubblicazione sui social.** Prima di iniziare a promuovere il
  sito Yuri ha chiesto un parere su cosa mancasse: dominio personalizzato
  (ancora da fare, tocca solo a lui), `sitemap.xml`/`robots.txt` (ancora
  da fare) e misurazione del traffico (fatta, qui). `@vercel/analytics`
  (`<Analytics />` in `src/app/layout.tsx`, via `@vercel/analytics/next`)
  — cookieless, non richiede banner cookie. Attivato anche lato Vercel
  (tab Analytics del progetto, Web Analytics abilitato manualmente da
  Yuri). Commit `8c40265`.
  **Nota sul flusso di consegna**: la patch generata nel container cloud
  (`mercuriale-06-vercel-analytics.patch`) non è mai stata applicata —
  Yuri non è riuscito a scaricare l'allegato dalla chat in `Downloads`
  (`git am` falliva con "No such file or directory" più volte, il file
  semplicemente non arrivava). Risolto passando al bridge device
  (`mcp__remote-devices__*`): con una cartella collegata (via
  `device_request_folder_access`), Claude può leggere/scrivere i file
  DIRETTAMENTE sul PC di Yuri con `device_stage_files`/
  `device_commit_files`, senza passare da un file scaricato a mano —
  molto più affidabile per una modifica piccola. Resta vero che non c'è
  `device_bash` in questa configurazione: Yuri lancia comunque lui
  `npm install`/`tsc`/`eslint`/`git commit`/`git push` in PowerShell.
  **Per la prossima volta**: se il device è collegato e la cartella è
  autorizzabile, preferire la modifica diretta via bridge a una patch
  da scaricare — la patch resta necessaria solo quando il device non è
  raggiungibile o non è collegato a questa sessione.
- **`sitemap.xml`/`robots.txt` — FATTO (Cowork, 7 set 2026), giorno del
  primo lancio del prototipo.** Ultimo punto rimasto della lista sopra
  (Vercel Analytics) prima di una promozione attiva; confermato 404 in
  produzione prima di questa sessione, non solo "da fare" sulla carta.
  `src/app/sitemap.ts` e `src/app/robots.ts` (nuovi file, convenzione
  file-based di Next: Next li serve da sé su `/sitemap.xml`/`/robots.txt`,
  nessuna route scritta a mano). La sitemap prende gli URL da
  `EU_COUNTRY_SLUGS` (`countries.ts`) e `ALL_PROVINCES` (`provinces.ts`)
  — le stesse liste che alimentano `generateStaticParams` nelle route
  vere — così un URL non può disallinearsi dal routing reale. `robots.ts`
  permette tutto tranne `/api/`. `BASE_URL` duplicata a mano nei due file
  (deve combaciare con `metadataBase` in `layout.tsx`) invece di importata:
  stessa scelta "esplicito invece di derivato" di `countries.ts`/
  `provinces.ts` — **da aggiornare in tre punti se cambia il dominio**
  (vedi voce dominio personalizzato, ancora aperta, sotto).
  Scritti via bridge device direttamente in `src/app/`, non verificati con
  `tsc`/`eslint` in questa sessione (nessun `device_bash` — da controllare
  al primo `npm run build`/deploy di Yuri).
- **Analisi finale pre-lancio — Cowork, 7 set 2026** (vedi
  `mercuriale-riepilogo-7-set-2026-analisi-finale-prelancio.md` nel
  progetto Claude). Verificato live (non solo sul codice): sito sano,
  nessun placeholder/errore. Tre cose da sapere, non da correggere ora:
  (1) la riga "Controllato UE ogni giovedì..." (freschezza visibile,
  `cd201b9`) resta vuota per il job `fetch-eu-fuel-prices` finché non
  gira il primo cron UE dopo il fix — atteso, si autopopola da sé;
  (2) i batch materie prime 3/4/5 (alluminio/grano, mais/cotone,
  zucchero/caffè) risultano fermi al 01/07/2026 in `/stato-dati` — il
  sito lo dichiara onestamente col badge "non aggiornato", ma vale la
  pena che Yuri confermi che sia davvero "fonte non ancora pubblicata"
  e non la quota Alpha Vantage esaurita di cui parlava la Fase 1;
  (3) dominio personalizzato ancora assente (resta su
  `commodity-tracker-one-delta.vercel.app`) e attribuzione del footer a
  "Yuri Copparini" con link LinkedIn — entrambe scelte di Yuri, non
  tecniche, da confermare consapevolmente prima di promuovere attivamente.
- **Analisi tecnica/estetica/dati + fix — FATTO (Cowork, 7 set 2026),
  stesso giorno del lancio, seguito dell'analisi finale pre-lancio sopra.**
  Yuri ha chiesto un'analisi tecnica ed estetica del sito con le skill di
  design/accessibilità/tech-debt (non "senza skill"), più un controllo
  freschezza dati, poi "risolviamo tutto". Risultati completi nel progetto
  Claude (`mercuriale-riepilogo-7-set-2026-analisi-tecnica-estetica-dati.md`,
  `mercuriale-riepilogo-7-set-2026-fix-post-analisi.md`). Shippato, commit
  `90f9fd8` (+ `01507ec`, `8d30ef1` per sitemap/robots/CLAUDE.md separati):
  - **Accessibilità (WCAG 2.1 AA)**: mappa Europa (`EuropeFuelMap.tsx`)
    era inaccessibile da tastiera (bug critico) — aggiunti `tabIndex`,
    `aria-label` per paese, `onFocus`/`onBlur`, tooltip con
    `role="status"`/`aria-live`. Grafici prezzo storico
    (`PriceHistoryChart.tsx`) senza alternativa testuale — aggiunto
    riassunto testuale via `role="img"`/`aria-label`, SVG `aria-hidden`.
  - **UX piccola**: la cella "fonti online" nell'header ora è un link a
    `/stato-dati` quando c'è un problema di freschezza (`TickerBand.tsx`
    + `page.tsx`).
  - **CI minima**: `.github/workflows/ci.yml` (typecheck + lint su push/PR)
    — non scrivibile via bridge device (percorso protetto), caricato a
    mano da Yuri via GitHub web. **In realtà il file era finito nella
    RADICE del repo (`ci.yml`), non in `.github/workflows/`: GitHub non
    l'ha mai eseguito** (scoperto il 24/9: sulla PR #23 non girava nessun
    controllo oltre a Vercel). Sostituito il 24/9, vedi la voce "CI
    rifatta" in fondo a "Cosa manca".
  - **Suite di test Vitest** (vedi bullet Stack) — prima non esisteva
    nessun test nel repo.
  - **Cron MIMIT automatizzato** (vedi bullet cron sopra) — chiude
    davvero la Fase 4 (dataset stazione-per-stazione, aggregato per
    provincia), che finora girava solo a mano via `inspect-mimit.ts`.
  - **Diagnosi corretta sui batch Alpha Vantage fermi** (alluminio/grano/
    mais/cotone/zucchero/caffè, item 2 del bullet sopra): ipotesi iniziale
    "stesso bug di silent-failure già risolto" SCARTATA leggendo
    `alphaVantage.ts`/`savePricePoints.ts` per intero — il fetcher logga
    esplicitamente ogni anomalia, non fallisce in silenzio. Più probabile
    un ritardo della fonte stessa. `scripts/inspect-alphavantage.ts`
    (nuovo, `npm run inspect:alphavantage CHIAVE`) per verificarlo contro
    l'API vera.
  - **Bug da tenere a mente per file `.ts` senza `import`/`export`**:
    `scripts/inspect-alphavantage.ts` e `scripts/inspect-eia.ts`
    dichiarano entrambi `apiKey`/`main` a livello di modulo senza nessun
    `import`/`export` — TypeScript li tratta come "script globali" e ne
    fonde lo scope, causando `TS2451`/`TS2393` su `tsc --noEmit` non
    appena un secondo file dichiara gli stessi nomi. Fix:
    `export {};` in cima al file. **Se si aggiunge un altro
    `scripts/inspect-*.ts` in stile "argomenti da CLI, niente moduli",
    mettere `export {};` in cima fin da subito.**
  - **Cache di build TypeScript stantia**: `tsconfig.json` ha
    `"incremental": true`, che scrive `tsconfig.tsbuildinfo` nella root.
    Dopo una modifica fatta da Claude via bridge device (non attraverso
    l'editor di Yuri), `tsc --noEmit` ha mostrato un errore con
    riga/colonna del file PRIMA della modifica. Fix: cancellare
    `tsconfig.tsbuildinfo` e rilanciare `tsc`. Non è un file di codice
    (già in `.gitignore`, `*.tsbuildinfo`), si rigenera da solo.
- **Freschezza visibile in home + link "Segnala un errore" — FATTO (Cowork,
  7 set 2026), commit `c353539`.** Delle due migliorie scelte da Yuri in
  coda all'analisi tecnica/estetica sopra, solo metà era davvero arrivata
  su disco: la pagina `/provincia/[slug]` aveva già la riga "Controllato
  MIMIT..." (props `checks` su `SourceNote`), ma la sezione "Carburanti in
  Italia, provincia per provincia" della home ne era rimasta priva, e il
  link nel footer non esisteva affatto — nonostante questo file si
  fermasse proprio prima di documentarli. Scoperto rileggendo il codice
  via bridge device (questa sessione Cowork non ha `device_bash`, quindi
  niente shell sul PC di Yuri: verifica fatta a occhio, non con `tsc`/
  `npm run lint`, eseguiti poi da Yuri prima del commit). Completato:
  - `src/app/page.tsx`: nuova `const mimitRun = fetchRuns.find((r) =>
    r.job === "fetch-mimit-prices")`, sullo stesso modello di
    `euFuelRun`/`usFuelRun`; passata come `checks` alla `SourceNote` della
    sezione MIMIT.
  - Stesso file, footer (colonna "Progetto"): nuova voce "Segnala un
    errore" → `${GITHUB_URL}/issues/new`, icona `Bug` di lucide-react
    accanto a "Codice sorgente" (`Code2`).
  - `src/components/SourceNote.tsx`: tolto dal commento un riferimento
    ormai falso a MIMIT come fonte "senza ancora un cron tracciato in
    fetch_runs" (lo è, dalla Fase 4/automazione cron di questa stessa
    sessione).

- **Migliorie dai feedback dei primi visitatori — FATTO (Cowork, 15 set
  2026).** Tre feedback reali (vedi project doc
  `mercuriale-riepilogo-15-set-2026-fonti-feedback-indice.md`): "poco
  comprensibile, più numeri grandi, richiami alle sezioni sotto", "lo terrò
  presente se scriverò di temi analoghi", "comprensibile, ma serve un colore
  in contrasto: dopo il primo scroll cala l'attenzione". Risposte:
  - `SectionNav.tsx`: indice 01–05 fisso in alto con sezione attiva
    (IntersectionObserver). Vive FUORI dall'header: l'`overflow-hidden`
    dell'header rompeva `sticky`.
  - Token `system-mark` (cremisi #a3163a) in `globals.css`: SOLO struttura
    (etichette numerate di `SectionHeading.tsx`, filo di `KeyFigure.tsx`),
    MAI su prezzi o variazioni — il rosso-ruggine `signal-up` significa
    "in salita". Tonalità 345° contro i 16° della ruggine.
  - `KeyFigure.tsx` + `src/lib/sectionHighlights.ts` (puro, testato): una
    cifra chiave in apertura di ogni sezione — Italia vs media dei 27,
    quota di imposte nella media, materia prima con la variazione più
    ampia, divario paese più caro/economico, divario provincia più
    cara/economica. Tutto da dati già calcolati; se manca un pezzo la cifra
    non compare.
  - `CiteBox.tsx` + `CopyButton.tsx`: "Come citare questi dati" in fondo
    alla home, citazione copiabile che nomina SEMPRE anche le fonti
    primarie.
  - `src/lib/site.ts` (`SITE_URL`): l'indirizzo del sito ora vive in un
    solo posto (layout, sitemap, robots, CiteBox). Col dominio
    personalizzato si cambia lì, più l'esempio in prosa in
    `metodologia/page.tsx`.
  - `/stato-dati`: il badge verde "ok" senza giudizio di freschezza è
    diventato "eseguito" (neutro); con giudizio dice "aggiornato"; legenda
    degli stati in pagina; MIMIT ha etichetta e badge di freschezza; il
    "dato più recente" mostra solo la data.

- **Blocco A delle migliorie di settembre — FATTO (Cowork, 15 set 2026).**
  - **Storico lungo nei grafici**: `PriceHistoryChart` ha un selettore di
    periodo (1 mese · 3 mesi · 1 anno · 5 anni · 10 anni, definiti in
    `src/lib/historyWindows.ts`). La home carica ancora solo la finestra
    iniziale (3 mesi materie prime, 1 mese carburanti); le altre arrivano
    da `GET /api/history?kind=commodities|fuel&window=…` SOLO al clic, e il
    componente le tiene in una cache in memoria. La route valida i
    parametri contro elenchi chiusi (400 altrimenti) e manda
    `Cache-Control: s-maxage=3600, stale-while-revalidate=86400`.
    Carburanti: `getFuelAverageHistory` fa la media per data NEL database
    (`avg()` + `GROUP BY`, ~1.000 righe invece di ~27.000). Oltre 260 punti
    per serie `downsampleSeries` raggruppa a blocchi (valore = media del
    blocco, data = ultimo giorno del blocco), e il grafico lo dichiara.
  - **Freschezza anche sui carburanti**: `FreshnessBadge.tsx` (condiviso con
    la tabella materie prime) nella colonna Data di `FuelPriceTable`; lo
    stato si calcola in `page.tsx` con `CONTINENT_SOURCES`. Le note più su
    che dicono "i carburanti non hanno ancora un badge" sono superate.

- **Blocco B — FATTO (Cowork, 15 set 2026).**
  - **Mappa delle province** (`ItalyProvinceMap.tsx`), accanto alla tabella
    nella sezione 05 (affiancate da `lg`). Confini in
    `public/geo/italy-provinces-2025.topo.json` (69 KB): limiti ISTAT
    CC-BY 4.0 via `guglielmo/geojson-italy`, release **2025-10-10**, solo
    livello province, semplificato con mapshaper (`-simplify 8%
    keep-shapes`, `quantization=1e4`). **NON aggiornarlo alla versione
    2026 senza controllare**: ISTAT 2026 ha già le nuove province sarde
    (Gallura, Ogliastra, Medio Campidano, Sulcis Iglesiente), mentre il
    MIMIT usa ancora le sigle 2016–2025 (`SU`). Con la 2025 le 107 sigle
    combaciano 1:1 (verificato il 15/9). Se un giorno il MIMIT cambia
    sigle, `provinces.ts` e questo file vanno aggiornati insieme.
  - **Scala di colore condivisa**: `src/lib/divergingColor.ts` (prima
    dentro `EuropeFuelMap.tsx`), usata da entrambe le mappe.
  - **Calcolatore nel tempo**: righe "Stesso pieno, un mese fa / un anno
    fa" in `FuelImpactCalculator`. I prezzi passati arrivano da
    `getFuelAverageHistory` (400 giorni) + `valueAtOrBefore`
    (`src/lib/pastValue.ts`: mai un dato successivo alla data, mai uno più
    vecchio di 10 giorni rispetto ad essa → altrimenti "—").
  - **Nomi italiani delle materie prime**: `src/lib/commodityNames.ts`,
    applicati a tabella e grafico (quindi anche alle cifre chiave e a
    "Maggiori variazioni"). Database, export CSV/JSON e `/api/data`
    restano con i nomi inglesi della fonte.

- **Blocco C — FATTO (Cowork, 15 set 2026, commit c4473e8).**
  - **Media UE ponderata**: tabella `eu_weighted_averages` (migrazione
    `0011`), unique su (fuel_type, recorded_at). La scrive
    `saveEuWeightedAverages` (INSERT a blocchi da 500 con upsert), dal
    cron del giovedì e da `backfill:eu-fuel`. Il parser è
    `parseEuWeightedAverages` in `euOilBulletinHistory.ts`: cerca
    `EU_price_with_tax_*` / `EU_price_wo_tax_*` (accetta anche `EU27_`).
    **`EUR_` è escluso apposta** (area euro, aggregato diverso). Se la
    colonna manca l'errore elenca le chiavi "EU*" trovate;
    `npm run inspect:eu-history -- --keys` stampa le chiavi non di paese.
  - Il cron scarica il file UNA volta (`downloadEuHistoryWorkbook`) e lo
    passa a entrambi i parser; la media ponderata ha un try/catch suo, i
    27 paesi non falliscono per lei. In home la query ha un `.catch` → [].
  - UI: riga "media UE ponderata sui consumi" sotto la barra della mappa
    (prezzo e quota fiscale; per l'accisa non c'è un dato UE), citata
    nella cifra chiave 01 e in metodologia. La scala dei colori resta
    centrata sulla "media dei 27".
  - **Layout a riquadri**: in cima, griglia `lg:grid-cols-3` (cosa è
    cambiato + maggiori variazioni a sinistra, numero del giorno alto a
    destra); sezioni 03 e 04 affiancate da `xl` (figli con `min-w-0` per
    non allargare la pagina con le tabelle). Effetto noto: con 03 e 04
    affiancate l'indice evidenzia 03 (vince la prima sezione visibile).
  - `taxSharePercent` esiste UNA volta sola (`europeFuelStats.ts`);
    `euWeightedAverage.ts` la riesporta.

- **Blocco D, parte 1 — confinanti (Cowork, 15 set 2026).** Riquadri
  "Italia e paesi UE confinanti" nella sezione 01 (`NeighbourTiles.tsx`,
  Server Component; logica in `italyVsNeighbours`,
  `ITALY_EU_NEIGHBOURS` = Francia, Austria, Slovenia). La Svizzera è
  arrivata nella parte 3 (sotto), con fonte e tabella proprie.

- **Blocco D, parte 2 — raccolta "Numeri" (Cowork, 15 set 2026).**
  `ANNUAL_FIGURES` in `annualFigures.ts`: 5 cifre (ADM accise 2024 +
  quattro Eurostat 2024: dipendenza energetica 57%, petrolio 67% delle
  importazioni di energia, imposte sull'energia 287 mld, merci su strada
  25,7% delle t-km). Valori copiati dai comunicati il 15/9, URL e mese di
  pubblicazione (`publishedIn`, AAAA-MM) in ogni voce. `figureOfTheDay`
  sceglie la cifra col giorno di **Roma** (non UTC) modulo il numero di
  cifre: stessa per tutti, cambia a mezzanotte italiana. Nuova fonte
  `eurostat` in `sources.ts`. Pagina statica `/numeri` (ancore = `id`),
  in sitemap e nei link di pagina; il riquadro in home porta a
  `/numeri#<id>`. **Manutenzione a mano**: ADM ogni primavera, Eurostat
  quando esce l'edizione con i dati 2025 (stessi mesi, un anno dopo).
  Il riquadro in home è in alto (niente `justify-center`: lasciava un
  grande vuoto su desktop); sotto, solo da `lg`, l'elenco "Nei prossimi
  giorni" (`otherFigures`, `shortLabel`, `formatFigureValueShort`).

- **Blocco D, parte 3 — Svizzera (Cowork, 15 set 2026).**
  - **Fonti** (verificate il 15/9 aprendo i file da un browser, perché
    dal cloud BFS e BCE rispondono 403):
    - BFS, tabella LIK "Durchschnittspreise für Energie und Treibstoffe",
      numero **su-d-05.02.91**, licenza OPEN-BY, mensile, CHF/L. L'id del
      file cambia a ogni uscita: si trova con l'API del catalogo
      `dam-api.bfs.admin.ch/hub/api/dam/assets?orderNr=su-d-05.02.91`
      (versione con `lifecycle.code = "CURRENT"`), si scarica da
      `/assets/<damId>/master`. Foglio "Monat - Mois": riga 5 prodotti
      ("Bleifrei 95 / sans plomb 95", "Diesel"), riga 6 unità ("1 l"),
      dalla 7 un mese per riga (data Excel, primo del mese); in fondo mesi
      futuri vuoti e "Quelle: LIK". Agosto 2026: 1,95 / 2,18 CHF.
    - BCE, serie `EXR.M.CHF.EUR.SP00.A` (media mensile, **franchi per 1
      euro**, agosto 2026 = 0,93619) da `data-api.ecb.europa.eu`, CSV.
      **Da CHF a euro si DIVIDE** (1,95 / 0,936 = 2,083 €): c'è un test.
  - **Tabella `swiss_fuel_prices`** (migrazione 0012), separata da
    `retail_fuel_prices` per non entrare nella "media dei 27". Salva CHF e
    cambio; l'euro si calcola in lettura (`src/lib/swissFuel.ts`).
    `recorded_at` = primo del mese.
  - **Fetcher** `src/lib/fetchers/swissFuelPrices.ts` (colonne cercate per
    nome, unità controllata, errore esplicito se cambia),
    `saveSwissFuelPrices.ts` (upsert; `coalesce` per non cancellare un
    cambio già salvato). **Cron** `fetch-ch-fuel-prices`, dal 1° al 10 di
    ogni mese alle 9 UTC, salva gli ultimi 3 mesi. **Backfill**
    `npm run backfill:ch-fuel` (con `--dry-run` stampa gli ultimi mesi).
  - Freschezza `bfs_lik`: 62 giorni + 10 di tolleranza (il dato di un mese
    resta il più recente fino ai primi giorni del mese dopo il successivo).
    In `/stato-dati` ha etichetta e badge.
  - **UI**: quinto riquadro in `NeighbourTiles` (etichetta "mensile",
    prezzo in €, differenza con l'Italia, CHF e mese), nota sotto che il
    confronto è indicativo; fonti BFS e BCE nella nota della sezione 01;
    paragrafo in metodologia. Home: query con `.catch` → [].

- **Soglie di freschezza delle materie prime corrette (Cowork, 15 set
  2026, sera).** Yuri vedeva cotone & co. "non aggiornati". Controllo:
  - **Pipeline OK**: i cron Alpha Vantage girano, e il dato in database
    coincide con l'ultimo alla fonte (interrogata Alpha Vantage per tutte
    e 7 le mensili: ultimo mese **luglio 2026**, stessi valori del sito).
  - **Fonti vere** (dalla documentazione Alpha Vantage): petrolio e gas =
    EIA via FRED; metalli e agricole = FMI (IMF) "Global price of …" via
    FRED. L'EIA pubblica i prezzi spot giornalieri **una volta a
    settimana** (release 10/9 con dati al 9/9, la successiva il 16/9);
    l'FMI pubblica medie mensili con **circa due mesi** di ritardo.
  - **Il problema era la soglia**, non il dato: energia 1+3 giorni e
    mensili 30+10 segnavano "non aggiornato" serie allineate alla fonte.
    Ora energia **8+4**, mensili **80+15** (`freshness/config.ts`, con la
    verifica nel commento). Testi allineati in metodologia, glossario e
    nota "Fonte" della sezione 03.
  - Lezione: prima di toccare una soglia, confrontare l'ultimo dato in
    database con l'ultimo **alla fonte**; se coincidono, il problema è la
    soglia (o il testo), non la pipeline.
  - Dal cloud Alpha Vantage, EIA, BFS e BCE rispondono 403: per
    verificarle si usa il browser (Claude in Chrome).

- **Cron UE ogni giorno (Cowork, 15 set 2026, sera).** `fetch-eu-fuel-prices`
  passa da `0 12 * * 4` (solo giovedì) a **`0 15 * * *`**: il bollettino
  esce di norma il giovedì ma può slittare, e con un solo tentativo
  settimanale un giorno di ritardo diventava una settimana di dato vecchio
  (stesso motivo del cron USA). Negli altri giorni l'upsert riscrive la
  stessa settimana: nessuna riga nuova, nessuna correzione registrata, e
  la narrazione settimanale fa upsert su (settimana, tipo). Testi
  "controllato ogni giorno" in home, `/paese/[slug]` e metodologia. Le note
  più vecchie in questo file che parlano del "cron del giovedì" sono
  storiche.
- **Recensione del 16 set 2026 → contrasto, mappe, home divisa in pagine
  (Cowork).** Un visitatore ha segnalato: poco contrasto fra testo e
  sfondo, font faticosi, mappe che "saltano" al passaggio del mouse,
  troppo testo in una pagina sola (suggerendo più route).
  - **Contrasto (WCAG AA verificato con la formula)**: `ink-muted` da
    #8b8371 (3,5:1 su sfondo, 3,2 sui pannelli, usato in 66 punti) a
    **#6f6857** (5,1 / 5,5 / 4,7); `signal-wait` da #8a6f28 a **#7a6122**.
    Chi tocca questi token ricontrolli il rapporto su `panel`, il fondo
    più scuro. `SourceNote` in testo normale, non più maiuscolo monospace
    (frasi lunghe); il monospace maiuscolo resta per etichette corte.
  - **Mappe**: il riquadro sopra la mappa delle province aveva solo
    un'altezza minima e passava da una a due righe al passaggio del mouse,
    spingendo giù la mappa. Ora `h-14` fisso e sempre due righe
    `truncate`. Il tooltip della mappa europea (sovrapposto, non sposta il
    layout) ha larghezza fissa `w-60`.
  - **Home divisa in pagine** (`src/lib/siteNav.ts` = elenco unico):
    `/europa` (ex 01 mappa + ex 04 tabelle/grafico, numerate 01·A/01·B),
    `/calcolatore` (02), `/materie-prime` (03), `/italia` (04, ex 05).
    La home (`/`) è una **panoramica**: fascia valori, sintesi
    (`components/sections/SummaryBand.tsx`) e quattro
    `components/site/SectionPreview.tsx` con una cifra e il link.
  - **Dati**: `src/lib/dashboard.ts` con porzioni per pagina
    (`loadFuel`, `loadCommodities`, `loadItaly`, `loadCalculator`,
    `loadSummary`), avvolte in `cache()` di React così che la home, che ne
    usa diverse, non ripeta le query nella stessa richiesta. Le finestre
    temporali si calcolano DENTRO le funzioni in cache (due `new Date()`
    come argomenti non sarebbero mai uguali). `getNow()` = un solo
    "adesso" per richiesta.
  - **Cornice comune**: `components/site/PageShell.tsx` (header + barra +
    contenuto + "Come citare" + footer), `SiteHeader.tsx`, `SiteFooter.tsx`.
    `SectionNav` non fa più scrollspy: evidenzia la PAGINA con
    `usePathname` (`aria-current="page"`). `MobileNav` non ha più props,
    legge `siteNav.ts`.
  - Link di ritorno: `/paese/[slug]` → `/europa`, `/provincia/[slug]` →
    `/italia`. Le nuove pagine sono in sitemap. Le vecchie ancore
    (`/#mappa`, `/#province`...) ora portano alla panoramica, senza errore.
  - Verifica visiva fatta su una pagina di prova con dati finti (le pagine
    vere richiedono il database): desktop 1400 px e mobile 400 px.

- **Quando cambiano le date in home** (risposta data a Yuri il 15/9):
  petrolio e gas dopo ogni release settimanale EIA (di solito mercoledì);
  materie prime mensili quando l'FMI pubblica il mese successivo (la data
  mostrata è il primo del mese = media di quel mese); carburanti UE di
  norma il giovedì; USA a inizio settimana; MIMIT ogni giorno; Svizzera
  nei primi giorni del mese.

- **Traffico marittimo nei passaggi obbligati — FATTO (24 set 2026):
  backend e UI in produzione, PR drakekluser99/Mercuriale#11–#20, tre
  passaggi (Hormuz, Bab el-Mandeb, Suez).** Resta aperta solo la capacità
  (vedi "STATO" in fondo alla voce). Punto 3 della
  roadmap del 23/9 (`docs/`
  non contiene la roadmap: è stata passata come allegato in chat).
  - **Fonte**: IMF PortWatch, "Daily Chokepoint Transit Calls and Trade
    Volume Estimates", servizio ArcGIS REST in JSON
    (`services9.arcgis.com/weJ1QsnbMYJlCHdG/.../Daily_Chokepoints_Data/FeatureServer/0/query`),
    max 1000 righe per chiamata. Pubblica una volta a settimana (di norma
    il martedì, può slittare) righe GIORNALIERE. Il 24/9 il dato più
    recente era del 20/9. **Dal cloud di Claude `services9.arcgis.com` è
    bloccato**: la verifica si fa dal PC con lo script sotto.
  - **Passaggi seguiti** (`CHOKEPOINTS` in `src/lib/fetchers/portwatch.ts`):
    `hormuz` = portid `chokepoint6` / portname "Strait of Hormuz";
    `bab_el_mandeb` = `chokepoint4` / "Bab el-Mandeb Strait"; dal 24/9
    anche `suez` = `chokepoint1` / "Suez Canal" (vedi la voce Suez sotto
    "STATO"). Filtro con `=` sul nome esatto
    (non `LIKE`) e controllo incrociato del `portid`.
  - **Tabella `chokepoint_transits`** (migrazione `0013`): `chokepoint`,
    `recorded_at` (timestamp a mezzanotte UTC, non `date`: coerenza con le
    altre tabelle e con chi le legge), `transit_calls` (= `n_total`),
    `trade_volume_est` (= `capacity`, nullable), `retrieved_at`,
    `fetch_run_id` (nullable, FK verso `fetch_runs` — prima tabella dati ad
    averla), `source` = "imf_portwatch". Unique su
    `(chokepoint, recorded_at)`. Non scrive in `data_corrections`.
  - **Cron `fetch-chokepoint-transits`**, ogni giorno alle 15 UTC (stesso
    motivo del cron UE: con un tentativo settimanale uno slittamento
    costerebbe una settimana), `maxDuration` 10. Chiede le 60 righe più
    recenti per passaggio e fa upsert. La logica sta in
    `runChokepointTransitsJob.ts`, condivisa con
    `npm run inspect:portwatch` (senza argomenti: stampa una riga grezza e
    il risultato del parser, niente DB; `-- --save`: esegue il cron vero,
    riga in `fetch_runs` compresa). Nessun ripiego: risposta vuota, errore
    ArcGIS a HTTP 200, campo mancante, passaggio diverso, giorno ripetuto,
    `n_total` non intero, data non "AAAA-MM-GG" o incoerente con
    `year`/`month`/`day` → il run si ferma senza scrivere. Test in
    `portwatch.test.ts`.
  - **Verifica del 24/9 (Yuri, dal PC)**: campo `date` confermato stringa
    "AAAA-MM-GG" (`esriFieldTypeDateOnly`). `--save`: `fetch_runs` id 170,
    `ok: true`, `points_saved: 120` (2 × 60), `latest_recorded_at`
    2026-09-20, durata 1,5 s; in tabella 60 righe per passaggio dal
    2026-07-23 al 2026-09-20. Totali coerenti nelle righe grezze
    (`n_cargo + n_tanker = n_total`).
  - **Hormuz a 1–7 transiti al giorno è REALE, non un guasto della fonte.**
    Lo Stretto è di fatto chiuso al traffico commerciale dal 28/02/2026 per
    il conflitto in corso; Yuri l'ha verificato su fonti esterne che
    riportano gli stessi dati PortWatch (8 transiti il 13/9, 1 il 20/9).
    Non indagare di nuovo.
  - **`capacity = 0` con `transit_calls > 0`** (es. Hormuz 14/9: 2 navi,
    capacità 0) = stima NON disponibile, non capacità nulla. Nel database
    resta il dato grezzo della fonte; **in UI va mostrato come "stima non
    disponibile"**, non come zero.
  - **Backfill — FATTO (24 set 2026).** `npm run backfill:chokepoints`
    (`scripts/backfill-chokepoints.ts`): senza argomenti solo lettura
    (righe ricevute contro `returnCountOnly` della fonte, buchi nel
    calendario, medie mensili; `--around AAAA-MM-GG --weeks N` per i
    giorni attorno a una data; `--only <chiave>`); `--save` scrive con lo
    stesso upsert del cron e si RIFIUTA se il calendario ha buchi, salvo
    `--accept-gaps` dopo aver verificato che siano dichiarati da PortWatch.
    Paginazione in `fetchChokepointHistory` (`portwatch.ts`): pagine da
    1000 in ordine crescente con `resultOffset`, stesso parser del cron,
    stop su giorno ripetuto fra pagine. Esito: **2.820 righe per
    passaggio, 01/01/2019 → 20/09/2026, nessun giorno mancante**; 11 giorni
    di Hormuz con capacità 0. `saveChokepointTransits` fa `coalesce` su
    `fetch_run_id`: il backfill (senza run) non cancella l'id del cron.
  - **Baseline del "traffico normale" — FISSATE (24 set 2026)** in
    `CHOKEPOINT_BASELINES` (`src/lib/chokepointHistory.ts`, commento con
    tutte le motivazioni), calcolate dai dati giornalieri con
    `seasonalBaseline`/`flatBaseline` (media sui singoli giorni; si
    fermano se manca un giorno). **Numeri fissi, non ricalcolati a ogni
    richiesta**: il riferimento dichiarato in metodologia non deve cambiare
    se la fonte rivede lo storico. `npm run chokepoint:baselines`
    (`scripts/chokepoint-baselines.ts`, sola lettura) ricalcola e dice se
    coincidono ancora con la costante. `baselineFor(baseline, data)` dà il
    valore da usare per un giorno.
    - **Hormuz — stagionale**, 01/11/2022–31/10/2025 (1.096 giorni), un
      valore per mese: gen 73,14 · feb 77,80 · mar 88,28 · apr 99,98 ·
      mag 103,85 · giu 103,04 · lug 99,67 · ago 97,17 · set 98,10 ·
      ott 91,55 · nov 81,62 · dic 74,88. Stagionale perché il traffico ha
      un ciclo annuale netto (inverno ~73–78, aprile–settembre ~97–104).
      Esclusi il 2019–2021 (livello più basso) e l'inverno 2025-26, il più
      basso dal 2019: stato ambiguo, forse un primo segnale della crisi.
      **Rottura 01/03/2026**, nessun calo anticipato a febbraio.
    - **Bab el-Mandeb — piatta**, 16/12/2022–15/12/2023 (365 giorni),
      **74,80**: "l'anno che precede la rottura". Nessun ciclo annuale,
      ma crescita lenta dal 2019: gli anni vecchi abbasserebbero il
      riferimento. **Rottura 16/12/2023**; il 19/11/2023 (59) è un giorno
      isolato, non l'inizio del calo.
    - Al 14–20/9/2026: Hormuz 3,14 transiti/giorno (−96,8% sulla baseline
      di settembre), Bab el-Mandeb 24,71 (−67,0%). Anche Bab el-Mandeb è
      sceso ad agosto–settembre 2026 (27,4 e 25,9 di media, contro 31–37
      del 2024–2026): osservato, non interpretato.
  - **Stati del traffico — FISSATI (24 set 2026)**: tre stati con nome
    (`transitState`, `TRANSIT_STATE_LABELS` in `chokepointHistory.ts`),
    NON una scala continua: il verde nel sito vuol dire "sotto la media",
    e per i prezzi si legge come buona notizia — un passaggio chiuso in
    verde direbbe il contrario del vero. Colori previsti: normale =
    neutro, ridotto = ocra (`signal-wait`), fortemente ridotto = ruggine
    (`signal-up`), sempre con l'etichetta scritta. Si confronta la **media
    degli ultimi 7 giorni** con la baseline del giorno finale
    (`rollingDeviations`): il singolo giorno oscilla troppo.
    - **"ridotto"** sotto il **5° percentile** dello scostamento nel
      periodo di riferimento, per passaggio (`reducedBelowPct`): Hormuz
      **−15,6%**, Bab el-Mandeb **−8,1%** (Hormuz oscilla il doppio).
      Circa una settimana normale su venti risulta "ridotto": accettato.
    - **"fortemente ridotto"** sotto **−40%**, comune
      (`STRONGLY_REDUCED_BELOW_PCT`): sotto ogni settimana normale di
      entrambi (peggiore −31,4% a Hormuz), sopra quasi tutte quelle dopo
      le rotture. Non −50%: Bab el-Mandeb dal 2024 sta attorno a −55% con
      ~10% delle settimane sopra −50%, lo stato cambierebbe di continuo.
    - Nessuno stato "aumentato" (anche +15% è oscillazione normale).
      `npm run chokepoint:baselines` stampa percentili e conteggio per
      stato di ogni periodo.
    - **Verificato sui dati il 24/9 (Yuri, dal PC)**. Periodo di
      riferimento: Hormuz normale 1.035 / ridotto 55 (5,0%) / fortemente
      0; Bab el-Mandeb 338 / 21 (5,8% — l'arrotondamento a −8,1 sposta 3
      finestre) / 0. Dopo le rotture: Hormuz 198 su 198 fortemente
      ridotto; Bab el-Mandeb 981 fortemente (97,7%) e 23 ridotto (la
      transizione di fine 2023). Settimana 14–20/9/2026: entrambi
      fortemente ridotto (Hormuz −96,8%, Bab el-Mandeb −67,0%).
  - **Registri — FATTO (24 set 2026)**: fonte `imf-portwatch` (primaria)
    in `sources.ts`; freschezza `imf_portwatch` **9 + 4 giorni** (dati
    giornalieri pubblicati il martedì fino alla domenica prima: subito
    prima dell'uscita successiva il dato ha ~9 giorni); `/stato-dati` ha
    etichetta e badge per `fetch-chokepoint-transits`.
  - **STATO (fine sessione 24 set 2026)**.
    - **Tutto in `main` / produzione**: backend (PR
      drakekluser99/Mercuriale#11, #12, #13), schede (#14), grafico (#15),
      mappa (#16), home (#17), metodologia (#18), fonti in metodologia
      (#19), Suez (#20). La UI è COMPLETA: i cinque passi qui sotto sono
      tutti fatti e restano come registro delle scelte. Verificato da Yuri
      il 24/9 con `npm run chokepoint:baselines`: tutte e tre le baseline
      coincidono con la costante.
    - **Carico stimato nelle schede (24 set 2026, sera, PR
      drakekluser99/Mercuriale#23, in `main`)**. Unità del
      campo `capacity`: **tonnellate metriche di carico** (stima), non la
      portata delle navi. Verifica, con il CSV completo scaricato da Yuri
      da PortWatch (`Daily_Chokepoints_Data.csv`, 78.960 righe; la pagina
      "Data & Methodology" non dava la definizione in chiaro):
      - `capacity` = `capacity_cargo` + `capacity_tanker` in tutte le
        righe; le fonti secondarie (OpenBB, scheda del dataset nei
        risultati di ricerca) parlano di "trade volume in metric tons";
      - 2023, cisterne a Hormuz: 2,69 milioni di t al giorno, in linea con
        i ~20 milioni di barili/giorno di petrolio dell'EIA (× 0,136 t/bbl
        ≈ 2,7). Come portata (deadweight) il valore sarebbe molto più alto:
        conterebbe anche le cisterne che entrano vuote nel Golfo. Totali
        2023: Suez 1,22 miliardi di t, Bab el-Mandeb 1,23, Hormuz 1,35.
      UI: in `ChokepointCard` il carico sta nella riga "Ultimo dato",
      accanto alle navi DELLO STESSO GIORNO (è giornaliero: vicino alla
      media dei 7 giorni si leggerebbe come media); `not_available` →
      "carico: stima non disponibile", campo vuoto → niente. Nuovo
      `formatTonnes` in `format.ts` (milioni con un decimale, poi "mila t",
      poi "t"; soglie a 999.500 e 999,5 per non stampare "1.000 mila t").
      Paragrafo "Il carico stimato" in `ShippingMethodology.tsx` al posto
      di "La capacità stimata".
    - **Suez — FATTO (24 set 2026, sera), in `main` con la PR
      drakekluser99/Mercuriale#20 (Preview verificata da Yuri).**
      - **Dati**: `suez` in `CHOKEPOINTS` (`chokepoint1`, "Suez Canal").
        Backfill fatto da Yuri: 2.820 righe dal 2019-01-01 al 2026-09-20,
        calendario continuo, nessun giorno con capacità 0.
      - **Normale**: PIATTA, 23/12/2022 – 22/12/2023, **73,98**; soglia di
        "ridotto" **−7,7%** (p5 su 359 finestre). Rottura **23/12/2023**,
        una settimana dopo Bab el-Mandeb (dal 16 al 22/12 ancora 69-91). Il
        candidato provvisorio con le date di Bab el-Mandeb dava 73,81 e
        −7,5%: spostato per applicare la stessa regola ("l'anno che precede
        la rottura DEL passaggio"). Motivazioni nel commento di
        `CHOKEPOINT_BASELINES`. Esito: periodo 342 normale / 17 ridotto;
        dopo la rottura 942 fortemente ridotto / 55 ridotto (5,5%) / 0
        normale; settimana 14–20/9/2026 −43,4%.
      - **Limite dichiarato in metodologia, soglia NON cambiata**: dal 2024
        Suez sta attorno a −46% (p95 dopo la rottura −39,8%), quindi circa
        una settimana su venti è "ridotto" invece di "fortemente ridotto".
        La soglia comune −40% resta (decisione di Yuri).
      - **UI**: nomi "Canale di Suez" / "Suez"; mappa con `COORDINATES`
        [32.3, 30.6] (Ismailia) e etichetta SOPRA. Con tre passaggi
        l'etichetta di Hormuz è passata a `belowLeft` (sotto, allineata a
        destra): a sinistra la sua seconda riga finiva sotto il punto di
        Suez e si leggeva come sua. Schede `lg:grid-cols-3`; pulsanti del
        grafico con `CHOKEPOINT_SHORT_NAMES` (prima tagliavano "Stretto di "
        dal nome lungo). Testi aggiornati in pagina, home, metodologia.
      - `npm run chokepoint:baselines` senza argomenti verifica ora anche
        Suez (le due baseline piatte sono un ciclo unico); la modalità
        `--candidate` resta per il prossimo passaggio da aggiungere.
      - Il backfill di Suez è stato fatto dal branch, prima del merge:
        per questo le sue righe fino al 20/9 non hanno `fetch_run_id`. Il
        cron lo salva dal primo run dopo il merge.
    - **Decisioni già prese da Yuri, da NON ridiscutere**: baseline
      (Hormuz stagionale variante B, Bab el-Mandeb piatta), tre stati con
      nome e colori neutro / ocra / ruggine, soglie p5 per passaggio e
      −40% comune, freschezza 9 + 4, sesta cella nella fascia della home
      (non una sostituzione), mappa REGIONALE Italia–Golfo e non un
      planisfero, `capacity = 0` con transiti = "stima non disponibile".
    - **Passi della UI, uno alla volta con verifica di Yuri fra l'uno e
      l'altro** (impostazione approvata il 24/9; tutti FATTI, PR #14–#18):
      1. **Pagina `/traffico-marittimo`, sezione 05** "Traffico
         marittimo": voce in `SECTION_PAGES` (`siteNav.ts`) + icona
         (`Ship` di lucide) nelle mappe `ICONS` di `SectionNav.tsx` e
         `MobileNav.tsx`; `loadShipping` in `dashboard.ts` (con `cache()`
         e `.catch → []` come le tabelle accessorie) + query in
         `queries.ts`; `KeyFigure` sulla situazione; una scheda per
         passaggio (media 7 giorni, normale, scostamento, stato, data
         dell'ultimo dato, capacità); `SourceNote` con
         `sources={["imf-portwatch"]}` e `checks` del job
         `fetch-chokepoint-transits`.
      2. **Grafico**: componente nuovo, transiti con il Brent SOTTO,
         stesso periodo con un unico selettore e asse del tempo
         condiviso, linea tratteggiata del "normale" sui transiti.
         `/api/history` impara `kind=chokepoints`. Il nesso col Brent si
         mostra, non si afferma.
      3. **Mappa** regionale (Mediterraneo, Suez, Mar Rosso, Golfo) con
         `Marker` di react-simple-maps sullo stesso atlante 50m di
         `EuropeFuelMap`; punti col nome e lo scostamento scritti
         accanto (il colore non è mai l'unico veicolo).
      4. **Home**: sesta cella in `TickerBand` (`lg:grid-cols-6`), es.
         "Hormuz · 3 navi/g" con sotto "normale 98 · −97%"; quinta
         `SectionPreview`.
      5. **Metodologia**: fonte (stima da segnali AIS, non un registro),
         metodi e periodi delle baseline, date di rottura, soglie,
         trattamento di `capacity = 0`.
    - **Pagina `/traffico-marittimo` (passo 1, 24 set 2026)**:
      - `src/lib/chokepointStatus.ts` (puro, testato): `summarizeChokepoint`
        = media degli ultimi 7 giorni fino all'ultimo dato pubblicato,
        contro `baselineFor` del giorno finale, e stato. Se manca anche un
        giorno della finestra la media NON si calcola (la scheda lo dice).
        `capacityReading` distingue valore / "stima non disponibile"
        (0 con navi transitate) / campo vuoto. `furthestFromNormal`
        sceglie il passaggio della cifra chiave.
      - `getRecentChokepointTransits(since)` in `queries.ts` (date già
        "AAAA-MM-GG", capacità già numero); `loadShipping` in
        `dashboard.ts` (30 giorni, `.catch → []`, freschezza
        `imf_portwatch`, run `fetch-chokepoint-transits`).
      - `components/ChokepointCard.tsx` (scheda) e
        `components/sections/ShippingSection.tsx` (cifra chiave, testo,
        schede, `SourceNote` con le soglie lette dalle costanti — non
        scritte a mano). La sezione è separata dalla pagina apposta: si
        rende con dati finti per la verifica visiva.
      - Cifra chiave in tono NEUTRO (il verde "in discesa" direbbe una
        buona notizia); scostamento in inchiostro, colore solo
        sull'etichetta di stato.
      - **Capacità NON mostrata** al passo 1 (unità non confermata).
        Superato la sera del 24/9: vedi "Carico stimato nelle schede".
      - Nuovi formatter in `format.ts`: `formatDecimal`, `formatIsoDay`
        (giorno ISO → gg/mm/aaaa senza passare da `Date`, niente fuso).
      - `CiteBox`: la citazione nomina anche IMF PortWatch.
      - Sitemap, footer, barra e menu mobile prendono la pagina da
        `SECTION_PAGES` da soli.
    - **Grafico transiti + Brent (passo 2, 24 set 2026)**:
      - `src/lib/shippingChart.ts` (puro, testato): `buildShippingChart`
        produce UN elenco di punti per giorno con transiti, normale e
        Brent insieme. I due grafici leggono lo stesso elenco, quindi
        l'asse del tempo coincide per costruzione e il tooltip
        sincronizzato (`syncId`, per posizione) indica lo stesso giorno.
        Transiti = media mobile a 7 giorni (null se manca un giorno: la
        linea si interrompe, `connectNulls={false}`); normale =
        `baselineFor`; Brent = valore del giorno (null nei fine
        settimana, qui sì `connectNulls`). Sopra 260 giorni blocchi con
        la media dei valori presenti. Se lo storico dei transiti comincia
        dopo il periodo chiesto (10 anni, PortWatch dal 2019) il grafico
        parte dal primo transito (`startsLate`), invece di mostrare anni
        di Brent e di "normale" senza traffico sotto.
      - Due grafici impilati e non due assi Y: con due scale sovrapposte
        la posizione relativa delle linee la deciderebbero i limiti degli
        assi. Sotto il grafico: "mostra i due andamenti, non dice che uno
        dipenda dall'altro".
      - `src/lib/shippingChartData.ts` (`loadShippingChart`): unica
        funzione per pagina (periodo iniziale `1a`, costante
        `SHIPPING_CHART_INITIAL_WINDOW` in `dashboard.ts`) e
        `/api/history?kind=chokepoints` (risposta `{ window,
        chokepoints }`). Legge i transiti da 6 giorni prima dell'inizio
        del periodo, per la media del primo giorno. Nuova query
        `getCommoditySymbolHistory(symbol, since)`.
      - `components/ShippingHistoryChart.tsx` (client) e
        `components/HistoryWindowSelector.tsx`, estratto da
        `PriceHistoryChart` e ora condiviso dai due grafici.
      - Nota "Fonte" della sezione: aggiunto Alpha Vantage per il Brent.
    - **Mappa regionale (passo 3, 24 set 2026)**: `components/ChokepointMap.tsx`,
      fra il testo introduttivo e le schede ("prima DOVE, poi i numeri").
      - Proiezione `geoAzimuthalEqualArea`, centro 30°E / 27°N, scala
        720, viewBox 800×540: dall'Italia (contorno ambra, come nella
        mappa d'Europa) al Golfo di Aden, Hormuz a destra.
      - Un `Marker` per passaggio (coordinate approssimate al decimo di
        grado in `COORDINATES`), colore per stato (neutro / ocra /
        ruggine, grigio per "dati incompleti") e accanto, SCRITTI, nome,
        scostamento e stato: il colore non è mai l'unico veicolo.
        Etichette con alone chiaro (`paint-order: stroke`); Hormuz a
        sinistra del punto, Bab el-Mandeb sotto (a destra usciva dal
        riquadro). Per il numero la classe `font-mono` e non una var()
        scritta a mano (usciva in Courier).
      - **Italia disegnata per ultima** (anche in `EuropeFuelMap`): in
        SVG vince l'ultimo elemento disegnato, e i bordi bianchi di
        Svizzera, Austria, Slovenia coprivano il contorno ambra sui confini
        di terra (visto da Yuri sulla Preview). Nella mappa d'Europa NON si
        porta in cima anche il paese sotto il mouse: spostarlo nel DOM
        farebbe perdere il focus da tastiera.
      - **Telefono**: le dimensioni del testo SVG sono in unità della mappa
        e sotto `sm` si rimpiccioliscono di più della metà. Lì il nome si
        ingrandisce (`max-sm:text-[46px]`), la seconda riga sparisce e
        scostamento e stato vanno in un elenco sotto la mappa (`sm:hidden`),
        con nome e scostamento che non si spezzano mai a metà.
      - Niente zoom né tooltip: i numeri sono nelle schede. SVG
        `aria-hidden`, descrizione nell'`aria-label` del contenitore;
        larghezza massima `max-w-3xl` perché il testo SVG cresce con la
        mappa.
      - `src/lib/geo.ts` (`WORLD_ATLAS_50M_URL`): l'atlante ora è una
        costante condivisa con `EuropeFuelMap`.
      - Dal cloud jsdelivr è bloccato: per gli screenshot si scarica
        `world-atlas@2` con `npm pack` e Playwright lo serve con
        `page.route` al posto dell'URL della CDN.
    - **Home (passo 4, 24 set 2026)**:
      - Sesta cella in `TickerBand` (`lg:grid-cols-6`; su telefono tre
        righe da due), dopo "Diesel UE": etichetta = nome breve del
        passaggio più lontano dal normale (`furthestFromNormal`), valore
        = media 7 giorni in "navi/g", nota "normale 98 · −97%" in tono
        NEUTRO. Nessun `href`: la fascia diventa cliccabile solo per
        segnalare un problema (regola di `TickerStat.href`); il link sta
        nell'anteprima. A 1024 px la data di "Ultimo dato" va a capo.
      - "Fonti in linea" conta anche `imf_portwatch` (in linea se almeno
        un passaggio non è `non_aggiornato`).
      - Quinta `SectionPreview` a tutta larghezza (`md:col-span-2`, da
        sola a metà riga sarebbe sembrata un buco), scostamento come
        cifra in tono neutro. Intro della home con IMF PortWatch fra le
        fonti.
      - `loadShipping` non legge più il grafico: il grafico ha la sua
        `loadShippingChartInitial`, usata solo da /traffico-marittimo,
        così la home non fa a ogni visita la query di un anno.
      - `CHOKEPOINT_SHORT_NAMES` in `chokepointStatus.ts` (prima dentro
        la mappa), condiviso da mappa e fascia.
    - **Metodologia (passo 5, 24 set 2026)**: sezione 04 "Traffico
      marittimo" in `/metodologia` (ancora `#traffico-marittimo`, linkata
      dalla nota Fonte della pagina; "Codice sorgente" e "API pubblica"
      passate a 05 e 06), testo in
      `components/methodology/ShippingMethodology.tsx`. Periodi, rotture,
      valori mensili del normale e soglie sono LETTI da
      `CHOKEPOINT_BASELINES` e `STRONGLY_REDUCED_BELOW_PCT`, non scritti a
      mano; le motivazioni sono prosa e vanno riviste se cambiano i
      periodi. Aggiunti anche la scheda fonte IMF PortWatch e i 9 giorni
      di cadenza in "Frequenza di aggiornamento". I dodici mesi di Hormuz
      sono una griglia (6 per riga sul telefono), non una tabella che
      scorreva di lato.
    - **Verifica visiva**: dal cloud il database non si raggiunge, quindi
      pagina di prova con dati finti a 1.400 e 400 px, screenshot a Yuri
      prima del push; verifica sui dati veri sulla Preview.

- **Fonti in metodologia complete (24 set 2026, sera).** L'elenco "Fonti
  dei dati" di `/metodologia` aveva solo Alpha Vantage, Commissione, EIA,
  ADM (e PortWatch dal passo 5): mancavano MIMIT, BFS, BCE ed Eurostat,
  già citate nelle note "Fonte" del sito. Ora ci sono tutte e nove,
  ordinate per argomento (carburanti, materie prime, traffico, cifre
  annuali), con cosa forniscono, licenza dove nota, cadenza. Corrette
  nello stesso giro due schede imprecise: Alpha Vantage ("aggregati da
  mercati finanziari") ora dice che rilancia EIA e FMI; ADM non è più
  "il numero del giorno" ma una delle cifre della raccolta `/numeri`. In
  "Frequenza di aggiornamento" aggiunti MIMIT (1 giorno), PortWatch e
  Svizzera fra i controlli automatici. **Regola**: chi aggiunge una fonte
  a `src/lib/sources.ts` aggiunge anche la sua scheda qui (commento in
  testa all'elenco).

- **CI rifatta (24 set 2026).** `.github/workflows/ci.yml`, caricato da
  Yuri via GitHub web (dal cloud la cartella `.github/workflows` richiede
  un permesso del token che la sessione non ha), e cancellato il vecchio
  `ci.yml` nella radice, mai eseguito. Parte a ogni push su `main` e a ogni
  PR verso `main`; `concurrency` annulla il run vecchio se arriva un push
  nuovo sullo stesso ref. Passi: `npm ci` → **`npx next typegen`** →
  `npx tsc --noEmit` → `npm run lint` → `npm test`, Node 22.
  **`next typegen` non è opzionale**: su una copia pulita (CI, container
  nuovo) `tsc` fallisce con "Cannot find name 'LayoutProps'" perché
  quei tipi li genera solo Next (`next dev`/`build`/`typegen`); sul PC
  non si vede perché `npm run dev` li ha già generati. La vecchia CI
  (Node 20, senza typegen né test) sarebbe fallita lì. Nessun segreto
  necessario: i test sono solo su funzioni pure.
  **Ruleset "Proteggi main" attivo (24 set 2026, creato da Yuri)**, in
  Settings → Rules → Rulesets, target = branch predefinito: blocca
  cancellazione e force push e **richiede il check `check` (GitHub
  Actions) verde** prima che `main` si aggiorni — una PR rossa non si
  fonde, nemmeno da Claude. Bypass: "Repository admin, Always allow", così
  Yuri può ancora fare commit diretti su `main` dal sito spuntando "Bypass
  rules". Volutamente SPENTI: "Require a pull request" (con approvazioni
  obbligatorie Yuri si bloccherebbe da solo: GitHub non fa approvare le
  proprie PR) e "Require branches to be up to date" (costringerebbe a
  riaggiornare ogni PR aperta a ogni avanzamento di `main`). Se si rinomina
  il job in `ci.yml`, va aggiornato anche il nome del check nel ruleset,
  altrimenti ogni PR resta in attesa di un controllo che non arriva più.

- **Ricognizione ISTAT, prezzi al consumo NIC (24 set 2026) — SOLO
  ricognizione: nessuno schema, nessun cron, nessun codice.** Base per una
  futura sezione sull'inflazione e per il paniere alimentare.
  - **Limite di velocità ISTAT: 5 query al minuto per IP, superarlo
    blocca l'IP per 1-2 GIORNI.** Regole seguite e da seguire: una query
    per volta, lette prima di scrivere la successiva, mai tentativi in
    serie per "provare", preferire i metadati alle query sui dati, e al
    primo segnale di blocco (429, "Too many requests") fermarsi senza
    riprovare.
  - **Dal cloud ISTAT non si raggiunge**: `esploradati.istat.it` e
    `sdmx.istat.it` danno 403 dal proxy del container. Scelta di Yuri: NON
    aprire i domini nell'ambiente cloud, perché l'IP di uscita è forse
    condiviso e non sappiamo quante query stia già facendo. Le query le
    lancia Yuri dal PC (`curl.exe -sS -o file.xml "…"` in PowerShell,
    poi `Get-Content file.xml -TotalCount 5` per controllare che sia XML e
    non un errore) e carica il file in chat. Il cron su Vercel esce da
    altri IP: non è toccato da nessuna delle due scelte.
  - **Host**: `https://esploradati.istat.it/SDMXWS/rest/`, NSI Web Service
    v9.11, SDMX 2.1. `sdmx.istat.it` non interrogato.
  - **Dataflow** (agenzia `IT1`, versione `1.0`, stessa struttura
    `DCSP_NIC1B2025`; da gennaio 2026 base **2025=100** ed **ECOICOP v2**,
    13 divisioni, note ISTAT del 4 e 23 feb 2026):
    - `167_745_DF_DCSP_NIC1B2025_1` "Principali dati": indice generale e
      divisioni ECOICOP;
    - `167_745_DF_DCSP_NIC1B2025_2` "Tipologie di prodotto": aggregati
      speciali (`ENRGY`, `FOODHPC`, …). Gli aggregati chiesti a `_1` non
      restituiscono niente, senza errore;
    - fratelli non ancora interrogati: `_3` (Ecoicop 3 cifre, "prov."),
      `_4` (5 cifre), `_5` (NIC 1996–2025, basi 1995/2010/2015, già in
      Ecoicop 2), `_6` (tutte le basi), `167_746` (pesi), `167_747` (medie
      annue), `DF_BULK_DCSP_NIC1B2025_TB1…TB3` (coefficienti di raccordo
      fra basi). La guida non ufficiale citava `167_744` con chiave
      `M.01.IT.4.39`: è la vecchia serie in base 2015 (tipo dato `39`),
      NON usarla per il 2026.
  - **Chiave**: `FREQ.REF_AREA.DATA_TYPE.MEASURE.ECOICOP_2`. Per noi
    `M` · `IT` · `85` (NIC base 2025, mensile) · misura · categoria.
    Misure popolate: `4` numero indice, `6` variazione % congiunturale,
    `7` variazione % tendenziale. `+` chiede più valori in una query.
    Esempio verificato:
    `/rest/data/IT1,167_745_DF_DCSP_NIC1B2025_1,1.0/M.IT.85.4+6+7.00+01+04+07?startPeriod=2026-06`.
  - **Codici**: `00` generale, `01` alimentari e bevande analcoliche, `04`
    abitazione/acqua/elettricità/gas, `07` trasporti (le divisioni vanno
    da `01` a `13`); in `_2` `ENRGY` beni energetici e `FOODHPC` "beni
    alimentari, per la cura della casa e della persona", il "carrello
    della spesa" dei comunicati (che coincidano lo sappiamo dalla prassi
    dei comunicati, non dai dati). "Energia" NON è una divisione: attraversa
    la 04 e la 07. L'elenco `CL_ECOICOP_2` (905 codici) è condiviso e ha
    doppioni in stile Eurostat senza padre (`NRG`, `FOODNP`…): quali abbiano
    dati NIC si scopre solo interrogando.
  - **Risposta**: `GenericData` XML, una `<generic:Series>` per chiave con
    le `<generic:Obs>`. **`TIME_PERIOD` = stringa `AAAA-MM`** (`2026-08`):
    per `recorded_at` va convertita esplicitamente al primo del mese UTC,
    come per la Svizzera. Valori col punto e senza decimali fissi (`"3"`,
    `"101.6"`): leggerli come numeri. Nessun attributo nelle osservazioni
    (niente `OBS_STATUS`, quindi non sappiamo se l'ultimo mese sia
    provvisorio). Le variazioni tornano con gli indici (es. generale
    103,4 → 103,9 = +0,48%, misura `6` = 0,5). Le risposte di dati hanno
    `<message:Test>true</message:Test>` (quelle di struttura `false`):
    probabilmente un'impostazione del server (mittente `SOME_NSI`), da
    tenere d'occhio.
  - **Dati di agosto 2026** (ultimo mese, aggiornamento ISTAT del
    16/9/2026): generale +3,3% tendenziale / +0,5% congiunturale;
    alimentari +1,2%; abitazione +9,1%; trasporti +6,1%; beni energetici
    +17,1%; carrello +0,9%.
  - **Storico dal 1996 (ricognizione del 24/9, query 5–8)**:
    - `_5` e `_6` usano la STESSA struttura `DCSP_NIC1B2025` e lo stesso
      archivio (`DDBDataflow` `5A5CF502…`) di `_1`/`_2`: stessa chiave,
      cambia solo `DATA_TYPE`. **Usare `_6`** ("tutte le basi"): si
      aggiorna ogni mese con `_1` (ultimo aggiornamento 16/9/2026); `_5` è
      un archivio chiuso 1996–2025, fermo al 4/6/2026.
    - **Basi, indice generale** (`firstNObservations=1`): `1` = 1995=100
      da gen 1996; `9` = 2010=100 da gen 2011; `39` = 2015=100 da gen 2016
      a **dic 2025** (visto); `85` = 2025=100 da **gen 2026**. `7`
      (dic 1998=100) non ha dati. La fine di `1` e `9` (dic 2010, dic
      2015) è dedotta dallo schema, non verificata (`lastNObservations=1`
      la darebbe). **Nessuna sovrapposizione**: ogni base parte a gennaio
      dell'anno dopo il suo anno di riferimento, la precedente si ferma a
      dicembre.
    - **Lo storico NON è riportato in base 2025**: resta nelle basi
      originali. Per una serie continua servono tre raccordi.
      Coefficiente = 100 ÷ media dei 12 mesi dell'anno base nella serie
      vecchia (la base vecchia copre sempre l'anno base della nuova).
      Verificato sui numeri ISTAT: generale, media 2025 in base 2015 =
      122,63 → coefficiente 0,8154 → agosto 2025 = 100,55 → agosto 2026
      (103,9) = **+3,3%**, come ISTAT; alimentari 134,41 → 0,7440 →
      +1,25% contro 1,2% ISTAT (scarto dovuto agli indici arrotondati).
      **Nel codice usare i coefficienti ufficiali** di
      `DF_BULK_DCSP_NIC1B2025_TB1…TB3`, non quelli ricalcolati.
    - **Nota ufficiale di `_6`**: le serie 1996–2025 sono RICOSTRUITE da
      ISTAT in ECOICOP v2. Nessun effetto sull'indice generale; per le
      categorie i valori ricostruiti **non sostituiscono** quelli diffusi
      fino a dic 2025 con la vecchia classificazione, quindi possono
      differire dai numeri pubblicati all'epoca. Se si mostrano categorie
      prima del 2026, va dichiarato in metodologia.
    - **Parametri su questo server**: `startPeriod` e `firstNObservations`
      funzionano; **`endPeriod` viene IGNORATO** (chiesto 2026-02, arrivato
      fino ad agosto 2026). Nel codice non fidarsi di `endPeriod`: filtrare
      il periodo dopo aver letto la risposta. `references=datastructure`
      dà dataflow + struttura in pochi KB (contro i 10 MB di
      `references=Descendants`, che include tutti gli elenchi di codici).
  - **Aperto**: significato di `Test=true`; revisioni del dato (coperte
    comunque da `data_corrections` se la fonte ripubblica); fine delle
    basi 1995 e 2010 non verificata.
  - **Query 9 (24/9)**: `_6`, chiave
    `M.IT.39+85.4+7.00+01+FOODHPC+ENRGY`, `startPeriod=2025-11` → 16
    serie su 16. Base 2015 a dic 2025: generale 122,6 (+1,2%), alimentari
    135,2 (+2,3%), energetici 146,1 (−4,5%), carrello 130,5 (+1,9%). Base
    2025 da gen 2026, fino ad agosto: stessi valori già noti (+3,3%,
    +1,2%, +17,1%, +0,9%). Gli aggregati `FOODHPC`/`ENRGY`, che in `_1`
    non c'erano, in `_6` ci sono.
  - **Query 10 (24/9)**: `/rest/data/IT1,DF_BULK_DCSP_NIC1B2025_TB1,1.0/all`
    → errore di 187 byte "Error while retrieving Mappings from Mapping
    Store… doesn't contain a mapping set". I dataflow `DF_BULK` sono solo
    download, non dati interrogabili: non riprovare con altre chiavi. I
    nomi di `TB1…TB3` si leggono in locale dal file `allstubs` già
    scaricato (con `Get-Content -Raw` e regex `(?s)`: il nome è su un'altra
    riga), senza query.
  - **Query fatte: 10** (la nona e la decima sopra). Le prime 8, tutte dal PC di Yuri e a minuti di distanza, senza
    segnali di blocco: struttura di `_1` (10,2 MB con
    `references=Descendants`), dati di `_1` (12 serie su 18), elenco dei
    dataflow (`/rest/dataflow/IT1?detail=allstubs`, 4.910 dataflow, 2,3
    MB), dati di `_2` (6 serie su 6), struttura di `_6` e di `_5`
    (`references=datastructure`), dati di `_6` con 5 basi da dic 2024 (4
    serie), primo mese di ogni base (`firstNObservations=1`, 4 serie).

- **Sezione inflazione (ISTAT, NIC) — registro dei lavori del 24 set
  2026.** In ordine cronologico: dove c'è scritto "(24/9, branch)" il
  lavoro è poi finito in `main` con le PR drakekluser99/Mercuriale#27
  (dati, cron, pagina) e #28 (grafico, home, metodologia). La
  ricognizione che l'ha preceduta è la voce "Ricognizione ISTAT" qui
  sopra.
  Due vincoli da non dimenticare:
  - **limite ISTAT: 5 query al minuto per IP, blocco di 1-2 giorni** se
    superato. Dal cloud ISTAT non si raggiunge e Yuri ha deciso di NON
    aprire i domini: le query di verifica le lancia lui dal PC;
  - il cron su Vercel farà query vere a ISTAT: va progettato con UNA
    richiesta per esecuzione (le categorie si chiedono insieme con `+`),
    niente tentativi ripetuti.
  **Decisioni prese con Yuri (24 set 2026), da NON ridiscutere**:
  - numero principale = **variazione annua** (tendenziale, misura `7`);
    l'**indice** (misura `4`) sotto, per i confronti nel tempo. La
    congiunturale per ora no;
  - **4 serie**: generale `00`, carrello `FOODHPC`, beni energetici
    `ENRGY`, alimentari `01`. Le altre divisioni eventualmente dopo;
  - storico **dal 2016**: un solo raccordo (base 2015 → 2025), con il
    coefficiente ufficiale `DF_BULK_…`, non ricalcolato;
  - pagina propria **`/inflazione`, sezione 06**, con anteprima in home;
    NESSUNA cella in più nella fascia (ne ha già sei).
  **Verificato con la query 9 (24/9)**: `_6` ha TUTTE e 4 le serie in
  entrambe le basi (`39` fino a dic 2025, `85` da gen 2026), con indice
  (`4`) e variazione annua (`7`) — un solo dataflow basta, niente `_2`.
  Quindi la **variazione annua non richiede raccordi** (si prende già
  fatta da ISTAT e si cuce al cambio di base); il coefficiente ufficiale
  serve SOLO per il grafico dell'indice. Coefficienti: `TB1` = codici
  ECOICOP (`00`, `01`), `TB2` = tipologie (`FOODHPC`, `ENRGY`), `TB3` =
  per regione (non serve). **Le tabelle `DF_BULK_…` NON si leggono via
  SDMX** (query 10: "doesn't contain a mapping set", sono
  `isExternalReference`): vanno scaricate come file dal sito IstatData
  (ricerca "coefficienti di raccordo" → pulsante `SCARICA_XLSX`).
  **`TB1` scaricata il 24/9** (`DCSP_NIC_CR_Ecoicov2_rev.xlsx`, foglio
  `IT`, intestazione alla riga 15: codice, livello, denominazione, poi i
  tre coefficienti 1995→2010, 2010→2015, **2015→2025**): generale `00` =
  **1,226**, alimentari `01` = **1,344**. Il coefficiente è vecchio ÷
  nuovo: **indice base 2025 = indice base 2015 ÷ coefficiente** (torna con
  la media 2025 in base 2015 già calcolata: 122,63 e 134,41). Tre
  decimali; alcune celle sono testo con "(r)" = revisionato (es.
  `'1,228 (r)'` sul generale senza tabacchi): chi le legge deve gestirle.
  Il file FOI omonimo (`DCSP_FOI_CR_…`) è di un altro indice, NON usarlo.
  **`FOODHPC`/`ENRGY`: coefficiente 2015→2025 NON pubblicato** su
  IstatData (24/9, controllati tutti i download di "coefficienti di
  raccordo": `TB2`, `TB2_1…_5`, `TB3.zip` e `TB3_1.zip`, più il file
  regionale `NUTS2_b15_b25`. Gli aggregati speciali arrivano solo al
  raccordo 2010→2015, e molti file sono copie identiche. NON
  riscaricarli). **Decisione di Yuri (24/9)**: coefficiente CALCOLATO =
  media dei 12 mesi 2025 in base 2015 ÷ 100, con controllo: il backfill
  fa lo stesso calcolo su `00` e `01` e si FERMA se non dà 1,226 e 1,344
  alla terza decimale. Dichiarato in metodologia ("calcolato da
  Mercuriale con il metodo ISTAT, non pubblicato da ISTAT"). I due
  ufficiali restano una COSTANTE nel codice con fonte e data (cambiano
  solo al prossimo cambio di base), come `CHOKEPOINT_BASELINES`.
  **Schema — FATTO (24/9; migrazione `0014` applicata da Yuri lo stesso
  giorno)**: tabella `consumer_price_index` (`category` = codice ECOICOP
  della fonte, `recorded_at` = primo del mese UTC, `base_year` 2015/2025,
  `index_value` nella base ORIGINALE — il raccordo si applica in lettura,
  come i franchi di `swiss_fuel_prices` —, `yoy_change_pct` nullable,
  `retrieved_at`, `fetch_run_id`, `source` = "istat_nic"). Unica su
  (`category`, `recorded_at`), SENZA la base: le basi non si
  sovrappongono, e un mese in due basi deve far scattare il conflitto.
  Revisioni ISTAT → `data_corrections` (tabella generica, non va toccata).
  **Fetcher — FATTO (24/9, branch)**: `src/lib/fetchers/istatNic.ts`.
  `buildNicUrl(dataTypes, startPeriod)` = UNA richiesta con le 4 serie e
  le misure 4+7 unite da `+`, niente `endPeriod` (ignorato dal server).
  `parseNicGenericData` (pura) legge il GenericData con espressioni
  regolari e non con una libreria XML (forma fissa e piatta; ogni pezzo
  inatteso deve comunque fermare il parser): ricompone indice e
  variazione in UNA riga per (serie, mese); si ferma su testo non XML
  (gli errori ISTAT sono testo semplice), base/categoria/misura/frequenza
  sconosciute, mese non "AAAA-MM", valore vuoto o non numerico (mai zero),
  stesso mese in due basi, misura ripetuta, variazione senza indice.
  `assertAllCategories` (separata: regola di chi chiama) fa fermare il run
  se manca una serie. `fetchNic`: timeout 8 s, NESSUN nuovo tentativo, su
  429 lo dice ("NON riprovare"). `monthToDate` → primo del mese UTC. Test
  in `istatNic.test.ts` sul file VERO della query 9, salvato in
  `src/lib/fetchers/fixtures/istat-nic-2025-11.xml`.
  **Salvataggio — FATTO (24/9, branch)**: `saveNicPoints.ts`. Legge
  con UNA query le righe già salvate nel periodo, poi `compareWithSaved`
  (pura, testata) si FERMA se un mese salvato arriva in un'altra base
  (sempre, anche nel backfill, prima di scrivere) ed elenca le correzioni
  candidate (`index_value`, `yoy_change_pct`, etichetta `NIC <codice>`).
  Upsert a blocchi da 500 con `excluded.*`; `yoy_change_pct` e
  `fetch_run_id` con `coalesce` (una risposta senza variazione non
  cancella quella salvata; il backfill non cancella l'id del cron).
  Correzioni scritte solo con `logCorrections: true` (cron, non
  backfill), DOPO il salvataggio. La soglia di "cosa è una correzione"
  ora è `isCorrection` in `correctionsLog.ts`, usata anche da
  `logCorrectionIfChanged`: non ricopiare `0.00005` altrove.
  **Raccordo — FATTO (24/9, branch)**: `src/lib/nicSplice.ts` (puro,
  testato). `OFFICIAL_SPLICE_2015_TO_2025` = { `00`: 1,226, `01`: 1,344 }
  con fonte e file nel commento; `CALCULATED_SPLICE_2015_TO_2025` =
  { `FOODHPC`, `ENRGY` } a **`null` finché non si fissano DOPO il
  backfill** (copiando il valore stampato dallo script), come
  `CHOKEPOINT_BASELINES`. `toBase2025` divide l'indice in base 2015 per
  il coefficiente e restituisce **null** se non è fissato (la UI mostra
  solo la variazione, niente salto finto). `computeSpliceCoefficient` =
  media dei 12 mesi 2025 in base 2015 ÷ 100, tre decimali, si ferma se
  manca un mese. `checkSplice` si FERMA se il calcolo non dà esattamente
  i due ufficiali; per gli aggregati restituisce il confronto. Arrotonda
  con `Math.round(x*1000)/1000`: un "trucco" di arrotondamento provato
  e tolto il 24/9, non cambiava niente (l'errore sui valori a metà nasce
  nella media, non nell'arrotondamento).
  **Cron e backfill — FATTI (24/9, branch)**:
  - `runNicJob.ts` (job condiviso fra route e script, come
    `runChokepointTransitsJob`): SOLO base 2025 (`85`), da
    `cronStartPeriod(now)` = 12 mesi prima (copre le revisioni),
    `logCorrections: true`. Route `fetch-istat-nic`, `maxDuration` 10,
    **ogni giorno alle 11 UTC** (dopo i comunicati delle 10 di Roma, ora
    libera). Una richiesta, nessun nuovo tentativo.
  - Freschezza `istat_nic` **77 + 10 giorni** (dato del 1/8 uscito il
    16/9; quello di settembre esce verso il 16/10, quindi fino ad allora
    agosto ha fino a ~76 giorni). `/stato-dati`: etichetta del job, badge
    di freschezza (`SOURCE_LEVEL_FRESHNESS`), e le correzioni NIC
    formattate come indice (1 decimale) e variazione (col segno), NON
    come prezzi.
  - `npm run backfill:nic` (`scripts/backfill-nic.ts`): il primo lancio fa
    UNA richiesta (4 serie × basi 2015+2025 × indice e variazione, dal
    2016-01) e salva la risposta in `istat-nic-backfill.xml` (in
    .gitignore); se il file esiste si RIFIUTA di riscaricare. Poi sempre
    `--file istat-nic-backfill.xml` (zero richieste), anche con `--save`.
    Stampa mesi per serie e base, mesi mancanti a intervalli, il
    controllo del raccordo (si ferma se `00`/`01` non danno 1,226/1,344)
    e i coefficienti di `FOODHPC`/`ENRGY` da fissare. `--save` rifiutato
    con mesi mancanti; scrive senza run e senza correzioni. `--cron` =
    esegue `runNicJob` (una richiesta, riga in `fetch_runs`).
  - Provato nel cloud su due file (niente rete): la query 9 vera (mesi
    mancanti e raccordo impossibile, esce con 1) e uno storico finto
    2016-01 → 2026-08 (512 righe, coefficienti ufficiali riprodotti,
    dicembre 2025 = 100,0); con 122,75 al posto di 122,63 si ferma.
  **Primo backfill vero (24/9, Yuri dal PC)**: `db:migrate` lanciato (NON
  ha stampato la conferma finale, solo l'avviso sul driver websocket: da
  verificare col `--save`, che si ferma se la tabella non c'è);
  `backfill:nic` = UNA richiesta, 122.605 caratteri, 512 righe, nessun
  mese mancante, 120 mesi base 2015 + 8 base 2025 per serie. Raccordo:
  `00` 1,226 e `01` 1,344 riprodotti ESATTAMENTE; calcolati **`FOODHPC`
  1,301**, **`ENRGY` 1,501**, fissati in `CALCULATED_SPLICE_2015_TO_2025`.
  Dicembre 2025 in base 2025: generale 100,0, alimentari 100,6, carrello
  100,3, energetici 97,3 (energia in calo nel 2025, −4,5% a dicembre).
  **Salvato (24/9)**: `--file istat-nic-backfill.xml` → i quattro
  coefficienti "coincide"; `--save` → **512 righe in
  `consumer_price_index`, ultimo mese 2026-08** (quindi anche la
  migrazione 0014 è applicata). Dopo il messaggio finale Node su Windows
  ha stampato "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)":
  innocuo (righe già scritte), causato da `process.exit()` con la
  connessione al database ancora in chiusura. Corretto in
  `backfill-nic.ts` con `process.exitCode`. Gli altri script
  (`backfill.ts`, `backfill-chokepoints.ts`, `chokepoint-baselines.ts`)
  usano ancora `process.exit()`: se stampano lo stesso messaggio, stessa
  correzione.
  Il cron gira dal merge della PR drakekluser99/Mercuriale#27 (in Preview
  i cron non girano).
  **UI, passo 1 — pagina `/inflazione` (24/9, branch)**: sezione 06
  (`SECTION_PAGES`, icona `Percent` in SectionNav e MobileNav).
  `src/lib/inflation.ts` (puro, testato): `INFLATION_SERIES` = ordine e
  nomi da lettore (generale, carrello, alimentari, energetici, con
  `detail` che dice cosa contengono); `summarizeInflation` = per serie
  ultimo mese, variazione annua ISTAT, indice in base 2025 e variazione
  dal primo mese sulla serie RACCORDATA (null se manca un coefficiente).
  `getConsumerPriceIndex` in queries.ts (tutto lo storico, poche
  centinaia di righe), `loadInflation` in dashboard.ts (`.catch → []`,
  freschezza `istat_nic` sul mese più recente, run `fetch-istat-nic`).
  `InflationCard` (numero grande = variazione annua, ruggine/verde col
  segno; sotto indice 2025=100 e "da gennaio 2016"; descrizione con due
  righe riservate da `sm`, altrimenti il carrello andava più in basso),
  `sections/InflationSection` (cifra chiave sul generale + la voce che
  cresce di più, "ultimo mese pubblicato" con FreshnessBadge, SourceNote
  con i coefficienti LETTI dalle costanti). Nuovi: `formatMonthYear` in
  format.ts, fonte `istat` in sources.ts con la scheda in metodologia
  (SENZA licenza: CC BY non verificata nella sessione), ISTAT nella
  citazione di `CiteBox`.
  **Barra di navigazione**: con la sezione 05 le voci erano già 1582 px
  su 1280 (le pagine secondarie fuori schermo a 1400 px), con la 06 1740.
  Decisione di Yuri: Metodologia/Glossario/Numeri/Stato dei dati salgono
  nell'header da `lg` (`site/HeaderPageLinks.tsx`, riga sotto "Codice
  sorgente"); nella barra restano fra `sm` e `lg` (lì scorre comunque);
  voci delle sezioni `lg:px-4`. Misurato: a 1280 e 1400 px la barra sta
  in 1280 px esatti. **Una settima sezione non ci starà più**: servirà
  accorciare le etichette o togliere i numeri.
  **UI, passo 2 — grafico (24/9, branch)**: `components/InflationChart.tsx`
  (client) sotto le schede. Quattro serie su UN asse (stessa unità),
  interruttore di misura "Variazione annua" (predefinita) / "Indice
  (2025 = 100)", periodi `INFLATION_WINDOWS` (1 anno = 13 mesi, 5 anni =
  61, "Dal 2016") — non 1/3 mesi: il dato è mensile. Linea tratteggiata
  a 0 (variazione) o 100 (indice). Punti preparati sul server da
  `buildInflationChart` (`src/lib/inflationChart.ts`, puro e testato:
  un punto per mese, indice già raccordato, null se manca una serie) e
  filtrati nel browser: nessuna richiesta al cambio di periodo.
  **Colori**: nuovi token `system-series-1…3` in globals.css (viola
  #7b4fb0 carrello, verde-acqua #00959e alimentari, ocra dorato #a06a00
  energetici), indice generale in `system-ink` più spesso. Validati con
  lo script della skill dataviz, TUTTE le coppie, sfondo #fffdf8: peggiore
  ΔE 12,3 deutan (soglia 8), 20,6 visione normale (soglia 15). Scartati:
  blu+viola (ΔE 3,1 protan), verde-acqua scuro (saturazione < 0,10).
  Mai ruggine/verde/cremisi/ambra del marchio per identità.
  **Legenda cliccabile**: sulla variazione gli energetici (≈+70% nel
  2022) schiacciano le altre voci (0-13%); un clic nasconde una serie e
  la scala si stringe. Di partenza tutte visibili, l'ultima non si
  toglie. Tooltip con testo in inchiostro e ordine della legenda
  (`itemStyle`, `itemSorter`); tabella dei dati in `<details>` chiuso.
  `HistoryWindowSelector` ora vuole `windows` esplicito (generico sulla
  chiave): i due grafici esistenti passano `HISTORY_WINDOWS`.
  Screenshot con dati FINTI (forme inventate) a 1400 e 400 px.
  **UI, passo 3 — home (24/9, branch)**: sesta `SectionPreview`
  (variazione annua del generale, ruggine/verde col segno; frase con
  energetici e carrello). Con sei anteprime la griglia è tre righe da
  due: il traffico marittimo NON ha più `md:col-span-2`. ISTAT
  nell'intro della home; "Fonti in linea" conta anche `istat_nic`
  (`loadSummary` legge `loadInflation`). NESSUNA cella nuova nella
  fascia (decisione del 24/9). Nuovo `formatAtMonth` in format.ts: "ad
  agosto", "ad aprile", "a settembre" — la prima versione scriveva "a
  agosto" in home, nella cifra chiave e nelle schede.
  **UI, passo 4 — metodologia (24/9, branch)**: sezione **05
  "Inflazione"** in `/metodologia` (ancora `#inflazione`, linkata dalla
  nota Fonte di `/inflazione`; "Codice sorgente" e "API pubblica" passate
  a 06 e 07), testo in `components/methodology/InflationMethodology.tsx`.
  Cosa è il NIC (non IPCA, non FOI), le quattro serie, la variazione
  annua presa da ISTAT, il cambio di base con l'esempio 146,1 → 98,9,
  tabella dei coefficienti LETTA da `spliceCoefficient` (valore e
  provenienza ISTAT / calcolato da Mercuriale), il controllo del metodo,
  i limiti (serie ricostruite in ECOICOP v2, un decimale, revisioni in
  "Stato dei dati", nessun segnale di dato provvisorio, uscita a metà del
  mese dopo). In "Frequenza di aggiornamento": cron giornaliero e 77
  giorni di cadenza attesa. Verificata sulla pagina VERA (non legge il
  database) a 1400 e 400 px.
  **Stato (24/9, sera)**: schema, fetcher, raccordo, cron, backfill e
  passo 1 (pagina + header) sono IN PRODUZIONE con la PR
  drakekluser99/Mercuriale#27, fusa da Yuri: **il cron
  `fetch-istat-nic` gira da quel merge**, ogni giorno alle 11 UTC. I
  passi 2-4 (grafico, home, metodologia) sono stati riportati sopra
  `main` con un rebase e sono nella PR drakekluser99/Mercuriale#28.

- **Controllo grafico di tutto il sito (24 set 2026, sera, Claude Code nel
  cloud, PR drakekluser99/Mercuriale#29).** Tutte le 13 pagine a 1400 px e 390 px, con `queries.ts`
  sostituito TEMPORANEAMENTE da una versione a dati finti (mai
  committata: le pagine vere girano identiche, cambia solo l'origine dei
  numeri) e uno script Playwright che segnala sbordi orizzontali e
  riquadri scorrevoli con contenuto nascosto. Nessuno sbordo della
  pagina. Corretti:
  - **Barra delle sezioni**: con sette voci era 1322 px in 1280, quindi
    scorreva e "Panoramica" restava tagliata a sinistra su PC. Voci
    `lg:px-3` (erano `lg:px-4`): ora 1280 su 1280. **Non c'è margine**:
    un'etichetta più lunga la fa scorrere di nuovo.
  - "Il numero del giorno": cifra e unità separate ("26,7" grande,
    "miliardi di €" più piccolo); prima "€" restava solo sull'ultima riga.
  - Fascia, "Ultimo dato": solo la data (`formatDate`), era data + "00:00".
  - Tabella province su telefono: la colonna del gasolio usciva dallo
    schermo. Sotto `sm` niente `min-w`, `px-3`, "€/L" nell'intestazione.
  - Legenda della mappa d'Europa su telefono: "media dei 27" sopra il suo
    valore (i tre gruppi erano attaccati).
  - `PriceHistoryChart`: asse, tooltip e riassunto accessibile col punto
    decimale e l'unità inglese ("dollars per barrel"); ora `it-IT` e
    `shortUnit`. Prezzo e "€" su una riga in `FuelPriceTable`.
  - "Europa (media UE)" → "Europa (media dei 27)" nel calcolatore e nelle
    serie del grafico carburanti (è la media semplice).
  **Tabelle su telefono — FATTO subito dopo (24 set 2026, sera, PR
  drakekluser99/Mercuriale#30).** Le
  tabelle di `/europa`, `/calcolatore` e `/materie-prime` scorrevano di
  lato e nascondevano una colonna (la data; nel calcolatore gli Stati
  Uniti). Sotto `sm` ora:
  - `FuelPriceTable` e tabella materie prime: le colonne secondarie
    (carburante o categoria, data, badge di freschezza) diventano una
    seconda riga piccola sotto il nome, con `hidden sm:table-cell` sulle
    colonne originali. Il simbolo della fonte (WTI, COPPER…) compare solo
    da `sm`. Nessun dato tolto, solo spostato.
  - `FuelImpactCalculator`: ogni riga è una griglia a due colonne
    (`max-sm:grid`): la metrica a tutta larghezza, sotto Europa a
    sinistra e Stati Uniti a destra. Ruoli ARIA espliciti (`row`,
    `cell`, `columnheader`, `rowheader`) perché con `display: grid` una
    riga di tabella può smettere di esserlo per i lettori di schermo.
    Spazio non separabile in "(oggi −3,9%)": va a capo prima della
    parentesi.
  Da `sm` in su le tre tabelle sono identiche a prima (verificato a
  1400 px). Scorrono ancora di lato, di proposito: la tabella dati
  dell'inflazione (dentro "Vedi i dati"), il JSON di esempio in
  metodologia, le correzioni in `/stato-dati`.
  Nello stesso giro: script Playwright per screenshot e video del post
  LinkedIn, da lanciare dal PC contro la produzione (dal cloud il sito
  non si raggiunge). Non è nel repository.

- **Pagine paese e provincia nella cornice comune (25 set 2026, Claude
  Code nel cloud, PR drakekluser99/Mercuriale#31).** `/paese/[slug]` e `/provincia/[slug]` erano le
  ultime pagine con l'header chiaro fatto a mano, senza barra delle
  sezioni né "Come citare": chi ci arrivava dalla mappa sembrava uscire
  dal sito. Ora usano `PageShell`.
  - **`backLink`** (prop opzionale nuova di `PageShell`/`SiteHeader`):
    link alla sezione madre sopra il titolo, nell'header scuro ("←
    Carburanti in Europa", "← Province italiane"). Le pagine che non la
    passano sono identiche a prima.
  - **`sectionForPath`** in `siteNav.ts` (pura, testata in
    `siteNav.test.ts`): dice a quale sezione appartiene un indirizzo;
    `DETAIL_PAGE_SECTIONS` porta `/paese/*` a `/europa` e `/provincia/*`
    a `/italia`. `SectionNav` la usa: sulla pagina esatta
    `aria-current="page"`, su una pagina di dettaglio `"true"` (la voce è
    la sezione in cui ci si trova, non la pagina corrente). Il
    centramento della voce attiva cerca `a[aria-current]`.
  - Contenuto con lo schema delle altre pagine: `SectionHeading` col
    numero della sezione madre (01, 04) e `KeyFigure` con la frase che
    prima stava nell'header (quota di imposte per il paese, prezzo self e
    posizione per la provincia). Schede in `md:grid-cols-2
    lg:grid-cols-3`: benzina, diesel/gasolio e il confronto con la media
    (scelta di Yuri, 25/9). Calcoli e testi delle schede invariati. La
    nota "perché qui non c'è la quota fiscale" della provincia è un
    paragrafo sotto le schede, non più una scheda.
  - Titoli: "Benzina e diesel in <paese>", "Benzina e gasolio a
    <provincia>" (la pagina ha sempre mostrato entrambi i carburanti).
    Ordinale della provincia corretto da "12°" a "12ª" (concorda con
    "provincia").
  - Verificato a 1400 e 390 px con i dati finti: nessuno sbordo, barra
    con la voce giusta accesa.

## Skill: vercel-react-best-practices

Skill installata in .claude/skills/vercel-react-best-practices/.
Consultare per: eliminazione di waterfall async, ottimizzazione bundle
size (dynamic import, barrel imports), performance server-side (React.cache,
parallel fetching), re-render inutili, pattern di rendering.
Guida completa in AGENTS.md, regole singole in rules/*.md.

## Skill: frontend-design

Skill installata in .claude/skills/frontend-design/.
Consultare per: direzione estetica quando si costruisce nuova UI o si
ridisegna quella esistente — scelte di palette, accoppiamento tipografico,
layout che non sembrino default templatizzati. Dettagli in SKILL.md.
