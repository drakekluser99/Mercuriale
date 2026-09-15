import ExcelJS from "exceljs";

/**
 * Carburanti in Svizzera — blocco D, parte 3 (15 set 2026).
 *
 * DUE FONTI, entrambe istituzionali e aperte:
 *
 * 1. BFS (Ufficio federale di statistica), tabella "LIK,
 *    Durchschnittspreise für Energie und Treibstoffe", numero BFS
 *    su-d-05.02.91, licenza OPEN-BY. Prezzi medi MENSILI in CHF al litro.
 * 2. BCE, cambio di riferimento franco/euro, media MENSILE
 *    (serie EXR.M.CHF.EUR.SP00.A). Stessa cadenza dei prezzi: il prezzo
 *    medio di agosto si converte con il cambio medio di agosto.
 *
 * COME SI TROVA IL FILE BFS (verificato il 15/9 da un browser)
 *
 * L'indirizzo del file cambia a ogni pubblicazione mensile
 * (`/asset/de/<numero>`), quindi non si può scrivere fisso. L'API del
 * catalogo BFS restituisce tutte le versioni di una tabella dato il suo
 * numero BFS; quella in vigore ha `lifecycle.code = "CURRENT"`, le altre
 * "OLD". Il file si scarica da `/assets/<damId>/master`.
 *
 * LAYOUT OSSERVATO (versione del 3 set 2026, dati fino ad agosto 2026)
 *
 *   Fogli: "Monat - Mois" (mensile), "Jahr - Année", "Info".
 *   Righe 1-3: titoli. Riga 4: gruppi (Gas, Elettricità, Heizöl, ...,
 *   "Treibstoff / Carburants"). Riga 5: prodotti, fra cui
 *   "Bleifrei 95 / sans plomb 95" e "Diesel". Riga 6: unità ("1 l").
 *   Dalla riga 7: colonna A = mese (data Excel formattata mm/yyyy, primo
 *   giorno del mese, da gennaio 1993), poi i prezzi.
 *   In fondo ci sono righe con il mese ma SENZA prezzi (i mesi futuri
 *   dell'anno in corso) e una riga "Quelle: LIK": vanno scartate.
 *   Valori di agosto 2026: benzina 95 = 1,95 CHF, diesel = 2,18 CHF.
 *
 * Il parser cerca le colonne per NOME nella riga dei prodotti, non per
 * posizione, e controlla che l'unità sia "1 l": se il BFS aggiunge una
 * colonna il codice regge, se cambia unità si ferma con un errore chiaro.
 */

const BFS_ORDER_NR = "su-d-05.02.91";
const BFS_API = "https://dam-api.bfs.admin.ch/hub/api/dam/assets";
const MONTH_SHEET = "Monat - Mois";

const ECB_SERIES_URL =
  "https://data-api.ecb.europa.eu/service/data/EXR/M.CHF.EUR.SP00.A";

export interface SwissFuelPoint {
  fuelType: "petrol" | "diesel";
  /** CHF al litro, come nella fonte. */
  priceChf: number;
  /** Franchi per 1 euro, media BCE del mese; `null` se non ancora uscita. */
  chfPerEur: number | null;
  /** Primo giorno del mese, YYYY-MM-DD. */
  month: string;
}

export interface SwissFuelOptions {
  /** Primo mese da includere, YYYY-MM-DD (confronto fra stringhe). */
  fromMonth?: string;
  /** Solo l'ultimo mese con prezzi. */
  latestOnly?: boolean;
}

// ─── BFS ────────────────────────────────────────────────────────────────

interface BfsAsset {
  ids: { damId: number };
  bfs: { embargo: string; lifecycle: { code: string } };
}

/** Il `damId` della versione in vigore della tabella. */
export async function findCurrentBfsAssetId(): Promise<number> {
  const res = await fetch(`${BFS_API}?orderNr=${BFS_ORDER_NR}&language=de`);
  if (!res.ok) throw new Error(`Catalogo BFS: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: BfsAsset[] };
  return pickCurrentAsset(body.data ?? []);
}

/**
 * Fra le versioni, quella "CURRENT"; se per qualche motivo fossero più
 * d'una, la pubblicata più di recente. Esportata per i test.
 */
export function pickCurrentAsset(assets: BfsAsset[]): number {
  const current = assets
    .filter((a) => a.bfs?.lifecycle?.code === "CURRENT")
    .sort((a, b) => b.bfs.embargo.localeCompare(a.bfs.embargo));
  if (current.length === 0) {
    throw new Error(
      `Nessuna versione "CURRENT" della tabella BFS ${BFS_ORDER_NR} ` +
        `(${assets.length} versioni trovate).`
    );
  }
  return current[0].ids.damId;
}

export async function downloadBfsWorkbook(damId: number): Promise<ExcelJS.Workbook> {
  const res = await fetch(`${BFS_API}/${damId}/master`);
  if (!res.ok) throw new Error(`Download tabella BFS ${damId}: HTTP ${res.status}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await res.arrayBuffer());
  return workbook;
}

export interface BfsMonthlyPrice {
  fuelType: "petrol" | "diesel";
  priceChf: number;
  month: string; // YYYY-MM-01
}

const PRODUCT_HEADERS: Record<"petrol" | "diesel", RegExp> = {
  petrol: /^Bleifrei 95\b/,
  diesel: /^Diesel$/,
};

