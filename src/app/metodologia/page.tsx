import Link from "next/link";
import { SystemCard } from "@/components/SystemCard";
import { ProvenanceStamp } from "@/components/ProvenanceStamp";
import { ShippingMethodology } from "@/components/methodology/ShippingMethodology";

export const metadata = {
  title: "Metodologia — Mercuriale",
};

export default function Metodologia() {
  return (
    <div className="min-h-screen bg-system-bg text-system-ink">
      <header className="border-b border-system-border bg-system-surface">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <Link
            href="/"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-system-accent hover:underline"
          >
            ← Torna alla dashboard
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <ProvenanceStamp size={20} className="text-system-accent" />
            Metodologia
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-system-ink-secondary">
            Come raccogliamo i dati, da dove vengono, e quali sono i loro
            limiti. Un numero senza contesto può essere fuorviante quanto
            un numero sbagliato — qui trovi il contesto.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 space-y-10">
        <Section index="01" title="Fonti dei dati">
          {/* Ordine per argomento: carburanti, materie prime, traffico
              marittimo, cifre annuali. Ogni fonte citata in una nota
              "Fonte:" del sito (registro in src/lib/sources.ts) deve avere
              qui la sua scheda: chi aggiunge una fonte aggiunge anche
              questa. */}
          <SourceItem
            name="Commissione Europea — Weekly Oil Bulletin"
            desc="Prezzi medi settimanali di benzina e diesel in ciascuno dei 27 Stati membri UE, con il prezzo al netto delle imposte, l'accisa e l'aliquota IVA (da cui la scomposizione fiscale) e la media UE ponderata sui consumi."
            link="https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en"
          />
          <SourceItem
            name="EIA — U.S. Energy Information Administration"
            desc="Prezzi medi nazionali settimanali di benzina e diesel negli Stati Uniti, ente statistico ufficiale del governo USA."
            link="https://www.eia.gov/opendata"
          />
          <SourceItem
            name="MIMIT — Ministero delle Imprese e del Made in Italy"
            desc="Prezzi di benzina e gasolio comunicati ogni giorno da ciascun distributore italiano, con l'anagrafica degli impianti (licenza IODL 2.0). Il sito non salva i singoli distributori: calcola le medie per provincia, self e servito separati."
            link="https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti"
          />
          <SourceItem
            name="Ufficio federale di statistica svizzero (BFS)"
            desc="Prezzi medi mensili di benzina e diesel in Svizzera, in franchi, dalla tabella dell'indice dei prezzi al consumo (su-d-05.02.91, licenza OPEN-BY). Usati nel confronto con i paesi confinanti: la Svizzera non è nel bollettino UE."
            link="https://www.bfs.admin.ch"
          />
          <SourceItem
            name="Banca Centrale Europea"
            desc="Cambio di riferimento medio mensile franco svizzero / euro (serie EXR.M.CHF.EUR.SP00.A), con cui i prezzi svizzeri vengono convertiti in euro nello stesso mese."
            link="https://data.ecb.europa.eu"
          />
          <SourceItem
            name="Alpha Vantage"
            desc="Prezzi di petrolio, gas naturale, metalli e materie prime agricole. È un aggregatore commerciale: rilancia dati di altri enti — EIA per petrolio e gas (prezzi giornalieri pubblicati una volta a settimana), Fondo Monetario Internazionale per metalli e agricole (medie mensili con circa due mesi di ritardo)."
            link="https://www.alphavantage.co"
          />
          <SourceItem
            name="IMF PortWatch — Fondo Monetario Internazionale"
            desc="Navi in transito ogni giorno negli stretti di Hormuz e Bab el-Mandeb, stimate dai segnali AIS delle navi. Pubblicate una volta a settimana; storico dal 2019. Metodo nella sezione «Traffico marittimo» qui sotto."
            link="https://portwatch.imf.org"
          />
          <SourceItem
            name="Eurostat"
            desc="Cifre annuali della raccolta «Numeri» (dipendenza energetica, importazioni di petrolio, imposte sull'energia, trasporto merci su strada), dai comunicati dell'ufficio statistico dell'UE. Aggiornate a mano a ogni nuova edizione, non da un cron."
            link="https://ec.europa.eu/eurostat"
          />
          <SourceItem
            name="Agenzia delle Dogane e dei Monopoli"
            desc="Il gettito delle accise sui prodotti energetici, dal bilancio annuale dell'attività dell'Agenzia: una delle cifre della raccolta «Numeri» e del «numero del giorno» in home. Aggiornata a mano ogni primavera, non da un cron."
            link="https://www.adm.gov.it"
          />
        </Section>

        <Section index="02" title="Frequenza di aggiornamento">
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            I dati vengono raccolti automaticamente tramite processi
            pianificati (cron job): le materie prime globali giornalmente,
            i carburanti europei e USA ogni giorno — entrambi i dati sono
            settimanali (il bollettino UE esce di norma il giovedì), ma il
            giorno di pubblicazione può slittare, e un controllo
            quotidiano lo porta sul sito appena esce invece che una
            settimana dopo. Ogni mattina i prezzi delle province italiane
            (MIMIT), ogni giorno il traffico marittimo (PortWatch, che
            pubblica una volta a settimana), nei primi dieci giorni di ogni
            mese i carburanti svizzeri. Non sono dati in tempo reale
            minuto per minuto — il titolo &quot;in tempo quasi reale&quot; si
            riferisce a questo: aggiornati regolarmente, non istantanei.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-system-ink-secondary">
            Ogni serie ha tre stati possibili, calcolati confrontando la data
            dell&apos;ultimo valore con la cadenza attesa per quella fonte:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-system-ink-secondary">
            <li>
              <strong>Aggiornato</strong> — nessun badge: l&apos;ultimo
              valore rientra nella cadenza attesa: 8 giorni per petrolio e
              gas naturale (prezzi giornalieri che l&apos;EIA pubblica una
              volta a settimana), 7 per i carburanti, 80 per metalli e
              agricole (medie mensili che arrivano con circa due mesi di
              ritardo), 1 per i prezzi delle province italiane (MIMIT, ogni
              giorno), 62 per i carburanti svizzeri (media mensile), 9 per
              il traffico marittimo (dati giornalieri pubblicati una volta a
              settimana, fino alla domenica precedente).
            </li>
            <li>
              <strong>&quot;In attesa&quot;</strong> — la cadenza attesa è
              passata da poco, ma restiamo dentro un margine di tolleranza
              (da 2 a 4 giorni per le serie giornaliere e settimanali, da 10
              a 15 per le mensili) pensato per coprire un ritardo occasionale della
              fonte: un weekend, una festività, una pubblicazione slittata.
            </li>
            <li>
              <strong>&quot;Non aggiornato&quot;</strong> — anche il margine
              di tolleranza è superato: il valore mostrato è l&apos;ultimo
              che abbiamo, ma potrebbe non essere più quello corrente.
            </li>
          </ul>
        </Section>

        <Section index="03" title="Limiti da conoscere">
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-system-ink-secondary">
            <li>
              I prezzi dei carburanti sono <strong>medie nazionali</strong>,
              non il prezzo di un singolo distributore. Il prezzo reale
              in una specifica città o area può differire, anche di
              parecchio.
            </li>
            <li>
              Il calcolatore &quot;Cosa significa in pratica&quot; usa
              consumi <strong>stimati</strong> (capacità serbatoio auto e
              litri/100km camion), non misurati: il consumo reale dipende
              dal veicolo specifico, dal carico e dallo stile di guida.
            </li>
            <li>
              I prezzi Europa (EUR) e USA (USD) non vengono convertiti in
              una valuta comune: un confronto diretto richiederebbe un
              tasso di cambio aggiornato, che questo progetto non applica
              ancora.
            </li>
            <li>
              La <strong>&quot;media dei 27&quot;</strong> mostrata in mappa
              e in tabella è una media <strong>semplice</strong> tra i 27
              paesi UE: Malta pesa quanto la Germania. La Commissione
              Europea pubblica anche una propria media, ponderata sui
              consumi reali di ciascun paese, e le due non coincidono.
              Dal 15 settembre 2026 il sito mostra anche quella, sotto la
              mappa e nella cifra chiave della pagina «Carburanti in Europa», con
              l&apos;etichetta &quot;media UE ponderata sui consumi&quot;.
              Non sono in contraddizione: rispondono a domande diverse
              (&quot;qual è il prezzo tipico di un paese UE&quot; contro
              &quot;quanto paga in media il litro effettivamente consumato
              in Europa&quot;), e per questo qui si usa sempre l&apos;etichetta
              esplicita &quot;media dei 27&quot; invece del generico
              &quot;media UE&quot;.
            </li>
            <li>
              La <strong>Svizzera</strong>, unico paese confinante fuori
              dall&apos;UE, non è nel bollettino della Commissione. Il suo
              prezzo viene dall&apos;Ufficio federale di statistica (BFS),
              che pubblica una <strong>media mensile</strong> in franchi
              svizzeri; lo convertiamo in euro con il cambio di riferimento
              medio della Banca Centrale Europea dello stesso mese. Per
              questo il riquadro svizzero indica il mese e il prezzo in
              franchi, e non entra nella &quot;media dei 27&quot; né nelle
              classifiche.
            </li>
          </ul>
        </Section>

        <Section index="04" title="Traffico marittimo" id="traffico-marittimo">
          <ShippingMethodology />
        </Section>

        <Section index="05" title="Codice sorgente">
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            Questo è un progetto open source: chiunque può ispezionare il
            codice, verificare come i dati vengono raccolti e processati,
            o contribuire con miglioramenti. Il codice è rilasciato sotto
            licenza MIT; i dati di prezzo restano soggetti ai termini delle
            rispettive fonti.
          </p>
        </Section>

        <Section index="06" title="API pubblica">
          <p className="text-sm leading-relaxed text-system-ink-secondary">
            Gli stessi ultimi prezzi mostrati sulla dashboard sono
            disponibili in JSON, per riusarli in altri progetti:
          </p>
          <p className="mt-3">
            <code className="rounded border border-system-border bg-system-panel px-2 py-1 font-mono text-xs text-system-ink">
              GET https://commodity-tracker-one-delta.vercel.app/api/data
            </code>
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-system-ink-secondary">
            <li>
              Nessuna autenticazione. Header{" "}
              <code className="font-mono text-xs">
                Access-Control-Allow-Origin: *
              </code>
              , quindi si può chiamare anche da un browser di terze parti.
            </li>
            <li>
              I prezzi sono i valori <strong>grezzi</strong> come salvati
              dalla fonte: nessuna conversione di visualizzazione (il
              cotone resta in <code className="font-mono text-xs">cents per
              pound</code>, non cents/kg come in tabella).
            </li>
            <li>
              <code className="font-mono text-xs">price</code> è numerico;
              le date sono ISO 8601 in UTC. Risposta rigenerata a ogni
              richiesta.
            </li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-system-ink-secondary">
            Esempio di risposta (abbreviata):
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md border border-system-border bg-system-panel p-4 font-mono text-xs leading-relaxed text-system-ink-secondary">
{`{
  "generatedAt": "2026-08-31T12:00:00.000Z",
  "commodities": [
    {
      "symbol": "BRENT",
      "name": "Brent Crude Oil",
      "category": "energy",
      "price": 88.24,
      "unit": "dollars per barrel",
      "recordedAt": "2026-08-25T00:00:00.000Z"
    }
  ],
  "fuelPrices": [
    {
      "region": "Italy",
      "continent": "europe",
      "fuelType": "petrol",
      "price": 2.003,
      "currency": "EUR",
      "recordedAt": "2026-08-24T00:00:00.000Z"
    }
  ]
}`}
          </pre>
        </Section>
      </main>

      <footer className="mx-auto max-w-3xl px-6 py-10 text-xs text-system-ink-muted">
        Progetto open source · dati pubblici, nessuna garanzia di accuratezza
      </footer>
    </div>
  );
}

function Section({
  index,
  title,
  id,
  children,
}: {
  index: string;
  title: string;
  /** Ancora per i link da altre pagine (es. /metodologia#traffico-marittimo). */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    // `scroll-mt-16`: arrivando da un link con l'ancora, il titolo non
    // finisce sotto il bordo superiore della finestra.
    <section id={id} className="scroll-mt-16">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-system-ink-muted">{index} /</span>
        <h2 className="text-lg font-semibold text-system-ink">{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SourceItem({ name, desc, link }: { name: string; desc: string; link: string }) {
  return (
    <SystemCard className="mb-4 last:mb-0">
      <div className="flex items-start gap-2">
        <ProvenanceStamp size={18} className="mt-0.5 shrink-0 text-system-accent" />
        <div>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-system-accent hover:underline"
          >
            {name} ↗
          </a>
          <p className="mt-1 text-sm leading-relaxed text-system-ink-secondary">
            {desc}
          </p>
        </div>
      </div>
    </SystemCard>
  );
}
