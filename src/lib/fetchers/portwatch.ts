/**
 * IMF PortWatch — transiti giornalieri nei passaggi marittimi obbligati
 * ("Daily Chokepoint Transit Calls and Trade Volume Estimates").
 *
 * Servizio ArcGIS REST che risponde in JSON: niente file da scaricare e
 * aprire come per il bollettino UE, una query HTTP per passaggio.
 *
 * Due regole, le stesse di mimit.ts e swissFuelPrices.ts:
 *
 * 1. Il parsing è separato dal download (`parsePortwatchResponse` è pura,
 *    niente rete) così si prova con risposte finte nei test.
 * 2. Nessun ripiego silenzioso. Se la risposta non ha la forma attesa —
 *    un campo manca, il `portname` non è quello scritto qui, la data non
 *    è nel formato previsto, zero righe — si lancia un errore che dice
 *    COSA non torna. La route lo registra in `fetch_runs` come `ok: false`
 *    e non si scrive niente: meglio nessuna riga che un dato falso.
 *
 * Il formato del campo `date` NON è ancora stato visto su una risposta
 * reale (23 set 2026, rete del container cloud bloccata verso ArcGIS). Nella
 * definizione del layer è `esriFieldTypeDateOnly`, che in JSON dovrebbe
 * arrivare come stringa "AAAA-MM-GG" e non come millisecondi. Il parser
 * accetta SOLO quella forma: se arriva altro, si ferma mostrando il valore
 * ricevuto, e `npm run inspect:portwatch` lo fa vedere prima di scrivere.
 */

const QUERY_URL =
  "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query";

/**
 * I passaggi che seguiamo. `portname` e `portid` sono le stringhe ESATTE
 * restituite dalla fonte (verificate da Yuri sui valori distinti del
 * campo `portname`, 23 set 2026). Il filtro usa il nome; l'id serve da
 * controllo incrociato: se la fonte rinomina o rinumera un passaggio, il
 * parser se ne accorge invece di salvare il dato sotto la chiave sbagliata.
 *
 * Suez ("Suez Canal", chokepoint1) esiste nella fonte ma per ora non si
 * salva: aggiungerlo è una riga qui.
 */
export const CHOKEPOINTS = [
  { key: "hormuz", portid: "chokepoint6", portname: "Strait of Hormuz" },
  { key: "bab_el_mandeb", portid: "chokepoint4", portname: "Bab el-Mandeb Strait" },
] as const;

export type Chokepoint = (typeof CHOKEPOINTS)[number];
export type ChokepointKey = Chokepoint["key"];

export type ChokepointTransitPoint = {
  chokepoint: ChokepointKey;
  /** Giorno del dato, "AAAA-MM-GG". */
  date: string;
  /** Campo `n_total`: navi transitate quel giorno. */
  transitCalls: number;
  /** Campo `capacity`: stima della fonte, `null` se assente. */
  tradeVolumeEst: number | null;
};

/**
 * Quante righe chiedere per passaggio a ogni esecuzione: le più recenti
 * per data. La fonte pubblica una settimana alla volta e può slittare o
 * rivedere i giorni appena passati; 60 giorni coprono entrambe le cose
 * con margine e restano molto sotto il limite di 1000 righe per chiamata
 * del servizio (quindi niente paginazione da gestire).
 */
export const RECENT_RECORDS = 60;

// Campi che devono esserci in ogni riga. `capacity` è nell'elenco anche se
// il suo valore può essere null: se sparisce la CHIAVE, la fonte ha
// cambiato formato, che è una cosa diversa da "oggi non c'è la stima".
const REQUIRED_FIELDS = [
  "date",
  "year",
  "month",
  "day",
  "portid",
  "portname",
  "n_total",
  "capacity",
] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** URL della query per un passaggio: le `RECENT_RECORDS` righe più recenti. */
export function buildQueryUrl(chokepoint: Chokepoint, records = RECENT_RECORDS): string {
  const params = new URLSearchParams({
    // Stringa esatta, non LIKE: con un LIKE '%Hormuz%' una futura voce
    // "Strait of Hormuz (approach)" finirebbe mescolata a questa.
    where: `portname = '${chokepoint.portname.replace(/'/g, "''")}'`,
    outFields: "*",
    outSR: "4326",
    returnGeometry: "false",
    orderByFields: "date DESC",
    resultRecordCount: String(records),
    f: "json",
  });
  return `${QUERY_URL}?${params.toString()}`;
}

/**
 * Trasforma la risposta JSON di una query in punti pronti da salvare.
 * Lancia un errore esplicito su qualunque cosa non attesa.
 */