/** Legge i prezzi mensili di benzina 95 e diesel dal foglio mensile. */
export function parseBfsWorkbook(
  workbook: ExcelJS.Workbook,
  options: SwissFuelOptions = {}
): BfsMonthlyPrice[] {
  const sheet = workbook.getWorksheet(MONTH_SHEET);
  if (!sheet) {
    throw new Error(
      `Foglio "${MONTH_SHEET}" assente nella tabella BFS. Fogli: ` +
        workbook.worksheets.map((w) => w.name).join(", ")
    );
  }

  // Passo 1: la riga dei prodotti, cercata nelle prime 10 righe invece di
  // darla per scontata alla 5.
  let headerRowNumber: number | null = null;
  const columns: Partial<Record<"petrol" | "diesel", number>> = {};
  for (let r = 1; r <= 10 && headerRowNumber === null; r++) {
    sheet.getRow(r).eachCell((cell, col) => {
      const text = String(cell.value ?? "").trim();
      for (const fuel of ["petrol", "diesel"] as const) {
        if (PRODUCT_HEADERS[fuel].test(text)) {
          columns[fuel] = col;
          headerRowNumber = r;
        }
      }
    });
  }
  if (headerRowNumber === null || !columns.petrol || !columns.diesel) {
    throw new Error(
      'Colonne "Bleifrei 95" e/o "Diesel" non trovate nella tabella BFS: il formato potrebbe essere cambiato.'
    );
  }

  // Passo 2: l'unità, nella riga subito sotto. Se non è più "1 l" il
  // numero non sarebbe un prezzo al litro: meglio fermarsi.
  const unitRow = sheet.getRow(headerRowNumber + 1);
  for (const fuel of ["petrol", "diesel"] as const) {
    const unit = String(unitRow.getCell(columns[fuel]!).value ?? "").trim();
    if (unit !== "1 l") {
      throw new Error(`Unità inattesa per ${fuel} nella tabella BFS: "${unit}" (attesa "1 l").`);
    }
  }

  // Passo 3: le righe di dati. Una riga vale se la colonna A è un mese;
  // i mesi futuri senza prezzi vengono saltati perché le celle sono vuote.
  const rows: BfsMonthlyPrice[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber! + 1) return;
    const month = asMonthStart(row.getCell(1).value);
    if (!month) return;
    for (const fuel of ["petrol", "diesel"] as const) {
      const value = row.getCell(columns[fuel]!).value;
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        rows.push({ fuelType: fuel, priceChf: value, month });
      }
    }
  });

  let months = [...new Set(rows.map((r) => r.month))].sort();
  if (options.fromMonth) months = months.filter((m) => m >= options.fromMonth!);
  if (options.latestOnly) months = months.slice(-1);
  const wanted = new Set(months);
  return rows.filter((r) => wanted.has(r.month));
}

/**
 * La colonna del mese arriva da ExcelJS come Date (cella formattata come
 * data) oppure come numero seriale Excel se il formato non viene
 * riconosciuto. Si accettano entrambi e si riporta al primo del mese.
 */
function asMonthStart(raw: ExcelJS.CellValue): string | null {
  let date: Date | null = null;
  if (raw instanceof Date) date = raw;
  // Seriale Excel: giorni dal 30/12/1899. 20000 ≈ anno 1954: sotto quella
  // soglia un numero non è una data plausibile per questa tabella.
  else if (typeof raw === "number" && raw > 20000 && raw < 80000) {
    date = new Date(Date.UTC(1899, 11, 30) + raw * 86_400_000);
  }
  if (!date || Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

// ─── BCE ────────────────────────────────────────────────────────────────

/** Mese "YYYY-MM-01" → franchi per 1 euro (media mensile BCE). */
export async function fetchEcbChfPerEur(fromMonth: string): Promise<Map<string, number>> {
  const start = fromMonth.slice(0, 7); // la BCE vuole YYYY-MM
  const res = await fetch(`${ECB_SERIES_URL}?startPeriod=${start}&format=csvdata`);
  if (!res.ok) throw new Error(`Cambio BCE CHF/EUR: HTTP ${res.status}`);
  return parseEcbCsv(await res.text());
}

/**
 * Il CSV della BCE ha un'intestazione con i nomi delle colonne: si cercano
 * TIME_PERIOD e OBS_VALUE per nome. Alcuni campi di testo in fondo alla
 * riga contengono virgole fra virgolette, quindi serve uno split che
 * rispetti le virgolette.
 */
export function parseEcbCsv(csv: string): Map<string, number> {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) throw new Error("Cambio BCE: risposta vuota.");
  const header = splitCsvLine(lines[0]);
  const periodCol = header.indexOf("TIME_PERIOD");
  const valueCol = header.indexOf("OBS_VALUE");
  if (periodCol < 0 || valueCol < 0) {
    throw new Error("Cambio BCE: colonne TIME_PERIOD/OBS_VALUE assenti.");
  }
  const rates = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const period = cells[periodCol];
    const value = Number(cells[valueCol]);
    if (/^\d{4}-\d{2}$/.test(period ?? "") && Number.isFinite(value) && value > 0) {
      rates.set(`${period}-01`, value);
    }
  }
  return rates;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Due virgolette di seguito dentro un campo = una virgoletta vera.
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

// ─── Insieme ────────────────────────────────────────────────────────────

/** Unisce prezzi e cambi: il cambio del mese giusto, o `null`. */
export function joinWithRates(
  prices: BfsMonthlyPrice[],
  rates: Map<string, number>
): SwissFuelPoint[] {
  return prices.map((p) => ({ ...p, chfPerEur: rates.get(p.month) ?? null }));
}

export async function fetchSwissFuelPrices(
  options: SwissFuelOptions = {}
): Promise<SwissFuelPoint[]> {
  const damId = await findCurrentBfsAssetId();
  const prices = parseBfsWorkbook(await downloadBfsWorkbook(damId), options);
  if (prices.length === 0) return [];
  const firstMonth = prices.map((p) => p.month).sort()[0];
  const rates = await fetchEcbChfPerEur(firstMonth);
  return joinWithRates(prices, rates);
}
