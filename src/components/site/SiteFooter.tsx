import Link from "next/link";
import { Bug, Code2 } from "lucide-react";
import { MercurialeMark } from "@/components/MercurialeMark";
import { GITHUB_URL, SECTION_PAGES } from "@/lib/siteNav";

/**
 * Footer del sito, estratto da `app/page.tsx` il 16 set 2026 per usarlo
 * su tutte le pagine di sezione. Stesso chrome scuro dell'header.
 */
// La pagina è "incorniciata" in alto e in basso dal bruno, e le sezioni
// dati stanno nel mezzo sull'avorio. Il filo ambra è il segno di chiusura.
export function SiteFooter() {
  return (
    <footer className="mt-12 bg-system-chrome text-system-chrome-ink">
      <div className="h-0.5 bg-system-chrome-accent/50" />
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* Colonne del footer separate da divisori verticali (border-l col
            colore bordo del design system) invece che dal solo spazio
            vuoto. Attivi solo da `lg` in su, dove la griglia è a 4
            colonne su una riga sola: sotto (stack / 2 colonne) un
            border-l cadrebbe a metà di righe che vanno a capo.
            `lg:gap-x-0` + `lg:pl-8`/`lg:pr-8` danno canali uniformi con
            la linea centrata. */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-0">
          <div className="lg:pr-8">
            <p className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.18em] text-system-chrome-accent">
              <MercurialeMark size={28} className="shrink-0 text-system-chrome-accent" />
              Mercuriale
            </p>
            <p className="mt-3 text-xs leading-relaxed text-system-chrome-ink-muted">
              Progetto open source · dati pubblici, nessuna garanzia di
              accuratezza
            </p>
          </div>

          <div className="lg:border-l lg:border-system-chrome-border lg:pl-8">
            <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-system-chrome-ink-muted">
              Naviga
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link
                  href="/"
                  className="text-system-chrome-ink transition-colors hover:text-system-chrome-accent"
                >
                  Panoramica
                </Link>
              </li>
              {SECTION_PAGES.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-system-chrome-ink transition-colors hover:text-system-chrome-accent"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:border-l lg:border-system-chrome-border lg:pl-8">
            <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-system-chrome-ink-muted">
              Progetto
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link
                  href="/metodologia"
                  className="text-system-chrome-ink transition-colors hover:text-system-chrome-accent"
                >
                  Metodologia
                </Link>
              </li>
              <li>
                <Link
                  href="/glossario"
                  className="text-system-chrome-ink transition-colors hover:text-system-chrome-accent"
                >
                  Glossario
                </Link>
              </li>
              <li>
                <Link
                  href="/numeri"
                  className="text-system-chrome-ink transition-colors hover:text-system-chrome-accent"
                >
                  Numeri
                </Link>
              </li>
              <li>
                <Link
                  href="/stato-dati"
                  className="text-system-chrome-ink transition-colors hover:text-system-chrome-accent"
                >
                  Stato dei dati
                </Link>
              </li>
              <li>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-system-chrome-ink transition-colors hover:text-system-chrome-accent"
                >
                  <Code2 size={15} />
                  Codice sorgente
                </a>
              </li>
              <li>
                <a
                  href={`${GITHUB_URL}/issues/new`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-system-chrome-ink transition-colors hover:text-system-chrome-accent"
                >
                  <Bug size={15} />
                  Segnala un errore
                </a>
              </li>
            </ul>
          </div>

          <div className="lg:border-l lg:border-system-chrome-border lg:pl-8">
            <h3 className="text-xs font-mono uppercase tracking-[0.14em] text-system-chrome-ink-muted">
              Autore
            </h3>
            <p className="mt-3 text-sm">
              <a
                href="https://www.linkedin.com/in/yuri-copparini"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-system-chrome-ink transition-colors hover:text-system-chrome-accent"
              >
                <LinkedinGlyph size={15} />
                Yuri Copparini
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

// Glifo LinkedIn inline: la versione di lucide-react installata (1.34.0)
// non include icone di brand, quindi non c'è `<Linkedin />` da importare.
// `fill="currentColor"` così eredita il colore del link (grigio → accent
// in hover) come le icone lucide del resto della pagina.
function LinkedinGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}
