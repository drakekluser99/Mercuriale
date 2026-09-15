/**
 * Carburanti in Svizzera (blocco D): dalla forma del database a quella
 * della pagina. File PURO, testabile senza database.
 */

export interface SwissFuelRow {
  fuelType: string;
  priceChf: string;
  chfPerEur: string | null;
  recordedAt: Date;
}

/** Solo dati semplici: arriva a componenti che potrebbero essere client. */
export interface SwissFuelSummary {
  /** Mese di riferimento, YYYY-MM-DD (primo del mese). */
  month: string;
  petrolChf: number | null;
  dieselChf: number | null;
  /** Franchi per 1 euro, media BCE del mese. */
  chfPerEur: number | null;
  /** Prezzi convertiti; `null` se manca il prezzo o il cambio. */
  petrolEur: number | null;
  dieselEur: number | null;
}

function toNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Da CHF a euro: il cambio BCE dice quanti franchi vale 1 euro, quindi si
 * DIVIDE. Esempio agosto 2026: 1,95 CHF / 0,9362 = 2,083 €.
 * Moltiplicare darebbe 1,83 €: un errore plausibile e quindi pericoloso,
 * per questo c'è un test apposta.
 */
export function chfToEur(chf: number | null, chfPerEur: number | null): number | null {
  if (chf === null || chfPerEur === null || chfPerEur <= 0) return null;
  return chf / chfPerEur;
}

/** `rows` = le righe dell'ultimo mese (vedi getLatestSwissFuelRows). */
export function summarizeSwissFuel(rows: SwissFuelRow[]): SwissFuelSummary | null {
  if (rows.length === 0) return null;
  const petrol = rows.find((r) => r.fuelType === "petrol");
  const diesel = rows.find((r) => r.fuelType === "diesel");
  const petrolChf = toNumber(petrol?.priceChf);
  const dieselChf = toNumber(diesel?.priceChf);
  // Stesso mese → stesso cambio: si prende quello disponibile.
  const chfPerEur = toNumber(petrol?.chfPerEur ?? diesel?.chfPerEur ?? null);
  return {
    month: rows[0].recordedAt.toISOString().slice(0, 10),
    petrolChf,
    dieselChf,
    chfPerEur,
    petrolEur: chfToEur(petrolChf, chfPerEur),
    dieselEur: chfToEur(dieselChf, chfPerEur),
  };
}

/** "2026-08-01" → "agosto 2026". */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}
