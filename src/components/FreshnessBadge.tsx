import type { FreshnessState } from "@/lib/freshness/config";

/**
 * Etichetta di freschezza accanto alla data di un dato (15 set 2026).
 *
 * Prima esisteva solo scritta "a mano" dentro la tabella materie prime in
 * page.tsx; ora la usa anche la tabella carburanti, quindi vive in un
 * componente solo — stesse parole e stessi colori ovunque.
 *
 * - `aggiornato` → niente etichetta: il caso normale non ha bisogno di
 *   essere segnalato, altrimenti ogni riga ne avrebbe una e nessuna
 *   spiccherebbe;
 * - `in_attesa` → ocra (`signal-wait`): la fonte non ha ancora pubblicato
 *   il dato successivo, è normale;
 * - `non_aggiornato` → ruggine (`signal-up`): il dato è più vecchio del
 *   ritardo tollerato.
 *
 * Nessun hook e nessun "use client": funziona sia in un Server Component
 * (page.tsx) sia dentro un Client Component (FuelPriceTable).
 */
export function FreshnessBadge({
  state,
  title,
}: {
  state: FreshnessState;
  /** Spiegazione al passaggio del mouse (es. "Ultimo dato 12 giorni fa"). */
  title?: string;
}) {
  if (state === "aggiornato") return null;
  const stale = state === "non_aggiornato";
  return (
    <span
      title={title}
      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none tracking-wider ${
        stale
          ? "border-system-signal-up/40 text-system-signal-up"
          : "border-system-signal-wait/40 text-system-signal-wait"
      }`}
    >
      {stale ? "non aggiornato" : "in attesa"}
    </span>
  );
}
