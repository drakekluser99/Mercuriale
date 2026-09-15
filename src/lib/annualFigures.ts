import { formatBillionsEur } from "./format";
import type { SourceId } from "./sources";

/**
 * "NUMERO DEL GIORNO" — ultima voce della Fase 3 della roadmap del 3
 * settembre 2026. Dal 15 set 2026 (blocco D) è una RACCOLTA: più cifre,
 * una al giorno in home a rotazione, tutte insieme su /numeri. Il
 * commento qui sotto racconta la scelta della prima cifra (ADM) e resta
 * valido per lei.
 *
 * Cosa NON è: non un cron, non una tabella, non un valore ricalcolato a
 * ogni visita. È l'esatto opposto delle altre fonti del sito — quelle
 * pubblicano ogni giorno o settimana e il sito le insegue; questa la
 * pubblica un ente pubblico UNA VOLTA L'ANNO (il bilancio dell'attività
 * dell'Agenzia delle Dogane e dei Monopoli), e il sito la cita, non la
 * ricalcola.
 *
 * Perché un file a parte e non una riga in `sources.ts`: `sources.ts`
 * descrive le FONTI (chi pubblica), questo file descrive il DATO stesso
 * (cosa dice quella fonte quest'anno) — sono due cose diverse che cambiano
 * a ritmi diversi. Nato come oggetto singolo; diventato un array
 * il 15 set 2026, quando le cifre sono diventate più di una.
 *
 * Perché questo valore e non un altro: la ricerca per questa feature ha
 * trovato due candidati verificabili — 39 miliardi € (accise specifiche
 * su benzina+gasolio, fonte: Annuario Statistico ACI 2025, che però non
 * dichiara la propria fonte primaria) e questo, 26,7 miliardi € (accisa
 * sui "prodotti energetici", categoria fiscale più ampia di benzina/
 * gasolio ma con FONTE DIRETTA istituzionale — esattamente il tipo di
 * fonte primaria che il resto del sito privilegia, vedi sources.ts).
 * Scelto il secondo: meno "pulito" nello scope, ma la fonte è quella
 * giusta, non un intermediario.
 *
 * MANUTENZIONE: questo dato NON si aggiorna da solo. L'Agenzia delle
 * Dogane pubblica il bilancio dell'attività dell'anno precedente ogni
 * primavera (i due comunicati trovati durante la ricerca sono di
 * maggio 2025 e maggio 2026) — è il momento giusto per controllare se è
 * uscito un numero più recente e aggiornare questo oggetto a mano.
 * `year` è quello che va in etichetta sul sito: se questo file non viene
 * toccato per anni, `year` resta ferma e la pagina continua a dirlo
 * onestamente ("dati 2024") invece di far sembrare il numero più fresco
 * di quanto sia — è esattamente l'errore, isolato nell'analisi
 * competitor, che questa struttura vuole evitare (un numero statico
 * spacciato per vivo).
 */
/**
 * Come si mostra il valore. Un'unione "discriminata" (il campo `kind`
 * dice quale forma ha l'oggetto): TypeScript obbliga a gestire tutti i
 * casi in `formatFigureValue`, e aggiungere un'unità nuova senza
 * formattarla diventa un errore di compilazione, non un numero stampato
 * male in pagina.
 */
export type FigureValue =
  | { kind: "eur"; amount: number } // euro, unità base (non miliardi)
  | { kind: "percent"; amount: number }; // 57 = 57%

export interface AnnualFigure {
  /** Identificatore stabile (ancora #id su /numeri). */
  id: string;
  value: FigureValue;
  /** Frase completa, pronta per la UI, con il contesto minimo perché il
   *  numero non sembri più preciso o più ampio di quanto dica la fonte. */
  headline: string;
  /** Versione breve (poche parole) per gli elenchi compatti, es. la
   *  colonna "Altri numeri" in home. Deve reggersi da sola accanto al
   *  valore: "energia UE importata, 2024". */
  shortLabel: string;
  /** Anno CUI SI RIFERISCE il dato, non quello di pubblicazione — stessa
   *  distinzione recordedAt/retrievedAt dello schema del database. */
  year: number;
  sourceId: SourceId;
  /** Nome del documento, per la nota "Fonte:". */
  sourceTitle: string;
  /** Pagina della fonte. adm.gov.it blocca il fetch automatico, ma da un
   *  browser normale si apre: è comunque il link giusto per il lettore. */
  sourceUrl: string;
  /** Mese di pubblicazione della fonte (AAAA-MM), per sapere quando
   *  cercare l'edizione successiva. Il mese e non il giorno: per il
   *  comunicato ADM conosciamo solo il mese, e un giorno inventato
   *  sembrerebbe un dato. */
  publishedIn: string;
}

/**
 * Le cifre. Regole per aggiungerne una:
 * - fonte primaria istituzionale, con pagina pubblica da citare;
 * - il valore si copia dalla fonte, non si ricalcola;
 * - la frase dice esattamente cosa misura (unità, perimetro, anno).
 *
 * Le quattro di Eurostat sono state lette sui comunicati il 15 set 2026.
 */
