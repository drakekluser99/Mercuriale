/**
 * Atlante dei confini del mondo usato dalle mappe del sito (react-simple-
 * maps). Risoluzione 50m e NON 110m: la 110m omette i paesi piccoli
 * (Malta, Lussemburgo). Un solo indirizzo per tutte le mappe (24 set 2026,
 * quando alla mappa d'Europa si è aggiunta quella dei passaggi marittimi):
 * stessi confini ovunque, e il browser lo scarica una volta sola.
 */
export const WORLD_ATLAS_50M_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";
