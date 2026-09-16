import type { ReactNode } from "react";
import Link from "next/link";
import { Code2 } from "lucide-react";
import MobileNav from "@/components/MobileNav";
import { MercurialeMark } from "@/components/MercurialeMark";
import { HeroBackdrop } from "@/components/HeroBackdrop";
import { SectionNav } from "@/components/SectionNav";
import { GITHUB_URL } from "@/lib/siteNav";

/**
 * Header del sito (chrome scuro) + barra di navigazione fissa.
 *
 * Estratto da `app/page.tsx` il 16 set 2026, quando la home è stata
 * divisa in pagine: la stessa cornice serve a tutte le pagine di sezione.
 * Il racconto delle scelte visive (wordmark maiuscolo, filigrana del
 * Brent, cursore) è rimasto nei commenti qui sotto e in CLAUDE.md.
 *
 * Props:
 * - `title` / `intro`: l'h1 e la frase sotto, diversi per ogni pagina
 *   (l'h1 descrive il CONTENUTO, il nome del sito non è un heading);
 * - `backdropPoints`: la curva del Brent in filigrana (solo in home);
 * - `children`: cosa mettere in fondo all'header (la fascia di valori,
 *   solo in home).
 */
export function SiteHeader({
  title,
  intro,
  backdropPoints,
  children,
}: {
  title: string;
  intro: ReactNode;
  backdropPoints?: { date: string; value: number }[];
  children?: ReactNode;
}) {
  return (
    <>
      <header className="relative overflow-hidden bg-system-chrome text-system-chrome-ink">
        {/* Curva reale del Brent in filigrana, nascosta sotto `sm` (su uno
            schermo stretto e alto si deforma). Vedi HeroBackdrop.tsx. */}
        {backdropPoints && (
          <HeroBackdrop points={backdropPoints} className="hidden sm:block" />
        )}

        <div className="relative mx-auto max-w-7xl px-6 pb-8 pt-10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {/* Wordmark: un <p> e non un heading, vedi sopra. Il
                  maiuscolo spaziato richiama i listini delle Camere di
                  Commercio da cui viene il nome. È anche il link alla
                  panoramica, come in quasi tutti i siti. */}
              <Link href="/" className="flex items-center gap-3">
                <MercurialeMark
                  size={38}
                  className="shrink-0 text-system-chrome-accent"
                />
                <p className="text-[30px] font-semibold uppercase tracking-[0.03em] text-system-chrome-ink sm:text-4xl sm:tracking-[0.06em] lg:text-5xl">
                  Mercuriale
                </p>
              </Link>
              <p className="mt-1.5 ml-[50px] font-mono text-[11px] uppercase tracking-[0.18em] text-system-chrome-accent">
                Osservatorio aperto · dati pubblici
                {/* Cursore del terminale: rumore per uno screen reader, e
                    non deve finire in un copia-incolla. */}
                <span
                  aria-hidden="true"
                  className="animate-caret ml-1 inline-block select-none"
                >
                  _
                </span>
              </p>
              <h1 className="mt-5 text-lg font-medium text-system-chrome-ink sm:text-xl">
                {title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-system-chrome-ink-muted">
                {intro}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden items-center gap-2 rounded-md border border-system-chrome-border px-3 py-2 font-mono text-xs uppercase tracking-wider text-system-chrome-ink-muted transition-colors hover:border-system-chrome-accent hover:text-system-chrome-accent sm:flex"
              >
                <Code2 size={15} />
                Codice sorgente
              </a>
              <MobileNav />
            </div>
          </div>
        </div>

        {children}
      </header>

      {/* Fuori dall'header: dentro, `overflow-hidden` romperebbe `sticky`. */}
      <SectionNav />
    </>
  );
}
