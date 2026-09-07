"use client";

import { useId, useState } from "react";
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

type PriceHistoryChartProps = {
  title: string;
  series: PriceSeries[];
  /** Chiave della serie selezionata di default (fallback: la prima) */
  defaultSeriesKey?: string;
};

/**
 * Grafico storico prezzi con selettore di serie (una alla volta).
 *
 * Perché una serie alla volta e non tutte sovrapposte: le materie prime
 * hanno unità di misura incompatibili (USD/barile vs USD/tonnellata vs
 * cent/libbra) — sovrapporle sullo stesso asse Y le renderebbe illeggibili
 * o fuorvianti. Stessa cosa per i carburanti: Europa è in EUR, USA in USD,
 * e mescolarli senza tasso di cambio darebbe un confronto sbagliato (nota
 * già presente altrove nel progetto, nel calcolatore d'impatto). Un
 * selettore che mostra una serie chiara alla volta è più onesto di un
 * grafico "impressionante" ma fuorviante.
 */
export function PriceHistoryChart({
  title,
  series,
  defaultSeriesKey,
}: PriceHistoryChartProps) {
  const [selectedKey, setSelectedKey] = useState(
    defaultSeriesKey ?? series[0]?.key,
  );
  const selected = series.find((s) => s.key === selectedKey) ?? series[0];
  // Id univoco per istanza: la homepage monta due PriceHistoryChart insieme
  // (materie prime + carburanti), un id fisso nel <linearGradient> farebbe
  // collidere le due <defs> nello stesso DOM.
  const gradientId = useId();

  if (!selected || selected.points.length === 0) {
    return (
      <div className="rounded-lg border border-system-border bg-system-surface p-4">
        <h3 className="mb-2 text-sm font-semibold text-system-ink">{title}</h3>
        <p className="text-sm text-system-ink-muted">
          Dati storici insufficienti per questo periodo.
        </p>
      </div>
    );
  }

  // Riassunto testuale del grafico — alternativa per chi non vede il
  // tracciato (screen reader, WCAG 1.1.1/4.1.2, trovato nell'audit del
  // 7/9/2026). Il grafico SVG di Recharts resta `aria-hidden`: un lettore
  // di schermo che provasse a leggerlo elemento per elemento produrrebbe
  // rumore, non informazione — questa riga sola porta lo stesso contenuto
  // in una forma comprensibile.
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
  const chartSummary = `Andamento di ${selected.label}: da ${first.value.toFixed(3)} a ${last.value.toFixed(3)} ${selected.unit}, ${trend} nel periodo. Minimo ${min.toFixed(3)}, massimo ${max.toFixed(3)} ${selected.unit}, su ${selected.points.length} rilevazioni.`;

  return (
    <div className="rounded-lg border border-system-border bg-system-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-system-ink">{title}</h3>
        <div className="flex flex-wrap gap-1.5">
          {series.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSelectedKey(s.key)}
              className={`rounded-md border px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors ${
                s.key === selectedKey
                  ? "border-system-accent bg-system-accent text-white"
                  : "border-system-border text-system-ink-secondary hover:border-system-accent hover:text-system-accent"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64 w-full" role="img" aria-label={chartSummary}>
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
              tick={{ fontSize: 11, fill: "var(--color-system-ink-muted)" }}
              tickFormatter={(value: string) => {
                const d = new Date(value);
                return d.toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "2-digit",
                });
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--color-system-ink-muted)" }}
              width={48}
              domain={["auto", "auto"]}
            />
            <Tooltip
              formatter={(value) => [
                `${Number(value).toFixed(3)} ${selected.unit}`,
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
              dot={{ r: 3, fill: "var(--color-system-accent)" }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      </div>

      <p className="mt-2 text-xs text-system-ink-muted">
        Unità: {selected.unit} · {selected.points.length}{" "}
        {selected.points.length === 1 ? "rilevazione" : "rilevazioni"} nel periodo
      </p>
    </div>
  );
}
