"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGE_LINKS } from "@/lib/siteNav";

/**
 * Le pagine secondarie (Metodologia, Glossario, Numeri, Stato dei dati)
 * nell'header, sotto "Codice sorgente", da `lg` in su (24 set 2026).
 *
 * Prima stavano in fondo alla barra delle sezioni, ma con la sezione 05
 * la barra aveva superato i 1280 px e con la 06 le quattro pagine
 * finivano fuori schermo a 1400 px (misurato: 1740 px di voci). Qui non
 * competono con le sezioni. Sotto `lg` restano in fondo alla barra (che lì
 * scorre comunque) e sotto `sm` nel menu del telefono.
 *
 * Client Component solo per `usePathname`: la pagina aperta è evidenziata
 * come nella barra (`aria-current="page"`).
 */
export function HeaderPageLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Pagine del progetto" className="hidden lg:block">
      <ul className="flex items-center">
        {PAGE_LINKS.map(({ href, label }, i) => (
          <li key={href} className={i > 0 ? "border-l border-system-chrome-border" : undefined}>
            <Link
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={`block px-3 py-1 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors hover:text-system-chrome-accent ${
                pathname === href ? "text-system-chrome-accent" : "text-system-chrome-ink-muted"
              }`}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