export function parsePortwatchResponse(
  json: unknown,
  chokepoint: Chokepoint
): ChokepointTransitPoint[] {
  const where = `PortWatch (${chokepoint.portname})`;

  if (typeof json !== "object" || json === null) {
    throw new Error(`${where}: risposta non è un oggetto JSON`);
  }
  const body = json as Record<string, unknown>;

  // ArcGIS segnala gli errori con HTTP 200 e un campo `error` nel corpo —
  // lo stesso tranello del rate limit di Alpha Vantage: controllare solo
  // lo status HTTP lo farebbe passare per una risposta valida e vuota.
  if (body.error) {
    const err = body.error as { code?: unknown; message?: unknown };
    throw new Error(
      `${where}: il servizio ha risposto con un errore (codice ${String(err.code)}: ${String(err.message)})`
    );
  }

  if (!Array.isArray(body.features)) {
    throw new Error(`${where}: la risposta non contiene l'elenco "features"`);
  }
  if (body.features.length === 0) {
    // Zero righe per un passaggio che la fonte copre non è "zero navi":
    // vuol dire che il filtro non trova più il nome o che la fonte ha un
    // problema. Non si salva niente.
    throw new Error(
      `${where}: nessuna riga restituita — il nome del passaggio è cambiato o la fonte è vuota`
    );
  }

  const points: ChokepointTransitPoint[] = [];
  const seenDates = new Set<string>();

  body.features.forEach((feature: unknown, i: number) => {
    const attrs = (feature as { attributes?: unknown })?.attributes;
    if (typeof attrs !== "object" || attrs === null) {
      throw new Error(`${where}: riga ${i} senza "attributes"`);
    }
    const a = attrs as Record<string, unknown>;

    const missing = REQUIRED_FIELDS.filter((f) => !(f in a));
    if (missing.length > 0) {
      throw new Error(`${where}: riga ${i}, campi mancanti: ${missing.join(", ")}`);
    }

    if (a.portname !== chokepoint.portname || a.portid !== chokepoint.portid) {
      throw new Error(
        `${where}: riga ${i} è di un altro passaggio — ricevuto portid=${JSON.stringify(a.portid)}, ` +
          `portname=${JSON.stringify(a.portname)}; atteso ${chokepoint.portid} / ${chokepoint.portname}`
      );
    }

    const date = parseDateOnly(a.date, a.year, a.month, a.day);
    if (!date) {
      throw new Error(
        `${where}: riga ${i}, data non riconosciuta — date=${JSON.stringify(a.date)} ` +
          `(tipo ${typeof a.date}), year/month/day=${String(a.year)}/${String(a.month)}/${String(a.day)}`
      );
    }

    // Due righe con lo stesso giorno nella stessa risposta non dovrebbero
    // esistere; se capita non scegliamo noi quale tenere. Serve anche al
    // salvataggio: due righe uguali nello stesso INSERT farebbero fallire
    // l'upsert ("cannot affect row a second time").
    if (seenDates.has(date)) {
      throw new Error(`${where}: il giorno ${date} compare due volte nella risposta`);
    }
    seenDates.add(date);

    // `n_total` deve essere un intero non negativo. Uno zero ESPLICITO è
    // un dato (quel giorno non è passato nessuno); un campo null o non
    // numerico no, e non lo trasformiamo in zero.
    const n = a.n_total;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
      throw new Error(`${where}: ${date}, n_total non valido: ${JSON.stringify(n)}`);
    }

    const cap = a.capacity;
    if (cap !== null && (typeof cap !== "number" || !Number.isFinite(cap) || cap < 0)) {
      throw new Error(`${where}: ${date}, capacity non valida: ${JSON.stringify(cap)}`);
    }

    points.push({
      chokepoint: chokepoint.key,
      date,
      transitCalls: n,
      tradeVolumeEst: cap,
    });
  });

  return points;
}

/**
 * Accetta solo "AAAA-MM-GG" e solo se coincide con i campi separati
 * `year`/`month`/`day` della stessa riga: due modi indipendenti in cui la
 * fonte scrive lo stesso giorno. Se non combaciano, uno dei due non è
 * quello che pensiamo, e la riga non si salva.
 */
export function parseDateOnly(
  date: unknown,
  year: unknown,
  month: unknown,
  day: unknown
): string | null {
  if (typeof date !== "string") return null;
  const m = ISO_DATE.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];

  // Data impossibile (es. 2026-02-31): Date la farebbe slittare al 3 marzo.
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  ) {
    return null;
  }

  if (Number(year) !== y || Number(month) !== mo || Number(day) !== d) {
    return null;
  }
  return date;
}

// ─── Storico completo (backfill) ──────────────────────────────────────────

/** Righe per pagina nel backfill: il massimo per chiamata del servizio. */
export const HISTORY_PAGE_SIZE = 1000;

// Tetto di sicurezza sulle pagine. Con ~2.800 giorni per passaggio ne
// bastano 3; se il servizio ignorasse `resultOffset` restituirebbe sempre
// la stessa pagina, e il controllo sui giorni ripetuti fra una pagina e
// l'altra lo fermerebbe — questo tetto è la seconda cintura.
const MAX_HISTORY_PAGES = 20;

/**
 * URL di una pagina dello storico: dal giorno più VECCHIO in avanti, così
 * `resultOffset` scorre su un ordine stabile. (Il cron invece chiede le
 * righe più recenti, in ordine decrescente: vedi buildQueryUrl.)
 */
