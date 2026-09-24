"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { formatFuelPrice } from "@/lib/format";
import {
  divergingColor,
  INK_HEX,
  NO_DATA_FILL,
} from "@/lib/divergingColor";
import type { ProvinceFuelRow } from "./ItalyProvinceFuelTable";

/**
 * Mappa delle 107 province italiane, colorate sul prezzo self (15 set 2026).
 *
 * CONFINI: file TopoJSON in /public/geo, dai limiti amministrativi ISTAT
 * (licenza CC-BY 4.0) nella versione di openpolis/guglielmo
 * "geojson-italy". Si usa la versione di OTTOBRE 2025, non quella del
 * 2026: il MIMIT classifica ancora i distributori sardi con le sigle
 * 2016–2025 (per esempio "SU", Sud Sardegna), mentre i confini ISTAT 2026
 * hanno già le nuove province sarde. Con la versione 2025 le 107 sigle
 * combaciano una per una (verificato), e ogni provincia colorata
 * corrisponde esattamente ai distributori che il MIMIT le attribuisce.
 * Il file è stato ridotto alle sole province e semplificato (69 KB).
 *
 * COLORI: stessa scala divergente della mappa europea
 * (src/lib/divergingColor.ts), centrata sulla MEDIA NAZIONALE pesata sugli
 * impianti (la stessa mostrata sopra la tabella): verde sotto, ruggine
 * sopra.
 *
 * INTERAZIONE: passando sopra (o con Tab da tastiera) si vede il dato;
 * cliccando (o Invio) si apre la pagina della provincia. Niente zoom:
 * l'Italia intera sta in un riquadro, e su mobile lo zoom a due dita
 * litigherebbe con lo scorrimento della pagina.
 */

const GEO_URL = "/geo/italy-provinces-2025.topo.json";

/** Contorno della provincia sotto il mouse, disegnato sopra le altre. */
const HOVER_OUTLINE = {
  fill: "none",
  stroke: INK_HEX,
  strokeWidth: 1.4,
  strokeLinejoin: "round" as const,
  outline: "none",
  pointerEvents: "none" as const,
};

type FuelKey = "petrolSelf" | "dieselSelf";
const FUELS: { key: FuelKey; label: string }[] = [
  { key: "petrolSelf", label: "Benzina self" },
  { key: "dieselSelf", label: "Gasolio self" },
];

interface Props {
  rows: ProvinceFuelRow[];
  /** Medie nazionali pesate, già calcolate lato server. */
  average: { petrolSelf: number | null; dieselSelf: number | null };
}

