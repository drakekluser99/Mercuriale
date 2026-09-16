"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, Globe2, Calculator, BarChart3, MapPin, LayoutGrid } from "lucide-react";
import { GITHUB_URL, PAGE_LINKS, SECTION_PAGES } from "@/lib/siteNav";

// Dal 16 set 2026 le voci sono PAGINE (vedi src/lib/siteNav.ts), non più
// ancore dentro la home: il componente le legge da lì invece di
// riceverle come prop, così header di pagine diverse non devono passarle.
const ICONS: Record<string, typeof Globe2> = {
  "/": LayoutGrid,
  "/europa": Globe2,
  "/calcolatore": Calculator,
  "/materie-prime": BarChart3,
  "/italia": MapPin,
};

const items = [
  { href: "/", label: "Panoramica" },
  ...SECTION_PAGES.map(({ href, label }) => ({ href, label })),
];
const pageLinks = PAGE_LINKS;
const githubUrl = GITHUB_URL;

export default function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative sm:hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "Chiudi menu" : "Apri menu"}
        aria-expanded={open}
        /* Il pulsante vive nell'header, che dal restyling di settembre 2026
           è sul chrome scuro: usa i token `system-chrome-*`. Il pannello a
           tendina che si apre resta invece chiaro (`system-surface`), come
           le sezioni dati sotto — è contenuto da leggere, non cornice. */
        className="flex items-center justify-center rounded-md border border-system-chrome-border p-2 text-system-chrome-ink-muted transition-colors hover:border-system-chrome-accent hover:text-system-chrome-accent"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {open && (
        /* Stesso trattamento "tab bar connessa" del menu desktop, ma in
           verticale: un solo contenitore con bordo esterno unico e divisori
           sottili (border-t, first:border-t-0) fra le voci invece di
           spaziatura vuota. `overflow-hidden` ritaglia l'hover agli angoli
           arrotondati; niente padding verticale sul contenitore così i
           divisori arrivano ai bordi. Hover coerente col desktop
           (bg-system-bg + testo accent). */
        <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-lg border border-system-border bg-system-surface shadow-lg">
          {items.map(({ href, label }) => {
            const Icon = ICONS[href] ?? Globe2;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 border-t border-system-border px-4 py-2.5 text-sm text-system-ink-secondary transition-colors first:border-t-0 hover:bg-system-bg hover:text-system-accent"
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
          {pageLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block border-t border-system-border px-4 py-2.5 text-sm text-system-ink-secondary transition-colors hover:bg-system-bg hover:text-system-accent"
            >
              {label}
            </Link>
          ))}
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block border-t border-system-border px-4 py-2.5 text-sm text-system-ink-secondary transition-colors hover:bg-system-bg hover:text-system-accent"
          >
            Codice sorgente
          </a>
        </div>
      )}
    </div>
  );
}
