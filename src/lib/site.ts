/**
 * Indirizzo pubblico del sito, in UN solo posto (15 set 2026).
 *
 * Prima era scritto a mano in layout.tsx, sitemap.ts e robots.ts, con un
 * commento che chiedeva di tenerli allineati. Con il riquadro "Come citare
 * questi dati" sarebbe diventato il quarto: a quel punto una costante
 * condivisa è più sicura di un promemoria. Quando arriverà il dominio
 * personalizzato si cambia solo questa riga (più l'esempio testuale in
 * metodologia/page.tsx, che è prosa).
 *
 * Senza barra finale: chi lo usa aggiunge "/percorso".
 */
export const SITE_URL = "https://commodity-tracker-one-delta.vercel.app";
