"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HistoryWindowSelector } from "@/components/HistoryWindowSelector";
import { formatDecimal, formatMonthYear, formatPercent } from "@/lib/format";
import { INFLATION_SERIES } from "@/lib/inflation";
import {
  INFLATION_WINDOWS,
  pointsForWindow,
  seriesKey,
  type InflationChartPoint,
  type InflationMeasure,
  type InflationWindowKey,
} from "@/lib/inflationChart";

/**
 * Grafico dell'inflazione (24 set 2026, passo 2 della UI di /inflazione).
 *
 * Scelte:
 * - le QUATTRO serie insieme, su UN solo asse: hanno la stessa unità (una
 *   percentuale, oppure un indice con la stessa base), quindi il
 *   confronto è onesto. Gli energetici oscillano molto più delle altre
 *   voci e allargano la scala: è parte della notizia, e il testo sotto lo
 *   dice; i valori esatti sono nel tooltip e nella tabella;
 * - due misure con un interruttore: la variazione annua (quella dei
 *   comunicati, predefinita) e l'indice nella base 2025, per vedere di
 *   quanto sono cambiati i prezzi in tutto il periodo. Mai insieme: due
 *   unità diverse vorrebbero due assi;
 * - colori di IDENTITÀ (`system-series-*`, validati: vedi globals.css), non
 *   di segnale. L'indice generale è la linea di inchiostro, più spessa: è
 *   il riferimento a cui si confrontano le altre;
 * - una linea di riferimento tratteggiata: lo zero per la variazione (sopra
 *   i prezzi salgono, sotto scendono), il 100 per l'indice (la media 2025);
 * - legenda scritta sopra il grafico e tabella dei dati sotto, chiusa: il
 *   colore non è mai l'unico modo per sapere quale linea è quale;
 * - le voci della legenda sono PULSANTI che nascondono o mostrano una
 *   serie. Sulla variazione annua gli energetici (fino a +70% nel 2022)
 *   schiacciano le altre voci, che stanno fra 0 e 13%: nascondendoli la
 *   scala si stringe sulle altre. Di partenza si vedono tutte: è il
 *   lettore a scegliere di togliere, non il grafico a nascondere;
 * - il tooltip scrive nomi e valori in inchiostro e nell'ordine della
 *   legenda: il testo non porta il colore della serie.
 *
 * Tutti i punti arrivano con la pagina (poche centinaia di valori): il
 * cambio di periodo e di misura non chiede niente al server.
 */

const STYLE: Record<string, { color: string; width: number }> = {
  "00": { color: "var(--color-system-ink)", width: 2.5 },
  FOODHPC: { color: "var(--color-system-series-1)", width: 2 },
  "01": { color: "var(--color-system-series-2)", width: 2 },
  ENRGY: { color: "var(--color-system-series-3)", width: 2 },
};

const MEASURES: { key: InflationMeasure; label: string }[] = [
  { key: "yoy", label: "Variazione annua" },
  { key: "index", label: "Indice (2025 = 100)" },
];

const tooltipStyle = {
  borderRadius: 0,
  border: "1px solid var(--color-system-border)",
  fontSize: 12,
  fontFamily: "monospace",
};

function formatValue(measure: InflationMeasure, v: number): string {
  return measure === "yoy" ? formatPercent(v) : formatDecimal(v);
}

