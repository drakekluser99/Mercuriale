/**
 * Nomi italiani delle materie prime (15 set 2026).
 *
 * Il database conserva il nome inglese di Alpha Vantage ("Natural Gas",
 * "Aluminum"): è il nome della FONTE e resta lì, così come resta
 * nell'export CSV/JSON e nell'API pubblica. Questa mappa serve SOLO a
 * mostrarli in italiano nella pagina (tabella, grafico, cifre chiave) —
 * stessa impostazione di countryNames.ts per i paesi.
 *
 * Chiave = simbolo (`commodities.symbol`), non il nome: il simbolo è
 * stabile, il nome inglese potrebbe cambiare a monte.
 */
export const COMMODITY_NAMES_IT: Record<string, string> = {
  WTI: "Petrolio WTI",
  BRENT: "Petrolio Brent",
  NATURAL_GAS: "Gas naturale",
  COPPER: "Rame",
  ALUMINUM: "Alluminio",
  WHEAT: "Grano",
  CORN: "Mais",
  COTTON: "Cotone",
  SUGAR: "Zucchero",
  COFFEE: "Caffè",
};

/**
 * Nome italiano di una materia prima. Se il simbolo non è in elenco (una
 * materia prima aggiunta in futuro) restituisce il nome originale: meglio
 * un nome in inglese che una riga senza nome.
 */
export function localizedCommodityName(symbol: string, fallbackName: string): string {
  return COMMODITY_NAMES_IT[symbol] ?? fallbackName;
}
