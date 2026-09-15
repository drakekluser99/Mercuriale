import type { ReactNode } from "react";

/**
 * Intestazione di una sezione numerata della home (01–05).
 *
 * PERCHÉ un componente (15 set 2026): le cinque intestazioni erano scritte
 * a mano, identiche, in page.tsx. Con il nuovo colore d'accento andavano
 * cambiate tutte e cinque nello stesso modo: un solo posto evita che una
 * resti indietro.
 *
 * Il numero è un'etichetta piena CREMISI (`system-mark`) invece di un
 * "01 /" grigio. È la risposta al feedback "aggiungerei un colore in
 * contrasto, dopo il primo scroll ho notato un calo di attenzione": ogni
 * sezione ha ora un segnale che l'occhio aggancia scorrendo, e lo stesso
 * numero compare nell'indice fisso in alto (SectionNav), così si capisce
 * "sono alla 03".
 *
 * Il cremisi è STRUTTURA, non significato: non va mai usato su un prezzo,
 * perché nel sito il rosso-ruggine (`system-signal-up`) vuol dire "in
 * salita". Vedi il commento su `--color-system-mark` in globals.css.
 */
export function SectionHeading({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  /** Elementi a destra del titolo (es. pulsanti di download). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {/* `aria-hidden`: per uno screen reader il numero è rumore, il
            titolo basta. `tabular-nums` tiene uguale la larghezza di
            "01" e "04". */}
        <span
          aria-hidden="true"
          className="rounded-sm bg-system-mark px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-system-surface"
        >
          {number}
        </span>
        <h2 className="text-lg font-semibold text-system-ink">{title}</h2>
      </div>
      {children}
    </div>
  );
}
