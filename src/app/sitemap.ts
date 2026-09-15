import type { MetadataRoute } from "next";
import { EU_COUNTRY_SLUGS } from "@/lib/countries";
import { ALL_PROVINCES } from "@/lib/provinces";

// L'indirizzo del sito vive in src/lib/site.ts (15 set 2026): prima era
// ripetuto qui, in robots.ts e in layout.tsx, con l'obbligo di tenerli
// allineati a mano.
import { SITE_URL as BASE_URL } from "@/lib/site";

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
    {
      url: `${BASE_URL}/numeri`,
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
