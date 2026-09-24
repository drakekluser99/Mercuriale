"use client";

import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { TRANSIT_STATE_LABELS, type TransitState } from "@/lib/chokepointHistory";
import type { ChokepointKey, ChokepointSummary } from "@/lib/chokepointStatus";
import { NO_DATA_FILL } from "@/lib/divergingColor";
import { formatPercent } from "@/lib/format";
import { WORLD_ATLAS_50M_URL } from "@/lib/geo";

/**
 * Mappa regionale dei passaggi marittimi (24 set 2026, passo 3 della UI).
 *
 * REGIONALE e non un planisfero (decisione di Yuri): dall'Italia al Golfo,
 * con Mediterraneo, Suez e Mar Rosso in mezzo. È la rotta che interessa a
 * chi legge il sito, e su un planisfero i due stretti sarebbero due punti
 * a pochi millimetri l'uno dall'altro.
 *
 * Il colore del punto dice lo stato, ma NON è mai l'unico veicolo: accanto
 * a ogni punto sono SCRITTI nome, scostamento e stato (chi non distingue i
 * colori, o stampa in bianco e nero, legge lo stesso). Stessi tre colori
 * delle etichette nelle schede: neutro, ocra, ruggine — mai il verde.
 *
 * Nessuna interazione (niente zoom né tooltip): i numeri completi sono
 * nelle schede subito sotto, la mappa serve a dire DOVE. È un Client
 * Component solo perché react-simple-maps lo richiede. L'SVG è
 * `aria-hidden`: la descrizione per gli screen reader è nell'`aria-label`
 * del contenitore.
 */

/**
 * Punto più stretto di ciascun passaggio, [longitudine, latitudine].
 * Approssimato al decimo di grado: serve a disegnare un punto su una
 * mappa larga 70 gradi, non a navigare.
 */
const COORDINATES: Record<ChokepointKey, [number, number]> = {
  hormuz: [56.3, 26.6],
  bab_el_mandeb: [43.3, 12.6],
};

/**
 * Dove scrivere l'etichetta. Hormuz sta vicino al bordo destro: testo a
 * sinistra, sopra il Golfo. Bab el-Mandeb: sotto il punto, centrato, sul
 * Golfo di Aden (a destra non ci starebbe, a sinistra coprirebbe l'Africa).
 */
const LABEL_POSITION: Record<ChokepointKey, "left" | "below"> = {
  hormuz: "left",
  bab_el_mandeb: "below",
};

const SHORT_NAMES: Record<ChokepointKey, string> = {
  hormuz: "Hormuz",
  bab_el_mandeb: "Bab el-Mandeb",
};

// Variabili CSS e non hex: i token restano la fonte unica dei colori
// (vedi globals.css). Usate dentro `style`, dove var() vale sempre.
const STATE_COLORS: Record<TransitState, string> = {
  normale: "var(--color-system-ink-secondary)",
  ridotto: "var(--color-system-signal-wait)",
  fortemente_ridotto: "var(--color-system-signal-up)",
};
const INCOMPLETE_COLOR = "var(--color-system-ink-muted)";

export function ChokepointMap({ chokepoints }: { chokepoints: ChokepointSummary[] }) {
  const description = chokepoints
    .map((c) =>
      c.state && c.deviationPct !== null
        ? `${c.name}: traffico ${TRANSIT_STATE_LABELS[c.state]}, ${formatPercent(c.deviationPct, 0)} rispetto al normale`
        : `${c.name}: media degli ultimi 7 giorni non disponibile`
    )
    .join("; ");

  return (
    <figure className="rounded-lg border border-system-border bg-system-surface p-4">
      <div
        role="img"
        aria-label={`Mappa dal Mediterraneo al Golfo Persico. ${description}.`}
        // Larghezza massima: le etichette sono testo SVG e crescono con la
        // mappa. Oltre ~800 px diventerebbero più grandi del resto del testo.
        className="mx-auto max-w-3xl"
      >
        <ComposableMap
          aria-hidden="true"
          projection="geoAzimuthalEqualArea"
          // Centro a 30°E / 27°N: dall'Italia (in alto a sinistra) al Golfo
          // di Aden (in basso), con Hormuz a destra. Più a nord ci sarebbe
          // solo Mar Nero e Caspio, che qui non dicono niente.
          projectionConfig={{ rotate: [-30, -27, 0], scale: 720 }}
          width={800}
          height={540}
          style={{ width: "100%", height: "auto" }}
        >
          <Geographies geography={WORLD_ATLAS_50M_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                // L'Italia col contorno ambra, come nella mappa d'Europa:
                // il punto di vista di chi legge.
                const isItaly = geo.properties.name === "Italy";
                const style = {
                  fill: NO_DATA_FILL,
                  stroke: isItaly ? "var(--color-system-accent)" : "#ffffff",
                  strokeWidth: isItaly ? 1.2 : 0.5,
                  outline: "none",
                };
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    tabIndex={-1}
                    style={{ default: style, hover: style, pressed: style }}
                  />
                );
              })
            }
          </Geographies>

          {chokepoints.map((c) => {
            const color = c.state ? STATE_COLORS[c.state] : INCOMPLETE_COLOR;
            const below = LABEL_POSITION[c.key] === "below";
            // Due righe: nome (grassetto) e scostamento · stato. A sinistra
            // allineate a destra sul punto; sotto, centrate.
            const x = below ? 0 : -18;
            const [y1, y2] = below ? [44, 74] : [-4, 26];
            const anchor = below ? "middle" : "end";
            // Alone chiaro attorno al testo (`paintOrder: stroke`): si
            // legge anche sopra la terra e i confini.
            const halo = {
              paintOrder: "stroke" as const,
              stroke: "var(--color-system-surface)",
              strokeWidth: 6,
              strokeLinejoin: "round" as const,
            };
            return (
              <Marker key={c.key} coordinates={COORDINATES[c.key]}>
                <circle r={10} style={{ fill: color, stroke: "#ffffff", strokeWidth: 3 }} />
                <text
                  x={x}
                  y={y1}
                  textAnchor={anchor}
                  style={{ ...halo, fill: "var(--color-system-ink)", fontSize: 30, fontWeight: 600 }}
                >
                  {SHORT_NAMES[c.key]}
                </text>
                <text
                  x={x}
                  y={y2}
                  textAnchor={anchor}
                  // `font-mono` di Tailwind e non una var() scritta a mano:
                  // è la stessa classe dei numeri nel resto del sito.
                  className="font-mono"
                  style={{ ...halo, fill: color, fontSize: 25, fontWeight: 500 }}
                >
                  {c.state && c.deviationPct !== null
                    ? `${formatPercent(c.deviationPct, 0)} · ${TRANSIT_STATE_LABELS[c.state]}`
                    : "dati incompleti"}
                </text>
              </Marker>
            );
          })}
        </ComposableMap>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-system-ink-secondary">
        {(Object.keys(STATE_COLORS) as TransitState[]).map((state) => (
          <span key={state} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: STATE_COLORS[state] }}
            />
            {TRANSIT_STATE_LABELS[state]}
          </span>
        ))}
        <span className="text-system-ink-muted">
          · scostamento della media degli ultimi 7 giorni dal traffico normale
        </span>
      </figcaption>
    </figure>
  );
}
