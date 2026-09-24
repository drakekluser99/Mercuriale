import type { ReactNode } from "react";
import { CiteBox } from "@/components/CiteBox";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { formatDate } from "@/lib/format";

/**
 * Cornice comune delle pagine del sito (16 set 2026): header con barra di
 * navigazione, contenuto, "Come citare" e footer. Ogni pagina di sezione
 * passa solo il suo titolo, la sua introduzione e il contenuto.
 *
 * `consultedOn` per la citazione arriva dalla pagina (già formattato): la
 * data "di consultazione" è quella della richiesta.
 */
export function PageShell({
  title,
  intro,
  backLink,
  consultedOn,
  backdropPoints,
  headerExtra,
  children,
}: {
  title: string;
  intro: ReactNode;
  backLink?: { href: string; label: string };
  consultedOn: Date;
  backdropPoints?: { date: string; value: number }[];
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-system-bg text-system-ink">
      <SiteHeader
        title={title}
        intro={intro}
        backLink={backLink}
        backdropPoints={backdropPoints}
      >
        {headerExtra}
      </SiteHeader>
      <main className="mx-auto max-w-7xl px-6 py-10">
        {children}
        {/* "Come citare": in fondo, per chi ha già trovato il suo numero. */}
        <CiteBox consultedOn={formatDate(consultedOn)} />
      </main>
      <SiteFooter />
    </div>
  );
}

/** Riquadro "nessun dato ancora", condiviso dalle pagine di sezione. */
export function EmptyState({ label }: { label: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-system-border bg-system-surface px-4 py-8 text-center text-sm text-system-ink-muted">
      {label}
    </div>
  );
}

export const NO_DATA_YET =
  "Nessun dato ancora. Il cron job non è ancora girato per questa fonte.";