export function buildHistoryPageUrl(
  chokepoint: Chokepoint,
  offset: number,
  pageSize = HISTORY_PAGE_SIZE
): string {
  const params = new URLSearchParams({
    where: `portname = '${chokepoint.portname.replace(/'/g, "''")}'`,
    outFields: "*",
    outSR: "4326",
    returnGeometry: "false",
    orderByFields: "date ASC",
    resultOffset: String(offset),
    resultRecordCount: String(pageSize),
    f: "json",
  });
  return `${QUERY_URL}?${params.toString()}`;
}

/** URL che chiede solo QUANTE righe ha la fonte per un passaggio. */
export function buildCountUrl(chokepoint: Chokepoint): string {
  const params = new URLSearchParams({
    where: `portname = '${chokepoint.portname.replace(/'/g, "''")}'`,
    returnCountOnly: "true",
    f: "json",
  });
  return `${QUERY_URL}?${params.toString()}`;
}

/**
 * Tutto lo storico di un passaggio, pagina per pagina, più il conteggio
 * dichiarato dalla fonte. Ogni pagina passa dallo STESSO parser del cron.
 *
 * Non controlla i buchi nel calendario: quello lo fa `findDateGaps`
 * (chokepointHistory.ts) a valle, perché un buco può essere un limite
 * dichiarato dalla fonte e va valutato da una persona, non trasformato
 * automaticamente in un errore o in un via libera.
 */
export async function fetchChokepointHistory(
  chokepoint: Chokepoint,
  pageSize = HISTORY_PAGE_SIZE
): Promise<{ points: ChokepointTransitPoint[]; sourceCount: number; pages: number }> {
  const where = `PortWatch (${chokepoint.portname})`;

  // Quante righe dice di avere la fonte: alla fine dev'essere lo stesso
  // numero di quelle ricevute, altrimenti la paginazione ha perso qualcosa.
  const countRes = await fetch(buildCountUrl(chokepoint), { cache: "no-store" });
  if (!countRes.ok) throw new Error(`${where}: conteggio, HTTP ${countRes.status}`);
  const countJson = (await countRes.json()) as { count?: unknown; error?: unknown };
  if (countJson.error || typeof countJson.count !== "number") {
    throw new Error(`${where}: conteggio non leggibile: ${JSON.stringify(countJson)}`);
  }
  const sourceCount = countJson.count;

  const points: ChokepointTransitPoint[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let pages = 0;

  while (true) {
    if (pages >= MAX_HISTORY_PAGES) {
      throw new Error(`${where}: più di ${MAX_HISTORY_PAGES} pagine, paginazione fuori controllo`);
    }
    const res = await fetch(buildHistoryPageUrl(chokepoint, offset, pageSize), {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${where}: pagina ${pages + 1}, HTTP ${res.status}`);
    const json = (await res.json()) as { features?: unknown[]; exceededTransferLimit?: unknown };
    pages++;

    // Pagina vuota dopo almeno una piena: lo storico è finito esattamente
    // su un multiplo della pagina. Il parser tratterebbe il vuoto come
    // errore (giusto per il cron), qui è la fine normale della lettura.
    if (Array.isArray(json.features) && json.features.length === 0 && offset > 0) break;

    const page = parsePortwatchResponse(json, chokepoint);
    for (const p of page) {
      // Il parser controlla i doppioni DENTRO una pagina; questo li
      // controlla FRA le pagine (es. un offset ignorato dal servizio).
      if (seen.has(p.date)) {
        throw new Error(`${where}: il giorno ${p.date} compare in due pagine diverse`);
      }
      seen.add(p.date);
      points.push(p);
    }
    offset += page.length;

    // Si continua finché la fonte dice che ci sono altre righe
    // (`exceededTransferLimit`) o finché le pagine arrivano piene.
    if (json.exceededTransferLimit !== true && page.length < pageSize) break;
  }

  if (points.length !== sourceCount) {
    throw new Error(
      `${where}: ricevute ${points.length} righe ma la fonte ne dichiara ${sourceCount}`
    );
  }
  return { points, sourceCount, pages };
}

/** Scarica e interpreta le righe recenti di UN passaggio. */
export async function fetchChokepointTransits(
  chokepoint: Chokepoint,
  records = RECENT_RECORDS
): Promise<ChokepointTransitPoint[]> {
  const res = await fetch(buildQueryUrl(chokepoint, records), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`PortWatch (${chokepoint.portname}): HTTP ${res.status}`);
  }
  const json: unknown = await res.json();
  return parsePortwatchResponse(json, chokepoint);
}

/**
 * Tutti i passaggi seguiti, in sequenza. Se UNO fallisce fallisce tutto il
 * run, prima di scrivere: salvare solo Hormuz senza dire che Bab el-Mandeb
 * è saltato lascerebbe un buco che in fetch_runs sembrerebbe un successo.
 */
export async function fetchAllChokepointTransits(
  records = RECENT_RECORDS
): Promise<ChokepointTransitPoint[]> {
  const all: ChokepointTransitPoint[] = [];
  for (const cp of CHOKEPOINTS) {
    all.push(...(await fetchChokepointTransits(cp, records)));
  }
  return all;
}
