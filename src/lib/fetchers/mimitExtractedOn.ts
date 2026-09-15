/**
 * Legge la data dalla prima riga del file prezzi MIMIT ("Estrazione del
 * ...") e la trasforma in una Date a mezzanotte UTC: è la data DEL DATO
 * (`recordedAt`), non il momento in cui l'abbiamo scaricato.
 *
 * STORIA DEL BUG (15 set 2026): la prima versione cercava solo il formato
 * italiano `gg/mm/aaaa`, scritto senza aver mai visto la riga vera. Il file
 * reale dice invece "Estrazione del 2026-09-14" (formato ISO,
 * anno-mese-giorno). La lettura falliva sempre e il chiamante ripiegava in
 * silenzio su "adesso": ogni esecuzione salvava 214 righe con l'orario del
 * download come data, e il vincolo unico (provincia, carburante, data) non
 * scattava mai perché l'orario cambiava a ogni giro → righe doppie.
 *
 * Due scelte:
 * 1. Accettiamo ENTRAMBI i formati. L'ISO è quello osservato oggi;
 *    `gg/mm/aaaa` resta perché è plausibile che il MIMIT lo usi (lo usava
 *    per altri campi) e non costa nulla.
 * 2. Funzione PURA, in un file senza import del database, così i test
 *    Vitest la possono chiamare senza bisogno di DATABASE_URL.
 *
 * Ritorna `null` se non riconosce la riga: decide il chiamante cosa fare,
 * e in saveMimitPrices la risposta è FERMARSI, non inventare una data.
 */
export function parseExtractedOn(line: string | null): Date | null {
  if (!line) return null;

  // Formato ISO: 2026-09-14. `\b` (confine di parola) evita di pescare
  // quattro cifre in mezzo a un numero più lungo.
  const iso = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  // Formato italiano: 14/09/2026.
  const it = line.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);

  let year: number, month: number, day: number;
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (it) {
    [day, month, year] = [Number(it[1]), Number(it[2]), Number(it[3])];
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  // `Date.UTC` non protesta per date impossibili: il 31/02 diventa il 3
  // marzo. Controlliamo che giorno e mese siano rimasti quelli letti,
  // altrimenti la riga non era una data valida.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}
