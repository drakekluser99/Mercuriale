import { HISTORY_WINDOWS, type HistoryWindowKey } from "@/lib/historyWindows";

/**
 * Pulsanti del periodo (1 mese … 10 anni) con lo stato del caricamento.
 * Estratto da PriceHistoryChart il 24 set 2026, quando è servito anche al
 * grafico dei transiti: stessi pulsanti e stesse parole in entrambi.
 *
 * Nessun hook: lo stato (periodo attivo, caricamento) resta nel grafico
 * che lo usa, qui arriva solo da mostrare.
 */
export function HistoryWindowSelector({
  active,
  status,
  onSelect,
}: {
  active: HistoryWindowKey | undefined;
  status: "idle" | "loading" | "error";
  onSelect: (key: HistoryWindowKey) => void;
}) {
  return (
    <div role="group" aria-label="Periodo del grafico" className="flex flex-wrap items-center gap-1">
      {HISTORY_WINDOWS.map((w) => (
        <button
          key={w.key}
          type="button"
          onClick={() => onSelect(w.key)}
          aria-pressed={w.key === active}
          disabled={status === "loading"}
          className={`rounded px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors disabled:cursor-wait ${
            w.key === active
              ? "bg-system-ink text-system-surface"
              : "text-system-ink-secondary hover:bg-system-panel hover:text-system-ink"
          }`}
        >
          {w.label}
        </button>
      ))}
      {/* Stato del caricamento, annunciato anche agli screen reader. */}
      <span aria-live="polite" className="ml-1 text-xs text-system-ink-muted">
        {status === "loading" && "Caricamento…"}
        {status === "error" && (
          <span className="text-system-signal-up">Storico non disponibile, riprova più tardi.</span>
        )}
      </span>
    </div>
  );
}
