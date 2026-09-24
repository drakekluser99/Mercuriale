/**
 * ISTAT — indice dei prezzi al consumo per l'intera collettività (NIC),
 * mensile, dal servizio SDMX di IstatData.
 *
 * Dataset `167_745_DF_DCSP_NIC1B2025_6` ("tutte le basi"): stessa struttura
 * del dataset corrente `_1`, ma contiene sia la base 2015 (fino a dicembre
 * 2025) sia la base 2025 (da gennaio 2026), e in più gli aggregati speciali
 * `FOODHPC`/`ENRGY` che in `_1` non ci sono. Una sola fonte per cron e
 * backfill. Verificato con la query 9 del 24/9/2026 (file vero in
 * `fixtures/istat-nic-2025-11.xml`, usato dai test).
 *
 * Le stesse due regole di portwatch.ts e swissFuelPrices.ts:
 *
 * 1. Il parsing è separato dal download (`parseNicGenericData` è pura,
 *    niente rete) così si prova sul file vero e su risposte finte.
 * 2. Nessun ripiego silenzioso. Serie, misura o base sconosciute, un mese
 *    in un formato diverso, un valore non numerico, lo stesso mese in due
 *    basi: si lancia un errore che dice COSA non torna, e non si salva
 *    niente.
 *
 * LIMITE DI VELOCITÀ: ISTAT accetta 5 richieste al minuto per IP e blocca
 * l'IP per 1-2 GIORNI se si supera. Per questo qui c'è UNA richiesta per
 * chiamata (tutte le serie insieme, unite con "+"), nessun tentativo
 * ripetuto in caso di errore, e un timeout: meglio un run fallito, che il
 * cron del giorno dopo riprova, che una raffica di richieste.
 */

const DATA_URL = "https://esploradati.istat.it/SDMXWS/rest/data";
const DATAFLOW = "IT1,167_745_DF_DCSP_NIC1B2025_6,1.0";

/**
 * Le serie che seguiamo, con il codice ECOICOP della fonte. Il nome è
 * quello dei comunicati ISTAT, per la UI e i messaggi di errore.
 */
export const NIC_CATEGORIES = [
  { code: "00", name: "Indice generale" },
  { code: "01", name: "Prodotti alimentari e bevande analcoliche" },
  { code: "FOODHPC", name: "Beni alimentari, per la cura della casa e della persona" },
  { code: "ENRGY", name: "Beni energetici" },
] as const;

export type NicCategoryCode = (typeof NIC_CATEGORIES)[number]["code"];

/**
 * DATA_TYPE della fonte → anno base. Solo le due basi che usiamo: le basi
 * 1995 (`1`) e 2010 (`9`) esistono nel dataset, ma lo storico parte dal
 * 2016 (decisione del 24/9), e un codice che non è qui fa fermare il
 * parser invece di finire salvato con una base sbagliata.
 */
export const NIC_BASES = { "39": 2015, "85": 2025 } as const;

export type NicDataType = keyof typeof NIC_BASES;

// Le misure: 4 = numero indice, 7 = variazione % sullo stesso mese
// dell'anno prima. La 6 (sul mese prima) esiste ma non la chiediamo.
const MEASURE_INDEX = "4";
const MEASURE_YOY = "7";

export type NicPoint = {
  category: NicCategoryCode;
  /** Mese del dato, "AAAA-MM", come lo scrive la fonte. */
  month: string;
  baseYear: 2015 | 2025;
  /** Numero indice nella base `baseYear`. */
  indexValue: number;
  /** Variazione % tendenziale, `null` se la fonte non la dà per quel mese. */
  yoyChangePct: number | null;
};

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * URL della richiesta: tutte le serie di `NIC_CATEGORIES`, le basi in
 * `dataTypes`, indice e variazione annua, dal mese `startPeriod`.
 *
 * Niente `endPeriod`: su questo server viene IGNORATO (verificato il
 * 24/9: chiesto 2026-02, arrivato fino ad agosto). Chi vuole fermarsi a
 * un mese filtra dopo aver letto la risposta.
 */
export function buildNicUrl(dataTypes: readonly NicDataType[], startPeriod: string): string {
  if (!MONTH.test(startPeriod)) {
    throw new Error(`ISTAT NIC: startPeriod deve essere "AAAA-MM", ricevuto "${startPeriod}"`);
  }
  if (dataTypes.length === 0) throw new Error("ISTAT NIC: nessuna base richiesta");
  const key = [
    "M",
    "IT",
    dataTypes.join("+"),
    `${MEASURE_INDEX}+${MEASURE_YOY}`,
    NIC_CATEGORIES.map((c) => c.code).join("+"),
  ].join(".");
  return `${DATA_URL}/${DATAFLOW}/${key}?startPeriod=${startPeriod}`;
}