export function ItalyProvinceMap({ rows, average }: Props) {
  const router = useRouter();
  const [fuel, setFuel] = useState<FuelKey>("petrolSelf");
  const [hovered, setHovered] = useState<ProvinceFuelRow | null>(null);

  // Indice per sigla: la geometria porta `prov_acr`, i dati `provinceCode`.
  const byCode = useMemo(
    () => new Map(rows.map((r) => [r.provinceCode, r])),
    [rows],
  );

  // Estremi del carburante attivo, per l'ampiezza della scala e la legenda.
  const range = useMemo(() => {
    const values = rows
      .map((r) => r[fuel])
      .filter((v): v is number => v !== null);
    if (values.length === 0) return null;
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [rows, fuel]);

  const avg = average[fuel];
  const span = range ? range.max - range.min : 0;
  const colorOf = (value: number | null) =>
    value === null || avg === null ? NO_DATA_FILL : divergingColor(value, avg, span);

  // Differenza dalla media in centesimi, con segno: "+3,2 cent".
  const diffLabel = (value: number) => {
    if (avg === null) return "";
    const cents = (value - avg) * 100;
    const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
    return `${sign}${Math.abs(cents).toLocaleString("it-IT", { maximumFractionDigits: 1 })} cent rispetto alla media`;
  };

  const hoveredValue = hovered ? hovered[fuel] : null;
  const avgPosition =
    range && avg !== null && span > 0 ? ((avg - range.min) / span) * 100 : 50;

  return (
    <div className="rounded-lg border border-system-border bg-system-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-system-ink-muted">
          Carburante
        </span>
        {FUELS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFuel(f.key)}
            aria-pressed={f.key === fuel}
            className={`rounded-md border px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition-colors ${
              f.key === fuel
                ? "border-system-accent bg-system-accent text-white"
                : "border-system-border text-system-ink-secondary hover:border-system-accent hover:text-system-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Riquadro informativo SOPRA la mappa e non un tooltip che segue il
          mouse: su mobile non c'è un mouse da seguire, e un riquadro fisso
          non copre mai la provincia che si sta guardando. `aria-live`
          annuncia il cambio a chi usa uno screen reader. */}
      {/* ALTEZZA FISSA (`h-14`) e sempre DUE righe, ognuna tagliata con
          `truncate` se non ci sta (16 set 2026). Prima c'era solo
          un'altezza minima: a riposo il riquadro aveva una riga, al
          passaggio del mouse due, quindi cresceva e spingeva giù la mappa
          di qualche pixel a ogni provincia — il "flicker" segnalato da un
          visitatore. Con altezza e numero di righe costanti, cambiare
          provincia cambia solo il testo, mai la posizione di nulla. */}
      <div
        aria-live="polite"
        className="mb-2 flex h-14 flex-col justify-center rounded-md bg-system-bg px-3 text-sm"
      >
        {hovered ? (
          <>
            <span className="block truncate">
              <span className="font-semibold text-system-ink">{hovered.provinceName}</span>{" "}
              <span className="font-mono tabular-nums text-system-ink">
                {hoveredValue !== null ? `${formatFuelPrice(hoveredValue)} €/L` : "dato non disponibile"}
              </span>
            </span>
            <span className="block truncate text-xs text-system-ink-muted">
              {hoveredValue !== null
                ? `${diffLabel(hoveredValue)} · clic per il dettaglio`
                : "clic per il dettaglio"}
            </span>
          </>
        ) : (
          <>
            <span className="block truncate text-system-ink-secondary">
              Passa sopra una provincia (o usa Tab)
            </span>
            <span className="block truncate text-xs text-system-ink-muted">
              per vedere il prezzo · clic per il dettaglio
            </span>
          </>
        )}
      </div>

      <ComposableMap
        // Mercatore centrato sull'Italia: a questa scala la deformazione è
        // trascurabile e le forme restano quelle che tutti riconoscono.
        projection="geoMercator"
        projectionConfig={{ center: [12.5, 42.2], scale: 2250 }}
        width={500}
        height={560}
        style={{ width: "100%", height: "auto", maxHeight: "34rem" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) => {
            const hoveredGeo = hovered
              ? geographies.find((g) => g.properties.prov_acr === hovered.provinceCode)
              : undefined;
            return (
              <>
            {geographies.map((geo) => {
              const code = geo.properties.prov_acr as string;
              const row = byCode.get(code);
              const value = row ? row[fuel] : null;
              const isHovered = hovered?.provinceCode === code;
              const shape = {
                fill: colorOf(value),
                stroke: isHovered ? INK_HEX : "#ffffff",
                strokeWidth: isHovered ? 1.4 : 0.4,
                outline: "none",
                cursor: row ? "pointer" : "default",
              };
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  tabIndex={row ? 0 : -1}
                  role={row ? "link" : undefined}
                  aria-label={
                    row
                      ? `${row.provinceName}: ${value !== null ? `${formatFuelPrice(value)} euro al litro` : "dato non disponibile"}`
                      : undefined
                  }
                  onMouseEnter={() => row && setHovered(row)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => row && setHovered(row)}
                  onBlur={() => setHovered(null)}
                  onClick={() => row && router.push(`/provincia/${row.slug}`)}
                  onKeyDown={(e) => {
                    if (row && e.key === "Enter") router.push(`/provincia/${row.slug}`);
                  }}
                  // Stesso stile nei tre stati: il bordo evidenziato lo
                  // decide lo stato React `hovered`, non il :hover del
                  // browser, che su touch resta "incollato" (vedi la stessa
                  // scelta in EuropeFuelMap).
                  style={{ default: shape, hover: shape, pressed: shape }}
                />
              );
            })}
            {/* Il bordo della provincia evidenziata, ridisegnato DOPO
                tutte le altre (25 set 2026). In SVG vince l'ultimo
                elemento disegnato: le province vicine, che vengono dopo,
                coprivano col loro bordo bianco metà del contorno scuro.
                Non si sposta la provincia in fondo all'elenco perché
                perderebbe il focus da tastiera; si disegna una copia del
                solo contorno, che non riceve mouse (`pointerEvents:
                "none"`, altrimenti passarci sopra farebbe "uscire" il mouse
                dalla provincia) né focus, ed è nascosta agli screen reader. */}
            {hoveredGeo && (
              <Geography
                key={`contorno-${hoveredGeo.rsmKey}`}
                geography={hoveredGeo}
                tabIndex={-1}
                aria-hidden="true"
                style={{ default: HOVER_OUTLINE, hover: HOVER_OUTLINE, pressed: HOVER_OUTLINE }}
              />
            )}
              </>
            );
          }}
        </Geographies>
      </ComposableMap>

      {/* Legenda: estremi reali e media, con la stessa funzione colore. */}
      {range && avg !== null && (
        <div className="mt-2">
          <div
            aria-hidden="true"
            className="h-2 w-full rounded-full"
            // La media sta alla sua posizione REALE nel range, non a metà:
            // disegnarla al centro racconterebbe una simmetria che nei dati
            // non c'è (stessa scelta della legenda europea).
            style={{
              background: `linear-gradient(to right, ${colorOf(range.min)} 0%, ${colorOf(avg)} ${avgPosition}%, ${colorOf(range.max)} 100%)`,
            }}
          />
          <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-system-ink-muted">
            <span>{formatFuelPrice(range.min)} €/L</span>
            <span>media {formatFuelPrice(avg)}</span>
            <span>{formatFuelPrice(range.max)} €/L</span>
          </div>
        </div>
      )}
    </div>
  );
}
