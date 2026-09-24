import Link from "next/link";
import { CopyButton } from "./CopyButton";
import { SITE_URL } from "@/lib/site";

/**
 * "Come citare questi dati" (15 set 2026).
 *
 * PERCHÉ: uno dei primi feedback reali veniva da chi scrive ("lo terrò in
 * considerazione qualora dovessi scrivere di temi analoghi"). Chi scrive un
 * articolo ha bisogno di tre cose, in fretta: una riga di citazione pronta,
 * la fonte ORIGINALE dietro il numero, e il dato scaricabile. Questo
 * riquadro le mette insieme.
 *
 * La citazione nomina sempre le fonti primarie insieme a Mercuriale:
 * Mercuriale raccoglie e confronta, non produce i prezzi. Citare solo il
 * sito farebbe sparire l'ente che li ha rilevati, contro il principio
 * "ogni dato con la sua fonte".
 *
 * `consultedOn` arriva già formattato dalla pagina (Server Component,
 * ri-renderizzata a ogni richiesta): la data di consultazione è quella in
 * cui la pagina è stata servita.
 */
export function CiteBox({ consultedOn }: { consultedOn: string }) {
  const citation =
    `Mercuriale, osservatorio aperto dei prezzi — elaborazione su dati ` +
    `Commissione Europea (Weekly Oil Bulletin), EIA, MIMIT, Alpha Vantage e IMF PortWatch. ` +
    `${SITE_URL} (consultato il ${consultedOn}).`;

  return (
    <section className="mt-12 rounded-lg border border-system-border bg-system-surface p-5">
      <h2 className="text-lg font-semibold text-system-ink">
        Come citare questi dati
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-system-ink-secondary">
        Per articoli, tesi e ricerche: cita Mercuriale insieme alla fonte
        originale del numero che usi, indicata sotto ogni sezione. Ogni
        fonte ha le proprie condizioni di riutilizzo.
      </p>

      <div className="mt-4 flex flex-col gap-3 rounded-md border border-system-border-subtle bg-system-bg p-3 sm:flex-row sm:items-start sm:justify-between">
        {/* `select-all`: un clic seleziona l'intera citazione, utile se il
            pulsante di copia non funziona in quel browser. */}
        <p className="select-all font-mono text-xs leading-relaxed text-system-ink">
          {citation}
        </p>
        <CopyButton text={citation} />
      </div>

      <ul className="mt-4 grid gap-2 text-sm text-system-ink-secondary sm:grid-cols-3">
        <li>
          <span className="font-medium text-system-ink">Dati grezzi:</span>{" "}
          pulsanti &quot;Scarica CSV/JSON&quot; delle tabelle, oppure
          l&apos;API pubblica{" "}
          {/* <a> e non <Link>: /api/data è una route che risponde JSON, non
              una pagina — la navigazione client di Next non serve. */}
          <a href="/api/data" className="font-mono text-system-accent hover:underline">
            /api/data
          </a>
          .
        </li>
        <li>
          <span className="font-medium text-system-ink">Come sono calcolati:</span>{" "}
          <Link href="/metodologia" className="text-system-accent hover:underline">
            Metodologia
          </Link>{" "}
          (medie, imposte, limiti di ogni fonte).
        </li>
        <li>
          <span className="font-medium text-system-ink">Quanto sono aggiornati:</span>{" "}
          <Link href="/stato-dati" className="text-system-accent hover:underline">
            Stato dei dati
          </Link>{" "}
          (ultima rilevazione di ogni fonte).
        </li>
      </ul>
    </section>
  );
}
