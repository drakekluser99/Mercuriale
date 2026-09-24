"use client";

import { useId, useRef, useState } from "react";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { HistoryWindowSelector } from "@/components/HistoryWindowSelector";
import { HISTORY_WINDOWS, type HistoryWindowKey } from "@/lib/historyWindows";
import { CHOKEPOINT_SHORT_NAMES } from "@/lib/chokepointStatus";
import type { ShippingChartSeries } from "@/lib/shippingChart";
import { formatCommodityPrice, formatDecimal, formatIsoDay } from "@/lib/format";

/**
 * Grafico dei transiti con il Brent sotto (24 set 2026, passo 2 della UI
 * del traffico marittimo).
 *
 * Due grafici e non uno con due assi Y: navi al giorno e dollari al
 * barile non hanno una scala comune, e con due assi sovrapposti la
 * posizione relativa delle due linee dipenderebbe solo da come si scelgono
 * i limiti degli assi — un "nesso" disegnato dall'impaginazione. Uno sopra
 * l'altro, con lo stesso asse del tempo, il lettore confronta i tempi da
 * sé. Il testo sotto lo dice: il grafico MOSTRA, non afferma.
 *
 * I due grafici leggono lo stesso elenco di punti (vedi shippingChart.ts)
 * e hanno lo stesso `syncId`: passando sopra uno, il tooltip indica lo
 * stesso giorno anche nell'altro. Gli assi Y hanno la stessa larghezza,
 * così le due aree di disegno cominciano allo stesso pixel.
 *
 * Il cambio di periodo funziona come in PriceHistoryChart: il primo
 * periodo arriva con la pagina, gli altri da /api/history al clic, e
 * restano in una cache in memoria.
 */

const Y_AXIS_WIDTH = 48;
const SYNC_ID = "traffico-brent";

/** "AAAA-MM-GG" → "gg/mm" o "mm/aa", senza passare da Date (niente fuso). */
function tickLabel(day: string, longRange: boolean): string {
  const [y, m, d] = day.split("-");
  return longRange ? `${m}/${y.slice(2)}` : `${d}/${m}`;
}

const tooltipStyle = {
  borderRadius: 0,
  border: "1px solid var(--color-system-border)",
  fontSize: 12,
  fontFamily: "monospace",
};

