"use client";

/**
 * Indice delle sezioni della home, fisso in alto mentre si scorre.
 *
 * PERCHÉ ESISTE (feedback di visitatori reali, 15 set 2026): due persone
 * su tre hanno descritto lo stesso problema con parole diverse — dopo il
 * primo scroll "calo di attenzione e leggera confusione", "vorrei dei
 * richiami alle cose che sono giù". La barra di navigazione c'era già, ma
 * viveva DENTRO l'header e spariva col primo scroll: proprio quando serve
 * sapere "dove sono e quanto manca" non c'era più.
 *
 * Cosa fa:
 * 1. resta attaccata in cima alla finestra (`sticky top-0`);
 * 2. al clic la pagina scorre fino alla sezione (lo scorrimento morbido
 *    è in globals.css, `scroll-behavior: smooth`, disattivato per chi
 *    chiede meno movimento);
 * 3. evidenzia la sezione che si sta leggendo ("scrollspy"), così la
 *    barra fa anche da segnalibro: "sono alla 03 di 05".
 *
 * PERCHÉ un Client Component: il punto 3 ha bisogno di osservare lo
 * scroll nel browser, cosa che un Server Component non può fare. Le icone
 * sono definite QUI dentro e non passate da page.tsx: le funzioni (e le
 * icone lucide lo sono) non possono attraversare il confine server→client
 * (vedi "Errori noti" in CLAUDE.md).
 *
 * Nessun `opacity: 0` in attesa di JS (regola "Animazioni" di CLAUDE.md):
 * senza JavaScript la barra è comunque visibile e i link funzionano come
 * normali ancore, manca solo l'evidenziazione della sezione attiva.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Globe2,
  Calculator,
  BarChart3,
  Fuel,
  MapPin,
  type LucideIcon,
} from "lucide-react";

export interface SectionNavItem {
  /** Ancora nella stessa pagina, es. "#mappa" */
  href: string;
  label: string;
  /** Numero della sezione come appare nel titolo ("01", "02"...) */
  number: string;
}

interface Props {
  items: SectionNavItem[];
  /** Link ad altre pagine (Metodologia, Glossario, Stato dei dati) */
  pageLinks: { href: string; label: string }[];
}

// Icona per ancora. Un'ancora sconosciuta ricade su Globe2 invece di
// rompere il render: è decorazione, il testo porta già il significato.
const ICONS: Record<string, LucideIcon> = {
  "#mappa": Globe2,
  "#calcolatore": Calculator,
  "#materie-prime": BarChart3,
  "#carburanti": Fuel,
  "#province": MapPin,
};