export const ANNUAL_FIGURES: readonly AnnualFigure[] = [
  {
    id: "accise-energetici-italia",
    value: { kind: "eur", amount: 26_700_000_000 },
    headline:
      "Nel 2024 le accise sui prodotti energetici (benzina, gasolio e gli altri carburanti) hanno portato all'Erario italiano 26,7 miliardi di euro — l'86% di quanto lo Stato incassa complessivamente dalle Accise energie, il resto viene da gas naturale, energia elettrica e alcolici.",
    shortLabel: "accise sui prodotti energetici incassate in Italia",
    year: 2024,
    sourceId: "adm",
    sourceTitle: "Agenzia delle Dogane e dei Monopoli, bilancio dell'attività",
    sourceUrl:
      "https://www.adm.gov.it/portale/en/gli-stati-generali-dell-agenzia-delle-dogane-e-dei-monopoli-2025",
    publishedIn: "2025-05",
  },
  {
    id: "dipendenza-energetica-ue",
    value: { kind: "percent", amount: 57 },
    headline:
      "Nel 2024 l'Unione Europea ha coperto con importazioni nette il 57% del proprio fabbisogno di energia. I paesi più dipendenti sono Malta (98%), Lussemburgo (91%) e Cipro (88%); i meno dipendenti Estonia (5%), Svezia (27%) e Lettonia (29%).",
    shortLabel: "dell'energia UE coperta da importazioni",
    year: 2024,
    sourceId: "eurostat",
    sourceTitle: "Eurostat, «Energy in Europe: imports dependency»",
    sourceUrl:
      "https://ec.europa.eu/eurostat/web/products-eurostat-news/w/wdn-20260318-1",
    publishedIn: "2026-03",
  },
  {
    id: "petrolio-su-import-energia-ue",
    value: { kind: "percent", amount: 67 },
    headline:
      "Delle importazioni di energia dell'Unione Europea nel 2024, il 67% era petrolio e prodotti petroliferi: più di gas, carbone e tutto il resto messi insieme.",
    shortLabel: "delle importazioni di energia UE è petrolio",
    year: 2024,
    sourceId: "eurostat",
    sourceTitle: "Eurostat, «Energy in Europe: imports dependency»",
    sourceUrl:
      "https://ec.europa.eu/eurostat/web/products-eurostat-news/w/wdn-20260318-1",
    publishedIn: "2026-03",
  },
  {
    id: "tasse-energia-ue",
    value: { kind: "eur", amount: 287_000_000_000 },
    headline:
      "Nel 2024 i paesi dell'Unione Europea hanno incassato 287 miliardi di euro di imposte sull'energia (carburanti compresi): la voce principale delle imposte ambientali, che in totale valgono 371,9 miliardi.",
    shortLabel: "di imposte sull'energia incassate nell'UE",
    year: 2024,
    sourceId: "eurostat",
    sourceTitle: "Eurostat, «EU environmental tax revenue up 6.1% in 2024»",
    sourceUrl:
      "https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20260722-1",
    publishedIn: "2026-07",
  },
  {
    id: "merci-su-strada-ue",
    value: { kind: "percent", amount: 25.7 },
    headline:
      "Nel 2024 il 25,7% del trasporto merci nel territorio UE (misurato in tonnellate-chilometro) è avvenuto su strada, cioè su camion che vanno a gasolio. È l'unica modalità cresciuta in dieci anni (+3,3 punti dal 2014); il mare resta la prima con il 67,0%.",
    shortLabel: "delle merci nell'UE viaggia su strada",
    year: 2024,
    sourceId: "eurostat",
    sourceTitle: "Eurostat, «25% of goods transported by road in the EU»",
    sourceUrl:
      "https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20260326-1",
    publishedIn: "2026-03",
  },
];

const percentFormat = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

export function formatFigureValue(value: FigureValue): string {
  switch (value.kind) {
    case "eur":
      return formatBillionsEur(value.amount);
    case "percent":
      return `${percentFormat.format(value.amount)}%`;
  }
}

/**
 * Forma corta per gli elenchi stretti: "26,7 mld €" invece di
 * "26,7 miliardi di €", che in una colonna da 7 rem andrebbe a capo.
 */
export function formatFigureValueShort(value: FigureValue): string {
  switch (value.kind) {
    case "eur":
      return `${percentFormat.format(value.amount / 1_000_000_000)} mld €`;
    case "percent":
      return formatFigureValue(value);
  }
}

/**
 * La cifra del giorno: ruota una volta al giorno, sempre nello stesso
 * ordine, uguale per tutti i visitatori.
 *
 * Come: contiamo i giorni passati dal 1° gennaio 1970 e prendiamo il
 * resto della divisione per il numero di cifre (`%`, "modulo"): 0, 1, 2,
 * … e poi di nuovo 0. Niente numeri casuali: con `Math.random()` due
 * visitatori vedrebbero cifre diverse e la pagina cambierebbe a ogni
 * ricarica, che non è un "numero del giorno".
 *
 * Il giorno è quello di ROMA, non quello del server (Vercel gira in UTC):
 * altrimenti la cifra cambierebbe all'una o alle due di notte italiane.
 */
export function figureOfTheDay(
  now: Date,
  figures: readonly AnnualFigure[] = ANNUAL_FIGURES,
): AnnualFigure {
  if (figures.length === 0) throw new Error("Nessuna cifra nella raccolta");
  // "en-CA" formatta come AAAA-MM-GG: comodo da rileggere come data.
  const romeDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
  }).format(now);
  const dayNumber = Math.floor(Date.parse(`${romeDay}T00:00:00Z`) / 86_400_000);
  return figures[dayNumber % figures.length];
}

/**
 * Le altre cifre, nell'ordine in cui arriveranno nei prossimi giorni
 * (quella di domani per prima). Per la colonna "Altri numeri" in home.
 */
export function otherFigures(
  current: AnnualFigure,
  figures: readonly AnnualFigure[] = ANNUAL_FIGURES,
): AnnualFigure[] {
  const i = figures.findIndex((f) => f.id === current.id);
  // `slice` + concatenazione = "ruota" l'array partendo da dopo la cifra
  // di oggi, poi toglie quella di oggi (che resterebbe in fondo).
  return [...figures.slice(i + 1), ...figures.slice(0, i)];
}
