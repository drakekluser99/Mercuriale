import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertAllCategories,
  buildNicUrl,
  cronStartPeriod,
  fetchNic,
  missingMonths,
  monthToDate,
  parseNicGenericData,
} from "./istatNic";

// Risposta VERA di ISTAT (query 9 del 24/9/2026): 4 serie × 2 misure ×
// 2 basi, da novembre 2025 ad agosto 2026. I test su questo file fissano
// cosa manda davvero la fonte, non cosa ci aspettiamo che mandi.
const REAL = readFileSync(join(__dirname, "fixtures", "istat-nic-2025-11.xml"), "utf8");

// Risposta finta minima con la stessa forma, per i casi che il file vero
// non contiene. `series` sono blocchi già scritti con `series()`.
function doc(...series: string[]) {
  return `<?xml version="1.0"?><message:GenericData xmlns:generic="x" xmlns:message="y"><message:DataSet>${series.join("")}</message:DataSet></message:GenericData>`;
}
function series(
  key: { dt?: string; measure?: string; cat?: string; freq?: string },
  obs: [string, string][]
) {
  const v = (id: string, value: string) => `<generic:Value id="${id}" value="${value}" />`;
  return (
    `<generic:Series><generic:SeriesKey>` +
    v("FREQ", key.freq ?? "M") +
    v("REF_AREA", "IT") +
    v("DATA_TYPE", key.dt ?? "85") +
    v("MEASURE", key.measure ?? "4") +
    v("ECOICOP_2", key.cat ?? "00") +
    `</generic:SeriesKey>` +
    obs
      .map(
        ([m, val]) =>
          `<generic:Obs><generic:ObsDimension id="TIME_PERIOD" value="${m}" /><generic:ObsValue value="${val}" /></generic:Obs>`
      )
      .join("") +
    `</generic:Series>`
  );
}

describe("parseNicGenericData — risposta vera", () => {
  const points = parseNicGenericData(REAL);

  it("ricompone indice e variazione in una riga per serie e mese", () => {
    // 4 serie × 10 mesi (nov 2025 → ago 2026).
    expect(points).toHaveLength(40);
    assertAllCategories(points);
  });

  it("legge i valori pubblicati, nella base giusta", () => {
    const find = (c: string, m: string) => points.find((p) => p.category === c && p.month === m);
    expect(find("00", "2026-08")).toEqual({
      category: "00",
      month: "2026-08",
      baseYear: 2025,
      indexValue: 103.9,
      yoyChangePct: 3.3,
    });
    expect(find("ENRGY", "2026-08")?.yoyChangePct).toBe(17.1);
    expect(find("FOODHPC", "2026-08")?.yoyChangePct).toBe(0.9);
    // Dicembre 2025 è ancora in base 2015: l'indice NON è raccordato qui.
    expect(find("ENRGY", "2025-12")).toMatchObject({ baseYear: 2015, indexValue: 146.1 });
    // Valori interi senza decimali ("102", "1") letti come numeri.
    expect(find("01", "2026-06")?.indexValue).toBe(102);
    expect(find("00", "2026-01")?.yoyChangePct).toBe(1);
  });

  it("cambia base a gennaio 2026, senza mesi in comune", () => {
    const general = points.filter((p) => p.category === "00");
    expect(general.map((p) => p.month)).toEqual([
      "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
      "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
    ]);
    expect(general.filter((p) => p.baseYear === 2015).map((p) => p.month)).toEqual([
      "2025-11",
      "2025-12",
    ]);
  });
});

