import { formatDecimal } from "@/lib/format";
import { INFLATION_SERIES } from "@/lib/inflation";
import { spliceCoefficient } from "@/lib/nicSplice";

/**
 * Metodologia dell'inflazione (24 set 2026, passo 4 della UI di
 * /inflazione).
 *
 * Come ShippingMethodology: i numeri NON sono scritti a mano. I
 * coefficienti di raccordo e la loro provenienza (ufficiale o calcolata)
 * si leggono da nicSplice.ts, gli stessi che usano schede e grafico: se
 * un coefficiente cambia, questa pagina lo dice da sola.
 *
 * Le motivazioni e i fatti sulla fonte sono prosa: la fonte è la voce
 * "Ricognizione ISTAT" in CLAUDE.md, che va tenuta allineata.
 */

const text = "text-sm leading-relaxed text-system-ink-secondary";

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 text-sm font-semibold text-system-ink first:mt-0">{children}</h3>;
}

export function InflationMethodology() {
  return (
    <div>
      <SubHeading>Cosa si misura</SubHeading>
      <p className={`mt-2 ${text}`}>
        L&apos;indice dei prezzi al consumo per l&apos;intera collettività
        (<strong>NIC</strong>) di ISTAT: ogni mese l&apos;Istituto rileva i
        prezzi di un paniere di beni e servizi acquistati dalle famiglie e ne
        calcola un indice. È l&apos;indice con cui ISTAT misura
        l&apos;inflazione del paese. Non va confuso con l&apos;IPCA, la
        versione armonizzata per il confronto fra paesi europei, né con il
        FOI, riferito alle famiglie di operai e impiegati e usato per
        aggiornare gli affitti.
      </p>
      <p className={`mt-2 ${text}`}>
        Il sito segue quattro serie: l&apos;<strong>indice generale</strong>;
        il <strong>carrello della spesa</strong>, che ISTAT chiama «beni
        alimentari, per la cura della casa e della persona»; gli{" "}
        <strong>alimentari e bevande analcoliche</strong>; i{" "}
        <strong>beni energetici</strong>, cioè elettricità, gas, carburanti e
        altri combustibili. Lo storico parte da gennaio 2016.
      </p>

      <SubHeading>La variazione annua</SubHeading>
      <p className={`mt-2 ${text}`}>
        Il numero grande di ogni scheda è la <strong>variazione tendenziale</strong>:
        di quanto sono cambiati i prezzi rispetto allo stesso mese dell&apos;anno
        prima. È il dato che i comunicati chiamano &quot;inflazione&quot;. Il
        sito non la calcola: la prende così come la pubblica ISTAT, con un
        decimale. Per questo non dipende da nessuno dei passaggi descritti
        sotto.
      </p>

      <SubHeading>L&apos;indice e il cambio di base</SubHeading>
      <p className={`mt-2 ${text}`}>
        Un indice dei prezzi è espresso rispetto a un <strong>anno base</strong>,
        la cui media vale 100. Da gennaio 2026 ISTAT usa la base 2025 (e la
        nuova classificazione ECOICOP versione 2); fino a dicembre 2025
        l&apos;indice era in base 2015. I due tratti non si possono mettere uno
        dopo l&apos;altro così come sono: i beni energetici, per esempio, valgono
        146,1 a dicembre 2025 in base 2015 e 98,9 a gennaio 2026 in base 2025. I
        prezzi non sono crollati del 32%: è cambiato il punto di riferimento.
      </p>
      <p className={`mt-2 ${text}`}>
        Per disegnare una serie continua, l&apos;indice fino a dicembre 2025 si
        porta nella base 2025 dividendolo per un <strong>coefficiente di
        raccordo</strong>: la media dei dodici mesi del 2025 nella base vecchia,
        divisa per 100. Nel database l&apos;indice resta nella base in cui ISTAT
        l&apos;ha pubblicato; il raccordo si applica quando il sito lo mostra.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-system-ink-muted">
            <tr className="border-b border-system-border">
              <th className="py-1.5 pr-4 font-normal">Serie</th>
              <th className="py-1.5 pr-4 text-right font-normal">Coefficiente 2015 → 2025</th>
              <th className="py-1.5 font-normal">Provenienza</th>
            </tr>
          </thead>
          <tbody className="text-system-ink-secondary">
            {INFLATION_SERIES.map((s) => {
              const c = spliceCoefficient(s.code);
              return (
                <tr key={s.code} className="border-b border-system-border-subtle">
                  <td className="py-1.5 pr-4 text-system-ink">{s.name}</td>
                  <td className="py-1.5 pr-4 text-right font-mono tabular-nums text-system-ink">
                    {c ? formatDecimal(c.value, 3) : "—"}
                  </td>
                  <td className="py-1.5">
                    {c === null
                      ? "non ancora fissato: il sito mostra solo la variazione annua"
                      : c.kind === "ufficiale"
                        ? "ISTAT"
                        : "calcolato da Mercuriale"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={`mt-3 ${text}`}>
        I coefficienti dell&apos;indice generale e degli alimentari sono quelli
        pubblicati da ISTAT (tabella dei coefficienti di raccordo per i codici
        ECOICOP). Per il carrello della spesa e i beni energetici ISTAT non
        pubblica il raccordo dalla base 2015 alla 2025 (verificato il 24
        settembre 2026: per questi aggregati le tabelle arrivano al passaggio
        dalla base 2010 alla 2015). Li calcola quindi il sito,{" "}
        <strong>con lo stesso metodo</strong>, e il metodo è controllato: lo
        stesso calcolo, fatto sull&apos;indice generale e sugli alimentari,
        deve dare esattamente i due coefficienti ufficiali alla terza cifra
        decimale, altrimenti il caricamento dello storico si ferma. Il
        controllo si ripete a ogni caricamento.
      </p>

      <SubHeading>Limiti da conoscere</SubHeading>
      <ul className={`mt-2 list-disc space-y-2 pl-5 ${text}`}>
        <li>
          Con il passaggio alla classificazione ECOICOP versione 2, ISTAT ha{" "}
          <strong>ricostruito</strong> le serie precedenti al 2026. Per
          l&apos;indice generale non cambia nulla; per le singole voci i
          valori ricostruiti possono differire da quelli pubblicati
          all&apos;epoca con la vecchia classificazione. Il sito usa quelli
          ricostruiti.
        </li>
        <li>
          L&apos;indice è pubblicato con un decimale, e con un decimale sono
          calcolati i coefficienti di Mercuriale: sulla variazione
          &quot;da gennaio 2016&quot; lo scarto possibile è di pochi decimi di
          punto. La variazione annua, presa da ISTAT, non ne risente.
        </li>
        <li>
          ISTAT può <strong>rivedere</strong> i mesi già pubblicati. Il sito
          rilegge ogni giorno gli ultimi dodici mesi: se un valore cambia, lo
          aggiorna e registra la correzione nella pagina «Stato dei dati». I
          dati scaricati non dicono se l&apos;ultimo mese è provvisorio.
        </li>
        <li>
          Il dato di un mese esce verso la metà del mese successivo (agosto
          2026 il 16 settembre): per questo l&apos;ultimo mese mostrato è quasi
          sempre quello precedente al mese in corso.
        </li>
      </ul>
    </div>
  );
}
