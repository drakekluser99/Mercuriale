import type { ReactNode } from "react";
import Link from "next/link";
import { SystemCard } from "@/components/SystemCard";
import { ProvenanceStamp } from "@/components/ProvenanceStamp";
import {
  getLatestFetchRuns,
  getRecentCorrections,
  type FetchRunSummary,
  type DataCorrectionRow,
} from "@/lib/db/queries";
import { computeFreshness, getFreshnessConfig } from "@/lib/freshness/compute";
import { formatCommodityPrice, formatFuelPrice, formatDate, formatDateTime } from "@/lib/format";

export const metadata = {
  title: "Stato dei dati — Mercuriale",
};

// Pagina di osservabilità della pipeline, non di freshness dei dati (quella
// vive già in ogni card della homepage, calcolata con computeFreshness).
// Le due domande sono diverse — vedi il commento su `latest_recorded_at` in
// schema.ts — e questa pagina esiste apposta per quella che l'homepage non
// può rispondere: "il nostro cron sta girando?" contro "la fonte ha
// pubblicato?". Server Component, ri-renderizzata a ogni richiesta: uno
// stato di pipeline vecchio di ore darebbe un falso senso di sicurezza.
export const dynamic = "force-dynamic";

/**
 * Etichetta leggibile per ogni JOB registrato in fetch_runs. Elenco chiuso
 * e scritto a mano (non derivato da un pattern sul nome) perché i 5 job
 * Alpha Vantage non hanno una cadenza uniforme fra loro — vedi il commento
 * su SOURCE_LEVEL_FRESHNESS più sotto — quindi l'etichetta deve dire
 * esplicitamente quali materie prime copre ciascuno, non solo il numero.
 */
const JOB_LABELS: Record<string, string> = {
  "fetch-market-prices-1": "Materie prime — batch 1 (WTI, Brent)",
  "fetch-market-prices-2": "Materie prime — batch 2 (gas naturale, rame)",
  "fetch-market-prices-3": "Materie prime — batch 3 (alluminio, grano)",
  "fetch-market-prices-4": "Materie prime — batch 4 (mais, cotone)",
  "fetch-market-prices-5": "Materie prime — batch 5 (zucchero, caffè)",
  "fetch-eu-fuel-prices": "Carburanti — Unione Europea",
  "fetch-us-fuel-prices": "Carburanti — Stati Uniti",
  "fetch-mimit-prices": "Carburanti — Italia, per provincia (MIMIT)",
};

/**
 * Se il job è uno dei 5 batch Alpha Vantage, non calcoliamo un badge di
 * freshness a livello di job: ogni batch mescola materie prime a cadenza
 * DIVERSA (es. il batch 2 ha gas naturale, aggiornato ogni giorno, e rame,
 * aggiornato ogni mese — vedi COMMODITY_BATCH_2 in alphaVantage.ts).
 * `latestRecordedAt` del run è la più recente delle due, quindi un badge
 * unico per il job direbbe "fresco" o "fermo" guardando solo la serie più
 * veloce, nascondendo l'altra. Meglio non calcolarlo che calcolarlo male:
 * la data grezza resta comunque in tabella, solo senza interpretazione.
 * Per i due job carburanti, invece, tutta la fonte condivide un'unica
 * cadenza settimanale (vedi FRESHNESS_CONFIG), quindi lì il badge è affidabile.
 */
// `mimit` aggiunto il 15 set 2026: anche lì un solo job, una sola cadenza
// (giornaliera), e da quel giorno `latest_recorded_at` è la data vera
// dell'estrazione e non l'ora del download (vedi mimitExtractedOn.ts).
const SOURCE_LEVEL_FRESHNESS = new Set(["eu_weekly_oil_bulletin", "eia_us", "mimit"]);

/** Quante correzioni mostrare — vedi getRecentCorrections in queries.ts,
 *  stesso numero passato esplicitamente qui per poterlo citare nel testo. */
const CORRECTIONS_LIMIT = 20;

