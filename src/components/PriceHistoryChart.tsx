"use client";

import { useId, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PriceSeries } from "@/lib/priceHistory";
import { HISTORY_WINDOWS, type HistoryWindowKey } from "@/lib/historyWindows";
import { HistoryWindowSelector } from "@/components/HistoryWindowSelector";
import { shortUnit } from "@/lib/format";

// Separatori italiani anche dentro il grafico (regola del sito: mai il
// punto decimale in pagina). Le tacche dell'asse mostrano solo i decimali
// che servono, il tooltip sempre tre come le tabelle dei carburanti.
const axisNumber = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 });
const tooltipNumber = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

type PriceHistoryChartProps = {
  title: string;
  /** Serie della finestra iniziale, già calcolate lato server. */
  series: PriceSeries[];
  /** Chiave della serie selezionata di default (fallback: la prima) */
  defaultSeriesKey?: string;
  /**
   * Quale storico chiedere a /api/history quando si cambia periodo.
   * Senza, il selettore del periodo non compare (grafico a finestra fissa).
   */
  historyKind?: "commodities" | "fuel";
  /** Finestra a cui corrispondono le `series` iniziali. */
  initialWindow?: HistoryWindowKey;
};

/** Oltre questo numero di punti i pallini sulla linea diventano rumore. */
const MAX_POINTS_WITH_DOTS = 60;

/**
 * Grafico storico prezzi con selettore di serie (una alla volta) e, dal
 * 15 set 2026, selettore del periodo (da 1 mese a 10 anni).
 *
 * Perché una serie alla volta e non tutte sovrapposte: le materie prime
 * hanno unità di misura incompatibili (USD/barile vs USD/tonnellata vs
 * cent/libbra) — sovrapporle sullo stesso asse Y le renderebbe illeggibili
 * o fuorvianti. Stessa cosa per i carburanti: Europa è in EUR, USA in USD,
 * e mescolarli senza tasso di cambio darebbe un confronto sbagliato.
 *
 * Come funziona il cambio di periodo:
 * - la pagina passa già le serie della finestra iniziale (nessuna attesa
 *   al primo caricamento);
 * - un clic su un altro periodo chiede i dati a /api/history e li
 *   CONSERVA in `cacheRef`: tornando a un periodo già visto non si
 *   riscarica niente;
 * - il fetch parte dal gestore del clic e non da un `useEffect`: è
 *   un'azione dell'utente, non un effetto del render, e così il codice
 *   resta lineare (clic → carica → mostra).
 */
