/**
 * Struttura del sito — un solo posto (16 set 2026).
 *
 * PERCHÉ: fino al 15 settembre la home era un'unica pagina lunga con cinque
 * sezioni. Una recensione ha segnalato "troppo testo per una sola pagina"
 * e suggerito "più route, una per sezione". Ora ogni area ha la sua
 * pagina e la home è una panoramica con le cifre chiave e i link.
 *
 * Qui vivono l'elenco delle pagine di sezione (indice fisso, menu mobile,
 * footer, sitemap) e i link secondari. Chi aggiunge una pagina la
 * aggiunge QUI e compare ovunque.
 *
 * Le icone NON sono qui: sono funzioni (componenti lucide) e questo file è
 * letto anche da Server Components che passano i dati a Client
 * Components. Ogni componente di navigazione mappa `href` → icona da sé.
 */

export interface SectionPage {
  href: string;
  /** Etichetta corta, per la barra e il menu. */
  label: string;
  /** Titolo completo della pagina (h1). */
  title: string;
  /** Numero della sezione, come nei titoli ("01"). */
  number: string;
}

export const SECTION_PAGES: readonly SectionPage[] = [
  {
    href: "/europa",
    label: "Carburanti in Europa",
    title: "Prezzo dei carburanti in Europa",
    number: "01",
  },
  {
    href: "/calcolatore",
    label: "Cosa significa",
    title: "Cosa significa in pratica",
    number: "02",
  },
  {
    href: "/materie-prime",
    label: "Materie prime",
    title: "Materie prime globali",
    number: "03",
  },
  {
    href: "/italia",
    label: "Province italiane",
    title: "Carburanti in Italia, provincia per provincia",
    number: "04",
  },
];

/** Pagine secondarie (metodo, glossario...). */
export const PAGE_LINKS = [
  { href: "/metodologia", label: "Metodologia" },
  { href: "/glossario", label: "Glossario" },
  { href: "/numeri", label: "Numeri" },
  { href: "/stato-dati", label: "Stato dei dati" },
] as const;

export const GITHUB_URL = "https://github.com/drakekluser99/commodity-tracker";

export function sectionPage(href: string): SectionPage {
  const page = SECTION_PAGES.find((p) => p.href === href);
  if (!page) throw new Error(`Pagina di sezione sconosciuta: ${href}`);
  return page;
}