const FIELD_LABELS: Record<string, string> = {
  price: "prezzo",
  price_net: "prezzo netto",
  excise_eur: "accisa",
  vat_rate_percent: "aliquota IVA",
};

export default async function StatoDati() {
  const [runs, corrections] = await Promise.all([
    getLatestFetchRuns(),
    getRecentCorrections(CORRECTIONS_LIMIT),
  ]);
  const now = new Date();

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
            Stato dei dati
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-system-ink-secondary">
            Non i prezzi, ma la pipeline che li porta qui: quando ogni fonte
            è stata interrogata l&apos;ultima volta, se con successo, e ogni
            volta che un valore già pubblicato è stato corretto da una
            versione successiva della stessa fonte. Stessa filosofia del
            resto del sito applicata al processo, non solo al dato — vedi{" "}
            <Link href="/metodologia" className="text-system-accent hover:underline">
              Metodologia
            </Link>
            .
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 space-y-10">
        <Section index="01" title="Pipeline di acquisizione">
          <p className="mb-4 text-sm leading-relaxed text-system-ink-secondary">
            L&apos;ultima esecuzione registrata di ciascun processo
            automatico (cron). L&apos;etichetta risponde a due domande
            diverse: se il nostro processo ha funzionato, e se la fonte ha
            pubblicato dati nuovi.
          </p>
          <ul className="mb-4 space-y-1 text-sm leading-relaxed text-system-ink-secondary">
            <li>
              <strong className="text-system-ink">Aggiornato</strong>: il
              processo ha funzionato e il dato è recente per la cadenza della
              fonte.
            </li>
            <li>
              <strong className="text-system-ink">In attesa</strong>: il
              processo ha funzionato, la fonte non ha ancora pubblicato il
              dato successivo. È normale fra un&apos;uscita e l&apos;altra.
            </li>
            <li>
              <strong className="text-system-ink">Fonte ferma</strong>: il
              dato è più vecchio del ritardo tollerato per quella fonte.
            </li>
            <li>
              <strong className="text-system-ink">Eseguito</strong>: il
              processo ha funzionato, ma qui non diamo un giudizio sulla
              freschezza (vedi &quot;Limiti di questa pagina&quot;): guarda la
              data del dato più recente.
            </li>
            <li>
              <strong className="text-system-ink">Errore</strong> /{" "}
              <strong className="text-system-ink">interrotto</strong>: il
              nostro processo non è arrivato in fondo. Il problema è nostro,
              non della fonte.
            </li>
          </ul>
          {runs.length === 0 ? (
            <SystemCard>
              <p className="text-sm text-system-ink-secondary">
                Nessuna esecuzione registrata ancora.
              </p>
            </SystemCard>
          ) : (
            <div className="space-y-3">
              {runs.map((run) => (
                <RunCard key={run.job} run={run} now={now} />
              ))}
            </div>
          )}
        </Section>

        <Section index="02" title="Correzioni recenti">
          <p className="mb-4 text-sm leading-relaxed text-system-ink-secondary">
            Ogni volta che un fetcher sovrascrive un valore già salvato con
            uno diverso — una fonte che rivede una settimana passata, non un
            valore nuovo — la correzione resta qui invece di sparire in
            silenzio. Le prime scritture (nessun valore precedente) non
            contano come correzioni. Le più recenti per data di rilevazione
            (massimo {CORRECTIONS_LIMIT}).
          </p>
          {corrections.length === 0 ? (
            <SystemCard>
              <p className="text-sm text-system-ink-secondary">
                Nessuna correzione registrata finora — ogni valore visto
                finora è stato o una prima scrittura, o identico a quello
                già salvato.
              </p>
            </SystemCard>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-system-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-system-border bg-system-surface text-left text-xs uppercase tracking-wider text-system-ink-muted">
                    <th className="px-4 py-3 font-medium">Rilevata</th>
                    <th className="px-4 py-3 font-medium">Entità</th>
                    <th className="px-4 py-3 font-medium">Campo</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Vecchio → nuovo
                    </th>
                    <th className="px-4 py-3 font-medium">Settimana/data dato</th>
                  </tr>
                </thead>
                <tbody>
                  {corrections.map((c, i) => (
                    <CorrectionRow key={i} correction={c} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section index="03" title="Limiti di questa pagina">
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-system-ink-secondary">
            <li>
              I 5 batch Alpha Vantage non mostrano un badge di freschezza a
              livello di pipeline: ogni batch mescola materie prime a
              cadenza diversa (giornaliera e mensile), quindi un giudizio
              unico &quot;fresco/fermo&quot; per l&apos;intero job
              nasconderebbe l&apos;altra serie. La freschezza per singola
              materia prima resta quella già mostrata in homepage.
            </li>
            <li>
              Per i prezzi provinciali italiani (MIMIT) la data del dato è
              affidabile dal 15 settembre 2026: prima veniva registrata
              l&apos;ora del download invece della data dell&apos;estrazione,
              e le rilevazioni di quei giorni sono state rimosse.
            </li>
            <li>
              &quot;Correzioni recenti&quot; è un registro degli ultimi
              eventi, non un archivio completo consultabile per intervallo
              di date.
            </li>
          </ul>
        </Section>
      </main>

      <footer className="mx-auto max-w-3xl px-6 py-10 text-xs text-system-ink-muted">
        Progetto open source · dati pubblici, nessuna garanzia di accuratezza
      </footer>
    </div>
  );
}

function RunCard({ run, now }: { run: FetchRunSummary; now: Date }) {
  const label = JOB_LABELS[run.job] ?? run.job;

  const showFreshness = SOURCE_LEVEL_FRESHNESS.has(run.source);
  const freshness =
    showFreshness && run.latestRecordedAt
      ? computeFreshness(run.latestRecordedAt, getFreshnessConfig(run.source), now)
      : null;

  return (
    <SystemCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-system-ink-muted">
            {run.job}
          </p>
          <p className="mt-1 text-sm font-semibold text-system-ink">{label}</p>
        </div>
        <StatusBadge run={run} freshness={freshness} now={now} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wider text-system-ink-muted">
            Ultima esecuzione
          </dt>
          <dd className="mt-0.5 font-mono tabular-nums text-system-ink">
            {formatDateTime(run.startedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-system-ink-muted">
            Punti salvati
          </dt>
          <dd className="mt-0.5 font-mono tabular-nums text-system-ink">
            {run.pointsSaved ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-system-ink-muted">
            Dato più recente
          </dt>
          <dd className="mt-0.5 font-mono tabular-nums text-system-ink">
            {/* Solo la data, senza ora: `latest_recorded_at` è il giorno a
                cui si riferisce il dato (sempre mezzanotte), e un "00:00"
                in pagina faceva pensare a un orario di rilevazione. */}
            {run.latestRecordedAt ? formatDate(run.latestRecordedAt) : "—"}
          </dd>
        </div>
      </dl>

      {run.errorText && (
        <p className="mt-3 rounded border border-system-signal-up/40 bg-system-signal-up/5 px-3 py-2 font-mono text-xs text-system-signal-up">
          {run.errorText}
        </p>
      )}
    </SystemCard>
  );
}

// Oltre questa soglia, un run ancora "ok: null" non è più credibile come
// "in corso": le funzioni serverless di Vercel hanno un maxDuration di
// pochi secondi (vedi `export const maxDuration` nelle route cron), quindi
// un run partito da più di 10 minuti e mai concluso ha quasi certamente
// fallito senza che finishFetchRun venisse mai chiamato (crash, timeout
// della piattaforma) — non un'esecuzione ancora in volo.
const STALE_RUN_MINUTES = 10;

function StatusBadge({
  run,
  freshness,
  now,
}: {
  run: FetchRunSummary;
  freshness: ReturnType<typeof computeFreshness> | null;
  now: Date;
}) {
  // Il run stesso non è andato a buon fine: questo prevale su qualunque
  // giudizio di freschezza, che riguarderebbe solo il dato più vecchio già
  // in tabella.
  if (run.ok === false) {
    return <Badge tone="up">errore</Badge>;
  }
  if (run.ok === null) {
    const minutesSinceStart = (now.getTime() - run.startedAt.getTime()) / 60000;
    return minutesSinceStart > STALE_RUN_MINUTES ? (
      <Badge tone="up">interrotto</Badge>
    ) : (
      <Badge tone="wait">in corso</Badge>
    );
  }
  if (freshness === "non_aggiornato") {
    return <Badge tone="up">fonte ferma</Badge>;
  }
  if (freshness === "in_attesa") {
    return <Badge tone="wait">in attesa</Badge>;
  }
  if (freshness === "aggiornato") {
    return <Badge tone="down">aggiornato</Badge>;
  }
  // Nessun giudizio di freschezza (i batch Alpha Vantage, vedi
  // SOURCE_LEVEL_FRESHNESS): fino al 15 set 2026 qui c'era un "ok" verde,
  // che accanto a un dato fermo da 76 giorni si leggeva come "tutto
  // aggiornato". "Eseguito", neutro, dice solo ciò che sappiamo: il
  // processo ha funzionato.
  return <Badge tone="neutral">eseguito</Badge>;
}

function Badge({
  tone,
  children,
}: {
  tone: "up" | "down" | "wait" | "neutral";
  children: ReactNode;
}) {
  const toneClass = {
    neutral: "border-system-border text-system-ink-secondary",
    up: "border-system-signal-up/40 text-system-signal-up",
    down: "border-system-signal-down/40 text-system-signal-down",
    wait: "border-system-signal-wait/40 text-system-signal-wait",
  }[tone];
  return (
    <span
      className={`shrink-0 rounded border px-2 py-1 font-mono text-[10px] uppercase leading-none tracking-wider ${toneClass}`}
    >
      {children}
    </span>
  );
}

function CorrectionRow({ correction }: { correction: DataCorrectionRow }) {
  const fieldLabel = FIELD_LABELS[correction.field] ?? correction.field;

  return (
    <tr className="border-b border-system-border last:border-b-0">
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-system-ink-muted">
        {formatDateTime(correction.detectedAt)}
      </td>
      <td className="px-4 py-3 text-system-ink">{correction.entityLabel}</td>
      <td className="px-4 py-3 text-system-ink-secondary">{fieldLabel}</td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums">
        <span className="text-system-ink-muted">
          {formatCorrectionValue(correction.field, correction.tableName, correction.oldValue)}
        </span>{" "}
        →{" "}
        <span className="text-system-ink">
          {formatCorrectionValue(correction.field, correction.tableName, correction.newValue)}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-system-ink-muted">
        {formatDateTime(correction.recordedAt)}
      </td>
    </tr>
  );
}

/**
 * Formatta il vecchio/nuovo valore di una correzione secondo cosa
 * rappresenta davvero quel `field` — non tutti i campi di
 * `data_corrections` sono un prezzo:
 *   - `vat_rate_percent` è un'ALIQUOTA (es. 22,000), non un prezzo: usare
 *     formatFuelPrice qui mostrerebbe "22,000" senza segno percentuale,
 *     leggibile come un prezzo per errore.
 *   - `price` su `price_history` è un prezzo di mercato (2 decimali);
 *     `price`/`price_net`/`excise_eur` su `retail_fuel_prices` sono
 *     prezzi o componenti di prezzo carburante (3 decimali, euro/litro).
 */
function formatCorrectionValue(
  field: string,
  tableName: string,
  raw: string
): string {
  const value = Number(raw);
  if (field === "vat_rate_percent") {
    return `${new Intl.NumberFormat("it-IT", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 3,
    }).format(value)}%`;
  }
  return tableName === "retail_fuel_prices"
    ? formatFuelPrice(value)
    : formatCommodityPrice(value);
}

function Section({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-system-ink-muted">{index} /</span>
        <h2 className="text-lg font-semibold text-system-ink">{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