/** "2026-08" → 1 agosto 2026 a mezzanotte UTC, il `recorded_at` salvato. */
export function monthToDate(month: string): Date {
  const m = MONTH.exec(month);
  if (!m) throw new Error(`ISTAT NIC: mese non valido "${month}"`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

// Legge gli attributi di un tag XML in un oggetto, qualunque sia il loro
// ordine: `id="FREQ" value="M"` → { id: "FREQ", value: "M" }.
function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

// Il prefisso dei nomi (`generic:`, `message:`) è dichiarato nel documento
// e in teoria il server potrebbe cambiarlo: le espressioni lo accettano
// qualunque sia, e cercano solo il nome locale del tag.
const SERIES_BLOCK = /<(?:\w+:)?Series>([\s\S]*?)<\/(?:\w+:)?Series>/g;
const SERIES_KEY = /<(?:\w+:)?SeriesKey>([\s\S]*?)<\/(?:\w+:)?SeriesKey>/;
const VALUE_TAG = /<(?:\w+:)?Value\b[^>]*>/g;
const OBS_BLOCK = /<(?:\w+:)?Obs>([\s\S]*?)<\/(?:\w+:)?Obs>/g;
const OBS_DIMENSION = /<(?:\w+:)?ObsDimension\b[^>]*>/;
const OBS_VALUE = /<(?:\w+:)?ObsValue\b[^>]*>/;

/**
 * Trasforma una risposta SDMX "GenericData" di ISTAT in punti mensili,
 * uno per (serie, mese), con indice e variazione annua insieme.
 *
 * Perché un lettore scritto a mano e non una libreria XML: la risposta ha
 * una forma fissa e piatta (serie → chiave → osservazioni, niente testo
 * libero, niente entità), e ogni pezzo inatteso deve comunque fermare il
 * parser con un messaggio preciso. Una dipendenza in più non toglierebbe
 * nessuno di questi controlli.
 */
export function parseNicGenericData(xml: string): NicPoint[] {
  const where = "ISTAT NIC";
  const head = xml.trimStart().slice(0, 200);

  // ISTAT risponde agli errori con testo semplice e non XML (es. "Error
  // while retrieving Mappings…", "NoRecordsFound"), a volte con HTTP 200.
  if (!/GenericData/.test(xml)) {
    throw new Error(`${where}: la risposta non è un GenericData SDMX — inizia con: ${JSON.stringify(head)}`);
  }

  // Chiave interna "categoria|mese": le due misure arrivano in serie
  // diverse e vanno ricomposte nella stessa riga.
  type Partial = {
    category: NicCategoryCode;
    month: string;
    baseYear: 2015 | 2025;
    indexValue?: number;
    yoyChangePct?: number;
  };
  const byMonth = new Map<string, Partial>();
  let seriesCount = 0;

  for (const seriesMatch of xml.matchAll(SERIES_BLOCK)) {
    seriesCount++;
    const body = seriesMatch[1];
    const keyBlock = SERIES_KEY.exec(body)?.[1];
    if (!keyBlock) throw new Error(`${where}: serie ${seriesCount} senza SeriesKey`);

    const key: Record<string, string> = {};
    for (const tag of keyBlock.match(VALUE_TAG) ?? []) {
      const a = attributes(tag);
      if (a.id) key[a.id] = a.value;
    }
    const label = JSON.stringify(key);

    if (key.FREQ !== "M" || key.REF_AREA !== "IT") {
      throw new Error(`${where}: serie inattesa (atteso mensile, Italia): ${label}`);
    }
    const baseYear = NIC_BASES[key.DATA_TYPE as NicDataType];
    if (!baseYear) throw new Error(`${where}: base DATA_TYPE sconosciuta: ${label}`);
    const category = NIC_CATEGORIES.find((c) => c.code === key.ECOICOP_2)?.code;
    if (!category) throw new Error(`${where}: categoria ECOICOP_2 sconosciuta: ${label}`);
    if (key.MEASURE !== MEASURE_INDEX && key.MEASURE !== MEASURE_YOY) {
      throw new Error(`${where}: misura sconosciuta: ${label}`);
    }
    const isIndex = key.MEASURE === MEASURE_INDEX;

    for (const obsMatch of body.matchAll(OBS_BLOCK)) {
      const dimTag = OBS_DIMENSION.exec(obsMatch[1])?.[0];
      const valTag = OBS_VALUE.exec(obsMatch[1])?.[0];
      const month = dimTag ? attributes(dimTag).value : undefined;
      const raw = valTag ? attributes(valTag).value : undefined;

      if (!month || !MONTH.test(month)) {
        throw new Error(`${where}: ${label}, periodo non "AAAA-MM": ${JSON.stringify(month)}`);
      }
      // Il valore usa il punto e non ha decimali fissi ("3", "101.6"). Un
      // campo vuoto o non numerico NON diventa zero.
      const value = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
      if (!Number.isFinite(value)) {
        throw new Error(`${where}: ${label}, ${month}, valore non numerico: ${JSON.stringify(raw)}`);
      }

      const k = `${category}|${month}`;
      const row = byMonth.get(k) ?? { category, month, baseYear };
      // Lo stesso mese in due basi: le basi non si sovrappongono
      // (verificato), quindi se succede non scegliamo noi quale tenere.
      if (row.baseYear !== baseYear) {
        throw new Error(
          `${where}: ${category} ${month} compare sia in base ${row.baseYear} sia in base ${baseYear}`
        );
      }
      const field = isIndex ? "indexValue" : "yoyChangePct";
      if (row[field] !== undefined) {
        throw new Error(`${where}: ${category} ${month}, misura ${key.MEASURE} ripetuta`);
      }
      row[field] = value;
      byMonth.set(k, row);
    }
  }

  if (seriesCount === 0) {
    throw new Error(`${where}: la risposta non contiene nessuna serie`);
  }

  const points: NicPoint[] = [];
  for (const row of byMonth.values()) {
    // La variazione senza l'indice dello stesso mese non si salva: la riga
    // in tabella ha l'indice obbligatorio, e un mese a metà vuol dire che
    // la risposta è incompleta.
    if (row.indexValue === undefined) {
      throw new Error(`${where}: ${row.category} ${row.month} ha la variazione ma non l'indice`);
    }
    points.push({
      category: row.category,
      month: row.month,
      baseYear: row.baseYear,
      indexValue: row.indexValue,
      yoyChangePct: row.yoyChangePct ?? null,
    });
  }

  // Ordine stabile (serie, poi mese): i test e i log restano leggibili.
  const order = NIC_CATEGORIES.map((c) => c.code as string);
  points.sort(
    (a, b) =>
      order.indexOf(a.category) - order.indexOf(b.category) || a.month.localeCompare(b.month)
  );
  return points;
}

/**
 * Controlla che la risposta copra TUTTE le serie di `NIC_CATEGORIES`.
 * Separata dal parser perché è una regola di chi chiama: il cron e il
 * backfill vogliono le quattro serie, un test su una risposta parziale no.
 * Una serie che sparisce (es. ISTAT rinomina un aggregato) è un errore,
 * non "tre serie su quattro aggiornate".
 */
export function assertAllCategories(points: readonly NicPoint[]): void {
  const present = new Set(points.map((p) => p.category));
  const missing = NIC_CATEGORIES.filter((c) => !present.has(c.code)).map((c) => c.code);
  if (missing.length > 0) {
    throw new Error(`ISTAT NIC: serie assenti nella risposta: ${missing.join(", ")}`);
  }
}

// Sotto i 10 secondi di `maxDuration` della rotta cron, con margine per
// il salvataggio. Una risposta di pochi KB ci sta largamente.
const TIMEOUT_MS = 8000;

/**
 * Scarica e legge le serie NIC. UNA sola richiesta, nessun tentativo
 * ripetuto (vedi il limite di velocità in testa al file).
 */
export async function fetchNic(
  dataTypes: readonly NicDataType[],
  startPeriod: string,
  timeoutMs = TIMEOUT_MS
): Promise<NicPoint[]> {
  const url = buildNicUrl(dataTypes, startPeriod);
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    // 429 = limite superato: il messaggio lo dice in chiaro, perché
    // riprovare subito prolungherebbe il blocco.
    const hint = res.status === 429 ? " (limite ISTAT superato: NON riprovare subito)" : "";
    throw new Error(`ISTAT NIC: HTTP ${res.status}${hint} — ${text.slice(0, 200)}`);
  }
  const points = parseNicGenericData(text);
  assertAllCategories(points);
  return points;
}