export function ShippingHistoryChart({
  series: initialSeries,
  initialWindow,
}: {
  series: ShippingChartSeries[];
  initialWindow: HistoryWindowKey;
}) {
  const [selectedKey, setSelectedKey] = useState(initialSeries[0]?.key);
  const [windowKey, setWindowKey] = useState<HistoryWindowKey>(initialWindow);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [series, setSeries] = useState(initialSeries);
  const cacheRef = useRef(new Map<string, ShippingChartSeries[]>([[initialWindow, initialSeries]]));
  // Ultimo periodo chiesto: una risposta arrivata tardi per un periodo
  // già abbandonato si ignora (stesso motivo di PriceHistoryChart).
  const requestedRef = useRef<HistoryWindowKey>(initialWindow);
  const gradientId = useId();

  async function selectWindow(key: HistoryWindowKey) {
    if (key === windowKey) return;
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
      const res = await fetch(`/api/history?kind=chokepoints&window=${key}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { chokepoints: ShippingChartSeries[] } = await res.json();
      cacheRef.current.set(key, data.chokepoints);
      if (requestedRef.current !== key) return;
      setSeries(data.chokepoints);
      setWindowKey(key);
      setStatus("idle");
    } catch {
      if (requestedRef.current === key) setStatus("error");
    }
  }

  const selected = series.find((s) => s.key === selectedKey) ?? series[0];
  const activeWindow = HISTORY_WINDOWS.find((w) => w.key === windowKey);
  const longRange = (activeWindow?.days ?? 0) > 365;
  const selector = <HistoryWindowSelector active={windowKey} status={status} onSelect={selectWindow} />;

  if (!selected || selected.points.length === 0) {
    return (
      <div className="rounded-lg border border-system-border bg-system-surface p-4">
        <h3 className="mb-2 text-sm font-semibold">Transiti e prezzo del Brent</h3>
        {selector}
        <p className="mt-2 text-sm text-system-ink-muted">Dati insufficienti per questo periodo.</p>
      </div>
    );
  }

  const points = selected.points;
  const withTransits = points.filter((p) => p.transits !== null);
  const withBrent = points.filter((p) => p.brent !== null);
  const firstT = withTransits[0];
  const lastT = withTransits.at(-1);
  const firstB = withBrent[0];
  const lastB = withBrent.at(-1);

  // Alternativa testuale ai due grafici (lo stesso criterio di
  // PriceHistoryChart): i numeri di inizio e fine, senza interpretarli.
  const summary = [
    firstT && lastT
      ? `${selected.name}, media a 7 giorni delle navi in transito: da ${formatDecimal(firstT.transits as number)} il ${formatIsoDay(firstT.date)} a ${formatDecimal(lastT.transits as number)} il ${formatIsoDay(lastT.date)}; normale a fine periodo ${formatDecimal(lastT.normal)}.`
      : `${selected.name}: nessuna media a 7 giorni nel periodo.`,
    firstB && lastB
      ? `Brent: da ${formatCommodityPrice(firstB.brent as number)} a ${formatCommodityPrice(lastB.brent as number)} dollari al barile.`
      : "Brent: nessuna quotazione nel periodo.",
  ].join(" ");

  return (
    <div className="rounded-lg border border-system-border bg-system-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          Transiti e prezzo del Brent
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
              {CHOKEPOINT_SHORT_NAMES[s.key]}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3">{selector}</div>

      {/* Legenda scritta: il tratteggio da solo non dice cosa sia. */}
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-system-ink-secondary">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-0.5 w-5 bg-system-accent" />
          Navi al giorno, media degli ultimi 7 giorni
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-5 border-t-2 border-dashed border-system-ink-muted" />
          Traffico normale
        </li>
      </ul>

      <div
        className={`transition-opacity ${status === "loading" ? "opacity-50" : ""}`}
        role="img"
        aria-label={summary}
      >
        <div aria-hidden="true">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} syncId={SYNC_ID} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-system-accent)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--color-system-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-system-border)" vertical={false} />
                {/* Asse del tempo nascosto qui: lo porta il grafico sotto. */}
                <XAxis dataKey="date" hide />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={Y_AXIS_WIDTH}
                  tick={{ fontSize: 11, fill: "var(--color-system-ink-muted)" }}
                  domain={[0, "auto"]}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => formatIsoDay(String(label))}
                  formatter={(value, name) => [
                    value === null || value === undefined ? "—" : `${formatDecimal(Number(value))} navi/g`,
                    name === "normal" ? "Normale" : "Media 7 giorni",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="transits"
                  stroke="var(--color-system-accent)"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                  // Un buco nei dati resta un buco: niente linea che lo scavalca.
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="normal"
                  stroke="var(--color-system-ink-muted)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-system-ink-secondary">
            <span aria-hidden="true" className="inline-block h-0.5 w-5 bg-system-ink-secondary" />
            Brent, dollari al barile
          </p>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} syncId={SYNC_ID} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-system-border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  tick={{ fontSize: 11, fill: "var(--color-system-ink-muted)" }}
                  tickFormatter={(value: string) => tickLabel(value, longRange)}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={Y_AXIS_WIDTH}
                  tick={{ fontSize: 11, fill: "var(--color-system-ink-muted)" }}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => formatIsoDay(String(label))}
                  formatter={(value) => [
                    value === null || value === undefined ? "—" : `${formatCommodityPrice(Number(value))} $/barile`,
                    "Brent",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="brent"
                  stroke="var(--color-system-ink-secondary)"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                  // Il Brent non quota nei fine settimana: unire i giorni
                  // di borsa è corretto, non nasconde nessun dato mancante.
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs leading-relaxed text-system-ink-muted">
        <p>
          Il Brent è affiancato per confronto sullo stesso periodo: il grafico
          mostra i due andamenti, non dice che uno dipenda dall&apos;altro.
        </p>
        <p>
          La linea dei transiti si interrompe dove manca un giorno dei 7 della
          media
          {selected.latestTransitDate &&
            ` e finisce all'ultimo dato pubblicato (${formatIsoDay(selected.latestTransitDate)})`}
          .
          {selected.blockDays > 1 &&
            ` Su questo periodo ogni punto è la media di ${selected.blockDays} giorni consecutivi.`}
          {selected.startsLate &&
            ` Lo storico dei transiti parte dal ${formatIsoDay(points[0].date)}: il grafico comincia da lì.`}
        </p>
      </div>
    </div>
  );
}
