import {
  CHOKEPOINT_BASELINES,
  STRONGLY_REDUCED_BELOW_PCT,
} from "@/lib/chokepointHistory";
import { formatDecimal, formatIsoDay, formatPercent } from "@/lib/format";

/**
 * Metodologia del traffico marittimo (24 set 2026, passo 5 della UI).
 *
 * I numeri NON sono scritti a mano: periodi, date di rottura, valori del
 * normale e soglie si leggono da CHOKEPOINT_BASELINES (chokepointHistory.ts),
 * la stessa costante che usano schede, mappa e grafico. Se un giorno si
 * aggiorna una baseline, questa pagina dice la cosa nuova da sola e non
 * può contraddire quello che il sito calcola.
 *
 * Le MOTIVAZIONI invece sono prosa, e vanno riviste a mano se cambiano i
 * periodi: il commento sopra CHOKEPOINT_BASELINES è la fonte.
 */

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

const text = "text-sm leading-relaxed text-system-ink-secondary";

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 text-sm font-semibold text-system-ink first:mt-0">{children}</h3>;
}

export function ShippingMethodology() {
  const hormuz = CHOKEPOINT_BASELINES.hormuz;
  const bab = CHOKEPOINT_BASELINES.bab_el_mandeb;
  const suez = CHOKEPOINT_BASELINES.suez;
  const period = (p: { from: string; to: string }) =>
    `dal ${formatIsoDay(p.from)} al ${formatIsoDay(p.to)}`;

  return (
    <div>
      <SubHeading>Cosa si misura</SubHeading>
      <p className={`mt-2 ${text}`}>
        Il numero di navi che ogni giorno attraversano lo Stretto di Hormuz,
        lo Stretto di Bab el-Mandeb e il Canale di Suez, di tutte le
        categorie (portacontainer,
        rinfuse, petroliere, ro-ro, carico generale). Lo pubblica il Fondo
        Monetario Internazionale con <strong>IMF PortWatch</strong>, che lo
        ricava dai segnali AIS trasmessi dalle navi: è una{" "}
        <strong>stima</strong> costruita da quei segnali, non un registro
        ufficiale dei passaggi. Una nave con il trasmettitore spento può
        sfuggire al conteggio.
      </p>
      <p className={`mt-2 ${text}`}>
        La fonte pubblica una volta a settimana, di norma il martedì, i giorni
        fino alla domenica precedente: il dato più recente ha quindi sempre
        qualche giorno. Il sito controlla ogni giorno e conserva lo storico
        dal 1° gennaio 2019.
      </p>

      <SubHeading>Perché la media degli ultimi 7 giorni</SubHeading>
      <p className={`mt-2 ${text}`}>
        Un giorno solo oscilla troppo per dire qualcosa: a Hormuz, in un
        settembre normale, si va da circa 60 a circa 130 navi al giorno. Il
        sito confronta con il normale la <strong>media dei 7 giorni</strong>{" "}
        che finiscono con l&apos;ultimo dato pubblicato. Se manca anche uno
        dei 7 giorni la media non si calcola: una media su meno giorni sarebbe
        un numero diverso da quello dichiarato. Per lo stesso motivo, nel
        grafico, la linea si interrompe invece di scavalcare il buco.
      </p>

      <SubHeading>Il traffico &quot;normale&quot;</SubHeading>
      <p className={`mt-2 ${text}`}>
        Per ogni passaggio il normale è la media giornaliera di un periodo di
        riferimento scelto guardando lo storico dal 2019. I valori sono{" "}
        <strong>fissati</strong>, non ricalcolati a ogni aggiornamento: se la
        fonte correggesse un dato vecchio, il riferimento descritto qui
        resterebbe lo stesso.
      </p>
      <ul className={`mt-3 list-disc space-y-3 pl-5 ${text}`}>
        <li>
          <strong>Stretto di Hormuz — un valore per ogni mese</strong>, periodo{" "}
          {period(hormuz.period)}. Il traffico ha un ciclo annuale netto, più
          basso d&apos;inverno e più alto da aprile a settembre: con un valore
          unico ogni inverno normale sembrerebbe un&apos;anomalia. Restano
          fuori il 2019–2021, su un livello più basso, e l&apos;inverno
          2025-26, il più basso dal 2019, che non si può escludere fosse già un
          primo segnale della crisi.
          {/* Griglia e non tabella: 6 mesi per riga sul telefono, 12 da
              `sm`. Una tabella da 12 colonne su un telefono scorreva di lato
              e nascondeva metà dei mesi. */}
          <dl
            aria-label="Transiti normali al giorno nello Stretto di Hormuz, per mese"
            className="mt-2 grid grid-cols-6 gap-y-2 text-xs sm:grid-cols-12"
          >
            {hormuz.monthly.map((v, i) => (
              <div key={MONTHS[i]} className="text-right">
                <dt className="font-mono uppercase text-system-ink-muted">{MONTHS[i]}</dt>
                <dd className="font-mono tabular-nums text-system-ink">{formatDecimal(v)}</dd>
              </div>
            ))}
          </dl>
        </li>
        <li>
          <strong>Stretto di Bab el-Mandeb — un valore unico</strong>,{" "}
          {formatDecimal(bab.value)} navi al giorno, periodo{" "}
          {period(bab.period)}: l&apos;anno che precede la rottura. Qui il
          ciclo annuale non c&apos;è, ma il traffico cresceva lentamente dal
          2019: includere gli anni più vecchi abbasserebbe il riferimento.
        </li>
        <li>
          <strong>Canale di Suez — un valore unico</strong>,{" "}
          {formatDecimal(suez.value)} navi al giorno, periodo{" "}
          {period(suez.period)}: l&apos;anno che precede la rottura, con lo
          stesso criterio di Bab el-Mandeb. Anche qui nessun ciclo annuale e
          una crescita lenta, da circa 50 navi al giorno nel 2019 a circa 74
          nel 2023.
        </li>
      </ul>

      <SubHeading>Le rotture</SubHeading>
      <p className={`mt-2 ${text}`}>
        La data dalla quale il traffico cambia livello e non torna indietro,
        letta nei dati giornalieri: <strong>{formatIsoDay(bab.breakDate)}</strong>{" "}
        per Bab el-Mandeb, <strong>{formatIsoDay(suez.breakDate)}</strong>{" "}
        per Suez (una settimana dopo) e{" "}
        <strong>{formatIsoDay(hormuz.breakDate)}</strong> per Hormuz. Il
        sito registra quando il traffico cambia, non ne attribuisce le
        cause.
      </p>

      <SubHeading>Gli stati</SubHeading>
      <p className={`mt-2 ${text}`}>
        Lo scostamento è la media dei 7 giorni rispetto al normale del giorno
        finale (per Hormuz, quello del suo mese). Le soglie non sono
        percentuali scelte a tavolino: vengono da quanto oscillava la stessa
        media nel periodo di riferimento, quando il traffico era normale per
        definizione.
      </p>
      <ul className={`mt-3 list-disc space-y-2 pl-5 ${text}`}>
        <li>
          <strong>Normale</strong> — la media resta sopra la soglia di
          &quot;ridotto&quot;, come succede in 95 settimane normali su 100.
        </li>
        <li>
          <strong>Ridotto</strong> — sotto il 5° percentile del periodo di
          riferimento: {formatPercent(hormuz.reducedBelowPct)} per Hormuz,{" "}
          {formatPercent(bab.reducedBelowPct)} per Bab el-Mandeb,{" "}
          {formatPercent(suez.reducedBelowPct)} per Suez. Le soglie sono
          diverse perché Hormuz oscilla circa il doppio degli altri due anche
          in tempi normali. Circa una settimana normale su venti risulta comunque
          &quot;ridotto&quot;: è un segnale, non un allarme.
        </li>
        <li>
          <strong>Fortemente ridotto</strong> — sotto{" "}
          {formatPercent(STRONGLY_REDUCED_BELOW_PCT, 0)}, per tutti e tre: più
          in basso di qualunque settimana del periodo di riferimento. Non
          {" "}{formatPercent(-50, 0)}: dal 2024 Bab el-Mandeb oscilla attorno a
          quel valore e lo stato cambierebbe di continuo senza che la
          situazione cambi. Un limite dichiarato: dal 2024 Suez sta attorno
          a −46%, poco sotto la soglia, e circa una settimana su venti
          risulta &quot;ridotto&quot; invece di &quot;fortemente
          ridotto&quot;. Quella settimana il traffico è stato davvero meno
          lontano dal normale: la soglia resta la stessa per tutti.
        </li>
      </ul>
      <p className={`mt-2 ${text}`}>
        Non esiste uno stato &quot;aumentato&quot;: anche un +15% rientra
        nell&apos;oscillazione normale. I colori sono neutro, ocra e ruggine,
        mai il verde, che nel resto del sito vuol dire &quot;in discesa&quot;
        ed è una buona notizia per un prezzo. Lo stato è sempre scritto, mai
        affidato solo al colore.
      </p>

      <SubHeading>Il carico stimato</SubHeading>
      <p className={`mt-2 ${text}`}>
        Oltre al numero di navi, la fonte stima quanta merce hanno trasportato
        in <strong>tonnellate metriche</strong> (campo{" "}
        <code className="font-mono text-xs">capacity</code>, somma delle stime
        per cisterne e navi da carico). È una stima costruita dai segnali AIS
        e dalle caratteristiche delle navi, non una dichiarazione doganale.
        Le schede la mostrano per l&apos;ultimo giorno pubblicato, accanto al
        numero di navi di quel giorno.
      </p>
      <p className={`mt-2 ${text}`}>
        L&apos;unità è stata controllata sui dati: nel 2023 le cisterne in
        transito a Hormuz risultano in media 2,7 milioni di tonnellate al
        giorno, in linea con i circa 20 milioni di barili di petrolio al
        giorno che passano per lo Stretto secondo l&apos;EIA. Se il campo
        fosse la portata delle navi, cioè quanto potrebbero caricare, il
        valore sarebbe molto più alto, perché conterebbe anche le cisterne che
        entrano nel Golfo vuote.
      </p>
      <p className={`mt-2 ${text}`}>
        In alcuni giorni la stima vale zero anche se sono passate navi (a
        Hormuz è successo 11 volte dal 2019): il sito lo tratta come{" "}
        <strong>stima non disponibile</strong>, non come carico nullo.
      </p>

      <SubHeading>Il Brent accanto ai transiti</SubHeading>
      <p className={`mt-2 ${text}`}>
        Nel grafico il prezzo del Brent è disegnato sotto i transiti, sullo
        stesso asse del tempo, in un grafico separato e non su un secondo
        asse: con due scale sovrapposte, il punto in cui le linee si
        incrociano lo deciderebbe chi sceglie i limiti degli assi. Il grafico
        mostra i due andamenti; non dice che uno dipenda dall&apos;altro.
      </p>
    </div>
  );
}
