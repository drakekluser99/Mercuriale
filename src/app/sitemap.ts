import type { MetadataRoute } from "next";
import { EU_COUNTRY_SLUGS } from "@/lib/countries";
import { ALL_PROVINCES } from "@/lib/provinces";

// Deve combaciare con `metadataBase` in src/app/layout.tsx. Non importata da
// lì per evitare un giro di dipendenze per una singola stringa — stessa
// scelta di "scritto a mano invece di derivato" già fatta in countries.ts e
// provinces.ts. Se cambia il dominio (dominio personalizzato ancora in
// sospeso, vedi CLAUDE.md), aggiornare in entrambi i punti.
const BASE_URL = "https://commodity-tracker-one-delta.vercel.app";

/**
 * Sitemap generata a ogni richiesta e servita automaticamente su
 * /sitemap.xml — convenzione file-based di Next (App Router), nessuna route
 * scritta a mano. Include le pagine statiche più le 27 pagine paese e le 107
 * pagine provincia, prese dalle stesse liste (`EU_COUNTRY_SLUGS`,
 * `ALL_PROVINCES`) che alimentano `generateStaticParams` nelle route reali:
 * un URL sbagliato o mancante qui non può succedere senza che succeda anche
 * nel routing vero, perché la fonte è la stessa.
 *
 * `lastModified: now` solo dove è onesto — home, pagine paese e provincia,
 * il cui contenuto dipende da un cron che gira davvero ogni giorno/settimana
 * (force-dynamic). Per metodologia/glossario, che cambiano di rado, non lo
 * dichiariamo: dire "modificato adesso" ad ogni richiesta sarebbe falso.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE_URL}/stato-dati`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.4,
    },
    {
      url: `${BASE_URL}/metodologia`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/glossario`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  const countryPages: MetadataRoute.Sitemap = EU_COUNTRY_SLUGS.map((slug) => ({
    url: `${BASE_URL}/paese/${slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const provincePages: MetadataRoute.Sitemap = ALL_PROVINCES.map((p) => ({
    url: `${BASE_URL}/provincia/${p.slug}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [...staticPages, ...countryPages, ...provincePages];
}