/** "2026-08" → "08/26" sull'asse del tempo. */
function tickLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${m}/${y.slice(2)}`;
}

export function InflationChart({ points }: { points: InflationChartPoint[] }) {
  const [measure, setMeasure] = useState<InflationMeasure>("yoy");
  const [windowKey, setWindowKey] = useState<InflationWindowKey>("tutto");
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const visible = INFLATION_SERIES.filter((s) => !hidden.has(s.code));

  // Nasconde o mostra una serie; l'ultima visibile non si può togliere
  // (un grafico vuoto non direbbe niente).
  function toggle(code: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else if (visible.length > 1) next.add(code);
      return next;
    });
  }

  const shown = pointsForWindow(points, windowKey);
  const first = shown[0];
  const last = shown.at(-1);
  const activeWindow = INFLATION_WINDOWS.find((w) => w.key === windowKey);

  // Alternativa testuale al disegno: i valori di inizio e fine di ogni
  // serie, senza interpretarli.
  const summary =
    first && last
      ? `${MEASURES.find((m) => m.key === measure)?.label}, da ${formatMonthYear(first.month)} a ${formatMonthYear(last.month)}. ` +
        INFLATION_SERIES.map((s) => {
          const a = first[seriesKey(measure, s.code)];
          const b = last[seriesKey(measure, s.code)];
          return typeof a === "number" && typeof b === "number"
            ? `${s.name}: da ${formatValue(measure, a)} a ${formatValue(measure, b)}.`
            : `${s.name}: dati incompleti nel periodo.`;
        }).join(" ")
      : "Nessun dato nel periodo.";

  return (
    <div className="rounded-lg border border-system-border bg-system-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          Andamento nel tempo
          {activeWindow && (
            <span className="font-normal text-system-ink-muted"> · {activeWindow.label}</span>
          )}
        </h3>
        <div role="group" aria-label="Misura del grafico" className="flex flex-wrap gap-1.5">
          {MEASURES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMeasure(m.key)}
              aria-pressed={m.key === measure}
              className={`rounded-md border px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors ${
                m.key === measure
                  ? "border-system-accent bg-system-accent text-white"
                  : "border-system-border text-system-ink-secondary hover:border-system-accent hover:text-system-accent"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3">
        <HistoryWindowSelector
          windows={INFLATION_WINDOWS}
          active={windowKey}
          status="idle"
          onSelect={setWindowKey}
        />
      </div>

      {/* Legenda scritta: nome della serie in inchiostro, il colore solo
          nel trattino accanto. Ogni voce mostra o nasconde la sua linea. */}
      <ul
        aria-label="Serie del grafico (clic per mostrare o nascondere)"
        className="mb-2 flex flex-wrap gap-x-1 gap-y-1 text-xs"
      >
        {INFLATION_SERIES.map((s) => {
          const on = !hidden.has(s.code);
          return (
            <li key={s.code}>
              <button
                type="button"
                onClick={() => toggle(s.code)}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-system-panel ${
                  on ? "text-system-ink-secondary" : "text-system-ink-muted line-through"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block w-5 rounded-full ${on ? "" : "opacity-30"}`}
                  style={{ height: STYLE[s.code].width, background: STYLE[s.code].color }}
                />
                {s.name}
              </button>
            </li>
          );
        })}
      </ul>

      <div role="img" aria-label={summary}>
        <div aria-hidden="true" className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={shown} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-system-border)" vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tick={{ fontSize: 11, fill: "var(--color-system-ink-muted)" }}
                tickFormatter={tickLabel}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fontSize: 11, fill: "var(--color-system-ink-muted)" }}
                tickFormatter={(v: number) => formatValue(measure, v)}
                domain={["auto", "auto"]}
              />
              <ReferenceLine
                y={measure === "yoy" ? 0 : 100}
                stroke="var(--color-system-ink-muted)"
                strokeDasharray="5 4"
              />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: "var(--color-system-ink)" }}
                // Stesso ordine della legenda, non quello di disegno.
                itemSorter={(item) =>
                  INFLATION_SERIES.findIndex((s) => seriesKey(measure, s.code) === item.dataKey)
                }
                labelFormatter={(label) => formatMonthYear(String(label))}
                formatter={(value, name) => {
                  const s = INFLATION_SERIES.find((x) => seriesKey(measure, x.code) === name);
                  return [
                    value === null || value === undefined ? "—" : formatValue(measure, Number(value)),
                    s?.name ?? String(name),
                  ];
                }}
              />
              {visible.map((s) => (
                <Line
                  key={s.code}
                  type="linear"
                  dataKey={seriesKey(measure, s.code)}
                  stroke={STYLE[s.code].color}
                  strokeWidth={STYLE[s.code].width}
                  dot={false}
                  activeDot={{ r: 4 }}
                  // Un mese mancante resta un buco, non una linea che lo scavalca.
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs leading-relaxed text-system-ink-muted">
        {measure === "yoy" ? (
          <p>
            Variazione rispetto allo stesso mese dell&apos;anno prima, come
            pubblicata da ISTAT; sopra la linea tratteggiata i prezzi salgono,
            sotto scendono. Stessa scala per tutte le voci: i beni energetici
            oscillano molto più delle altre. Un clic su una voce della legenda
            la nasconde, e la scala si adatta a quelle rimaste.
          </p>
        ) : (
          <p>
            Indice con la media del 2025 uguale a 100 (linea tratteggiata): 80
            vuol dire prezzi del 20% più bassi della media 2025. Fino a
            dicembre 2025 l&apos;indice è riportato alla base 2025 con i
            coefficienti di raccordo (vedi la nota sotto).
          </p>
        )}
      </div>

      {/* La tabella: i numeri esatti del periodo, per chi non legge il
          disegno o vuole copiarli. Chiusa di partenza. */}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-system-ink-secondary hover:text-system-ink">
          Vedi i dati in tabella
        </summary>
        <div className="mt-2 max-h-72 overflow-auto rounded border border-system-border-subtle">
          <table className="w-full font-mono tabular-nums">
            <thead className="sticky top-0 bg-system-surface text-left text-system-ink-muted">
              <tr>
                <th className="px-2 py-1 font-normal">Mese</th>
                {INFLATION_SERIES.map((s) => (
                  <th key={s.code} className="px-2 py-1 text-right font-normal">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...shown].reverse().map((p) => (
                <tr key={p.month} className="border-t border-system-border-subtle">
                  <td className="px-2 py-1 text-system-ink-secondary">{p.month}</td>
                  {INFLATION_SERIES.map((s) => {
                    const v = p[seriesKey(measure, s.code)];
                    return (
                      <td key={s.code} className="px-2 py-1 text-right">
                        {typeof v === "number" ? formatValue(measure, v) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