export function SectionNav({ items, pageLinks }: Props) {
  // `null` = nessuna sezione ancora raggiunta (siamo nella parte alta,
  // sopra la 01): nessuna voce evidenziata, che è la verità.
  const [activeId, setActiveId] = useState<string | null>(null);
  // Riferimento alla striscia scorrevole, per il "segui la voce attiva"
  // qui sotto.
  const stripRef = useRef<HTMLDivElement>(null);

  // Su mobile la striscia è più larga dello schermo: quando la sezione
  // attiva cambia, portiamo la sua voce in vista. Si sposta SOLO la
  // striscia (`strip.scrollTo`), non la pagina — `scrollIntoView` sulla
  // voce muoverebbe anche lo scroll verticale mentre l'utente sta
  // leggendo. Su desktop le voci stanno tutte in riga e il calcolo dà 0:
  // non succede niente.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !activeId) return;
    const link = strip.querySelector<HTMLElement>(`a[href="#${activeId}"]`);
    if (!link) return;
    // Centra la voce nella striscia.
    const target = link.offsetLeft - (strip.clientWidth - link.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, target) });
  }, [activeId]);

  useEffect(() => {
    // Le sezioni in page.tsx sono condizionali (`{dati.length > 0 && ...}`):
    // se una manca, il suo id non esiste nel DOM. Filtriamo i `null`
    // invece di dare per scontato che ci siano tutte.
    const sections = items
      .map((item) => document.getElementById(item.href.slice(1)))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    // IntersectionObserver invece di un listener su "scroll": il browser
    // ci avvisa solo quando una sezione ENTRA o ESCE dalla fascia
    // osservata, invece di chiamarci decine di volte al secondo.
    //
    // `rootMargin: "-20% 0px -70% 0px"` restringe la fascia a una
    // striscia fra il 20% e il 30% dell'altezza della finestra: una
    // sezione è "attiva" quando il suo contenuto passa lì, cioè dove
    // l'occhio legge davvero — non appena ne spunta un pixel dal basso.
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // Se più sezioni sono nella fascia (sezioni corte), vince la
        // prima nell'ordine della pagina. Se nessuna lo è (siamo in uno
        // spazio fra due sezioni) lasciamo l'ultima attiva invece di
        // spegnere tutto: la barra non "lampeggia" durante lo scroll.
        const first = sections.find((s) => visible.has(s.id));
        if (first) setActiveId(first.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );

    sections.forEach((s) => observer.observe(s));

    // Tornati in cima, sopra la prima sezione: nessuna voce attiva.
    // Serve un controllo a parte perché la parte alta della home non è
    // una sezione osservata.
    const onScroll = () => {
      if (window.scrollY < sections[0].offsetTop - window.innerHeight * 0.3) {
        setActiveId(null);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // Pulizia: senza, a ogni rimontaggio (es. navigazione e ritorno) si
    // accumulerebbero osservatori e listener duplicati.
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [items]);

  return (
    <nav
      aria-label="Sezioni della pagina"
      // `sticky top-0`: resta in cima mentre si scorre. Funziona solo
      // perché questa <nav> NON è dentro l'header: l'header ha
      // `overflow-hidden` (serve a HeroBackdrop), che "intrappolerebbe"
      // l'elemento sticky dentro l'header stesso.
      // `z-30`: sopra tooltip e mappe delle sezioni dati quando ci
      // scorrono sotto. Stesso fondo del chrome, così si legge come la
      // continuazione dell'header e non come un blocco nuovo.
      className="sticky top-0 z-30 border-b border-system-chrome-border bg-system-chrome text-system-chrome-ink"
    >
      {/* `overflow-x-auto`: su mobile le cinque voci non stanno in una
          riga, quindi la barra scorre in orizzontale invece di andare a
          capo e raddoppiare l'altezza (una barra fissa alta ruba
          troppo spazio a uno schermo piccolo). */}
      <div ref={stripRef} className="mx-auto flex max-w-7xl overflow-x-auto">
        {items.map(({ href, label, number }) => {
          const Icon = ICONS[href] ?? Globe2;
          const isActive = activeId === href.slice(1);
          return (
            <a
              key={href}
              href={href}
              // `aria-current="location"` dice a uno screen reader quale
              // voce corrisponde al punto in cui si trova: lo stesso
              // segnale che la sottolineatura dà a chi vede.
              aria-current={isActive ? "location" : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-l border-l-system-chrome-border px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors first:border-l-0 hover:bg-white/[0.03] hover:text-system-chrome-accent sm:px-5 ${
                isActive
                  ? "border-b-system-chrome-accent bg-white/[0.05] text-system-chrome-accent"
                  : "border-b-transparent text-system-chrome-ink-muted"
              }`}
            >
              <span aria-hidden="true" className="opacity-60">
                {number}
              </span>
              <Icon size={13} aria-hidden="true" />
              {label}
            </a>
          );
        })}
        {/* Le pagine secondarie restano solo da `sm` in su: su mobile
            sono già nel menu hamburger dell'header, ripeterle qui
            allungherebbe la barra senza dare niente di nuovo. */}
        {pageLinks.map(({ href, label }, i) => (
          <Link
            key={href}
            href={href}
            className={`hidden shrink-0 items-center whitespace-nowrap border-l border-system-chrome-border px-5 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-system-chrome-ink-muted transition-colors hover:text-system-chrome-accent sm:flex ${
              i === 0 ? "sm:ml-auto" : ""
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
