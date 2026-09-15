import type { MetadataRoute } from "next";

import { SITE_URL as BASE_URL } from "@/lib/site";

/**
 * robots.txt generato a ogni richiesta e servito automaticamente su
 * /robots.txt — stessa convenzione file-based di sitemap.ts, nessuna route
 * scritta a mano.
 *
 * Tutto permesso tranne `/api/`: sono i cron (protetti comunque da
 * CRON_SECRET, vedi cronAuth.ts) e l'endpoint dati interno — non contenuto
 * da indicizzare, e non ha senso invitare un crawler a bussare lì.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