describe("parseNicGenericData — errori", () => {
  it("rifiuta una risposta di errore in testo semplice", () => {
    // Testo reale della query 10 (dataflow non interrogabile).
    expect(() =>
      parseNicGenericData(
        'Error while retrieving Mappings from "Mapping Store"! Cause:Dataflow ... doesn\'t contain a mapping set'
      )
    ).toThrow(/non è un GenericData/);
  });

  it("rifiuta un GenericData senza serie", () => {
    expect(() => parseNicGenericData(doc())).toThrow(/nessuna serie/);
  });

  it("rifiuta basi, categorie, misure e frequenze sconosciute", () => {
    expect(() => parseNicGenericData(doc(series({ dt: "9" }, [["2026-01", "1"]])))).toThrow(
      /base DATA_TYPE sconosciuta/
    );
    expect(() => parseNicGenericData(doc(series({ cat: "04" }, [["2026-01", "1"]])))).toThrow(
      /categoria ECOICOP_2 sconosciuta/
    );
    expect(() => parseNicGenericData(doc(series({ measure: "6" }, [["2026-01", "1"]])))).toThrow(
      /misura sconosciuta/
    );
    expect(() => parseNicGenericData(doc(series({ freq: "A" }, [["2026", "1"]])))).toThrow(
      /atteso mensile/
    );
  });

  it("rifiuta mesi non validi e valori non numerici, senza trasformarli in zero", () => {
    expect(() => parseNicGenericData(doc(series({}, [["2026-13", "1"]])))).toThrow(/AAAA-MM/);
    expect(() => parseNicGenericData(doc(series({}, [["2026-Q1", "1"]])))).toThrow(/AAAA-MM/);
    expect(() => parseNicGenericData(doc(series({}, [["2026-01", ""]])))).toThrow(/non numerico/);
    expect(() => parseNicGenericData(doc(series({}, [["2026-01", "NaN"]])))).toThrow(
      /non numerico/
    );
  });

  it("rifiuta lo stesso mese in due basi", () => {
    expect(() =>
      parseNicGenericData(
        doc(series({ dt: "39" }, [["2026-01", "123"]]), series({ dt: "85" }, [["2026-01", "100"]]))
      )
    ).toThrow(/sia in base 2015 sia in base 2025/);
  });

  it("rifiuta una misura ripetuta e una variazione senza indice", () => {
    expect(() =>
      parseNicGenericData(doc(series({}, [["2026-01", "100"]]), series({}, [["2026-01", "101"]])))
    ).toThrow(/ripetuta/);
    expect(() =>
      parseNicGenericData(doc(series({ measure: "7" }, [["2026-01", "1.5"]])))
    ).toThrow(/ma non l'indice/);
  });

  it("accetta l'indice senza variazione (variazione null, non zero)", () => {
    const [p] = parseNicGenericData(doc(series({}, [["2026-01", "100.4"]])));
    expect(p.yoyChangePct).toBeNull();
  });
});

describe("assertAllCategories", () => {
  it("segnala le serie mancanti per nome", () => {
    const partial = parseNicGenericData(doc(series({}, [["2026-01", "100"]])));
    expect(() => assertAllCategories(partial)).toThrow(/01, FOODHPC, ENRGY/);
  });
});

describe("buildNicUrl / monthToDate", () => {
  it("chiede tutte le serie e le misure in una sola richiesta", () => {
    expect(buildNicUrl(["39", "85"], "2016-01")).toBe(
      "https://esploradati.istat.it/SDMXWS/rest/data/IT1,167_745_DF_DCSP_NIC1B2025_6,1.0/" +
        "M.IT.39+85.4+7.00+01+FOODHPC+ENRGY?startPeriod=2016-01"
    );
  });

  it("rifiuta un mese di partenza non valido", () => {
    expect(() => buildNicUrl(["85"], "2026-1")).toThrow(/AAAA-MM/);
  });

  it("converte il mese nel primo giorno a mezzanotte UTC", () => {
    expect(monthToDate("2026-08").toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(monthToDate("2025-12").toISOString()).toBe("2025-12-01T00:00:00.000Z");
  });
});

describe("fetchNic", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fa UNA sola richiesta e restituisce i punti", async () => {
    const fetchMock = vi.fn(async () => new Response(REAL, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const points = await fetchNic(["39", "85"], "2025-11");
    expect(points).toHaveLength(40);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("su 429 si ferma senza riprovare, e lo dice", async () => {
    const fetchMock = vi.fn(async () => new Response("Too many requests", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchNic(["85"], "2026-01")).rejects.toThrow(/NON riprovare/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("si ferma se manca una delle quattro serie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(doc(series({}, [["2026-01", "100"]])), { status: 200 }))
    );
    await expect(fetchNic(["85"], "2026-01")).rejects.toThrow(/serie assenti/);
  });
});

describe("cronStartPeriod", () => {
  it("parte 12 mesi prima, anche a cavallo d'anno", () => {
    expect(cronStartPeriod(new Date("2026-09-24T11:00:00Z"))).toBe("2025-09");
    expect(cronStartPeriod(new Date("2027-01-03T11:00:00Z"))).toBe("2026-01");
  });
});

describe("missingMonths", () => {
  it("sul file vero non manca nessun mese", () => {
    const m = missingMonths(parseNicGenericData(REAL), "2025-11");
    expect(m).toEqual({ "00": [], "01": [], FOODHPC: [], ENRGY: [] });
  });

  it("trova i buchi, anche all'inizio", () => {
    const points = parseNicGenericData(
      doc(series({}, [["2026-01", "100"], ["2026-03", "101"]]))
    );
    expect(missingMonths(points, "2025-12")["00"]).toEqual(["2025-12", "2026-02"]);
  });
});