export function PriceHistoryChart({
  title,
  series: initialSeries,
  defaultSeriesKey,
  historyKind,
  initialWindow,
}: PriceHistoryChartProps) {
  const [selectedKey, setSelectedKey] = useState(
    defaultSeriesKey ?? initialSeries[0]?.key,
  );
  const [windowKey, setWindowKey] = useState<HistoryWindowKey | undefined>(initialWindow);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [series, setSeries] = useState(initialSeries);

  // Serie già scaricate, per periodo. `useRef` e non `useState`: cambiare
  // la cache non deve ridisegnare il grafico, è solo un magazzino.
  const cacheRef = useRef(
    new Map<string, PriceSeries[]>(initialWindow ? [[initialWindow, initialSeries]] : []),
  );
  // L'ultimo periodo RICHIESTO. Se l'utente clicca "5 anni" e subito dopo
  // "1 anno", la risposta di "5 anni" può arrivare dopo: confrontandola
  // con questo valore la ignoriamo invece di mostrare il periodo sbagliato.
  const requestedRef = useRef(initialWindow);

  // Id univoco per istanza: la homepage monta due PriceHistoryChart insieme
  // (materie prime + carburanti), un id fisso nel <linearGradient> farebbe
  // collidere le due <defs> nello stesso DOM.
  const gradientId = useId();

  async function selectWindow(key: HistoryWindowKey) {
    if (!historyKind || key === windowKey) return;
    requestedRef.current = key;

    const cached = cacheRef.current.get(key);
    if (cached) {
      setSeries(cached);
      setWindowKey(key);
      setStatus("idle");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch(`/api/history?kind=${historyKind}&window=${key}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { series: PriceSeries[] } = await res.json();
      cacheRef.current.set(key, data.series);
      if (requestedRef.current !== key) return; // risposta superata
      setSeries(data.series);
      setWindowKey(key);
      setStatus("idle");
    } catch {
      if (requestedRef.current === key) setStatus("error");
    }
  }

  const selected = series.find((s) => s.key === selectedKey) ?? series[0];
  const activeWindow = HISTORY_WINDOWS.find((w) => w.key === windowKey);
  // Sopra l'anno l'asse mostra mese/anno: "12/09" su un grafico di 10 anni
  // non dice di quale anno si parla.
  const longRange = (activeWindow?.days ?? 0) > 365;

  const windowSelector = historyKind && (
    <HistoryWindowSelector
      windows={HISTORY_WINDOWS}
      active={windowKey}
      status={status}
      onSelect={selectWindow}
    />
  );

  if (!selected || selected.points.length === 0) {
    return (
      <div className="rounded-lg border border-system-border bg-system-surface p-4">
        <h3 className="mb-2 text-sm font-semibold text-system-ink">{title}</h3>
        {windowSelector}
        <p className="mt-2 text-sm text-system-ink-muted">
          Dati storici insufficienti per questo periodo.
        </p>
      </div>
    );
  }

  // Riassunto testuale del grafico — alternativa per chi non vede il
  // tracciato (screen reader, WCAG 1.1.1/4.1.2, trovato nell'audit del
  // 7/9/2026). Il grafico SVG di Recharts resta `aria-hidden`.
  const values = selected.points.map((p) => p.value);
  const first = selected.points[0];
  const last = selected.points[selected.points.length - 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const trend =
    last.value > first.value
      ? "in salita"
      : last.value < first.value
        ? "in discesa"
        : "stabile";
  const chartSummary = `Andamento di ${selected.label}${activeWindow ? ` negli ultimi ${activeWindow.label}` : ""}: da ${tooltipNumber.format(first.value)} a ${tooltipNumber.format(last.value)} ${shortUnit(selected.unit)}, ${trend} nel periodo. Minimo ${tooltipNumber.format(min)}, massimo ${tooltipNumber.format(max)} ${shortUnit(selected.unit)}, su ${selected.points.length} punti.`;
  const showDots = selected.points.length <= MAX_POINTS_WITH_DOTS;

  return (
    <div className="rounded-lg border border-system-border bg-system-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-system-ink">
          {title}
          {activeWindow && (
            <span className="font-normal text-system-ink-muted"> · {activeWindow.label}</span>
          )}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {series.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSelectedKey(s.key)}
              aria-pressed={s.key === selected.key}
              className={`rounded-md border px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors ${
                s.key === selected.key
                  ? "border-system-accent bg-system-accent text-white"
                  : "border-system-border text-system-ink-secondary hover:border-system-accent hover:text-system-accent"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {windowSelector && <div className="mb-3">{windowSelector}</div>}

      {/* Durante il caricamento il grafico resta visibile ma più chiaro:
          niente salto di layout, e si capisce che sta per cambiare. */}
      <div
        className={`h-64 w-full transition-opacity ${status === "loading" ? "opacity-50" : ""}`}
        role="img"
        aria-label={chartSummary}
      >
        <div aria-hidden="true" className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={selected.points}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-system-accent)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-system-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-system-border)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tick={{ fontSize: 11, fill: "var(--color-system-ink-muted)" }}
              tickFormatter={(value: string) => {
                const d = new Date(value);
                return d.toLocaleDateString(
                  "it-IT",
                  longRange
                    ? { month: "2-digit", year: "2-digit" }
                    : { day: "2-digit", month: "2-digit" },
                );
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--color-system-ink-muted)" }}
              width={48}
              domain={["auto", "auto"]}
              tickFormatter={(value: number) => axisNumber.format(value)}
            />
            <Tooltip
              formatter={(value) => [
                `${tooltipNumber.format(Number(value))} ${shortUnit(selected.unit)}`,
                selected.label,
              ]}
              labelFormatter={(label) =>
                new Date(String(label)).toLocaleDateString("it-IT")
              }
              contentStyle={{
                borderRadius: 0,
                border: "1px solid var(--color-system-border)",
                fontSize: 12,
                fontFamily: "monospace",
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-system-accent)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={showDots ? { r: 3, fill: "var(--color-system-accent)" } : false}
              activeDot={{ r: 5 }}
              // Niente animazione di ingresso a ogni cambio di periodo:
              // con 260 punti sembra un difetto più che un effetto.
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      </div>

      <p className="mt-2 text-xs text-system-ink-muted">
        Unità: {shortUnit(selected.unit)} · {selected.points.length}{" "}
        {selected.points.length === 1 ? "punto" : "punti"} nel periodo
        {longRange &&
          " · sui periodi lunghi ogni punto è la media di più rilevazioni consecutive"}
      </p>
    </div>
  );
}
