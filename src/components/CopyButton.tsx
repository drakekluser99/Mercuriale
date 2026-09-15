"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Pulsante "Copia" per un testo già pronto (usato da CiteBox).
 *
 * Client Component perché la copia negli appunti è un'API del browser
 * (`navigator.clipboard`). Riceve solo una stringa, mai funzioni: il
 * confine server→client lo permette (vedi "Errori noti" in CLAUDE.md).
 *
 * Il testo del pulsante cambia in "Copiato" per due secondi: stessa parola
 * dell'azione, al participio, così chi clicca sa che è successo davvero.
 * Se la copia fallisce (permessi negati, browser vecchio) lo dice, invece
 * di far credere che sia andata: il testo resta comunque selezionabile a
 * mano nel riquadro.
 */
export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-system-border bg-system-surface px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-system-ink-secondary transition-colors hover:border-system-accent hover:text-system-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-system-accent"
    >
      {state === "done" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {/* `aria-live`: uno screen reader annuncia il cambio di stato. */}
      <span aria-live="polite">
        {state === "done" ? "Copiato" : state === "error" ? "Copia non riuscita" : "Copia"}
      </span>
    </button>
  );
}
