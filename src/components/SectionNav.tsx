"use client";

/**
 * Barra di navigazione fissa in alto, su tutte le pagine del sito.
 *
 * STORIA: nata il 15 set 2026 come indice delle sezioni della home (con
 * "scrollspy": evidenziava la sezione in lettura). Dal 16 set 2026 la
 * home è divisa in pagine (vedi src/lib/siteNav.ts), quindi la barra
 * porta alle PAGINE ed evidenzia quella aperta. Niente più osservazione
 * dello scroll: basta sapere l'indirizzo corrente, che `usePathname`
 * fornisce.
 *
 * Client Component solo per `usePathname`. Le icone sono definite qui
 * dentro: le funzioni non attraversano il confine server→client (vedi
 * "Errori noti" in CLAUDE.md).
 */

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Globe2,
  Calculator,
  BarChart3,
  MapPin,
  Ship,
  Percent,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { PAGE_LINKS, SECTION_PAGES } from "@/lib/siteNav";

const ICONS: Record<string, LucideIcon> = {
  "/": LayoutGrid,
  "/europa": Globe2,
  "/calcolatore": Calculator,
  "/materie-prime": BarChart3,
  "/italia": MapPin,
  "/traffico-marittimo": Ship,
  "/inflazione": Percent,
};

const ITEMS = [
  { href: "/", label: "Panoramica", number: "00" },
  ...SECTION_PAGES.map(({ href, label, number }) => ({ href, label, number })),
];

export function SectionNav() {
  const pathname = usePathname();
  const stripRef = useRef<HTMLDivElement>(null);

  // Su mobile la striscia scorre in orizzontale: portiamo in vista la voce
  // della pagina aperta, spostando solo la striscia e non la pagina.
  useEffect(() => {
    const strip = stripRef.current;
    const link = strip?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!strip || !link) return;
    const target = link.offsetLeft - (strip.clientWidth - link.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, target) });
  }, [pathname]);

  return (
    <nav
      aria-label="Sezioni del sito"
      // `sticky top-0` + fondo del chrome: si legge come la continuazione
      // dell'header. Deve stare FUORI dall'header, che ha `overflow-hidden`
      // (per HeroBackdrop) e "intrappolerebbe" l'elemento sticky.
      className="sticky top-0 z-30 border-b border-system-chrome-border bg-system-chrome text-system-chrome-ink"
    >
      <div ref={stripRef} className="mx-auto flex max-w-7xl overflow-x-auto">
        {ITEMS.map(({ href, label, number }) => {
          const Icon = ICONS[href] ?? Globe2;
          // La home è attiva solo su "/" esatto; le sezioni anche sulle
          // eventuali sotto-pagine (es. /italia/qualcosa).
          const isActive =
            href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              // `aria-current="page"`: per uno screen reader, "sei qui".
              aria-current={isActive ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-l border-l-system-chrome-border px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors first:border-l-0 hover:bg-white/[0.03] hover:text-system-chrome-accent sm:px-5 lg:px-3 ${
                isActive
                  ? "border-b-system-chrome-accent bg-white/[0.05] text-system-chrome-accent"
                  : "border-b-transparent text-system-chrome-ink-muted"
              }`}
            >
              {href !== "/" && (
                <span aria-hidden="true" className="opacity-60">
                  {number}
                </span>
              )}
              <Icon size={13} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
        {/* Pagine secondarie solo fra `sm` e `lg`: sotto `sm` sono nel
            menu, da `lg` nell'header (HeaderPageLinks, 24 set 2026 — con
            sei sezioni qui finivano fuori schermo a 1400 px). */}
        {PAGE_LINKS.map(({ href, label }, i) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={`hidden shrink-0 items-center whitespace-nowrap border-l border-system-chrome-border px-3 py-3 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors hover:text-system-chrome-accent sm:flex lg:hidden ${
              pathname === href ? "text-system-chrome-accent" : "text-system-chrome-ink-muted"
            } ${i === 0 ? "sm:ml-auto" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
