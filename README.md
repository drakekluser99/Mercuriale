# Mercuriale

Osservatorio aperto dei prezzi: materie prime globali, carburanti al consumo,
inflazione in Italia e traffico marittimo nei passaggi obbligati. Ogni dato
con la sua fonte, la sua data e i suoi limiti dichiarati esplicitamente.

Il nome viene dal *mercuriale*, il listino ufficiale dei prezzi all'ingrosso
che le Camere di Commercio pubblicavano periodicamente: la stessa cosa che
fa questo sito, con fonti diverse. (Il repository resta `commodity-tracker`,
come i nomi di file e le variabili interne.)

**Sito live:** https://commodity-tracker-one-delta.vercel.app

![Home: materie prime, carburanti e fonti in linea](docs/readme/hero.png)

## Perché esiste

I prezzi delle materie prime, dei carburanti e dei beni di consumo esistono
già, pubblici, ma sparsi su bollettini istituzionali diversi (Commissione
Europea, EIA, MIMIT, ISTAT, Fondo Monetario Internazionale…), ognuno con
formato, lingua e cadenza propria. Mercuriale li mette in un unico posto, con
una regola sola: **nessun numero senza fonte, data e limiti dichiarati**. E
quando un dato non è più aggiornato, il sito lo dice invece di nasconderlo
dietro un valore che sembra vivo.

## Le sezioni

La home è una panoramica: una fascia con i valori principali, la sintesi
della settimana e una cifra chiave per ogni sezione. Il dettaglio sta nelle
pagine dedicate.

| # | Pagina | Cosa trovi |
| --- | --- | --- |
| 01 | [Carburanti in Europa](https://commodity-tracker-one-delta.vercel.app/europa) | Mappa dei 27 paesi UE (prezzo, quota fiscale, accisa), Italia contro i paesi confinanti (Svizzera compresa), tabelle e andamento fino a 10 anni. Una pagina per ogni paese, con la scomposizione in accisa, IVA e altre imposte |
| 02 | [Cosa significa](https://commodity-tracker-one-delta.vercel.app/calcolatore) | Quanto costa un pieno o 100 km oggi, un mese fa e un anno fa, e quanto ne va in imposte |
| 03 | [Materie prime](https://commodity-tracker-one-delta.vercel.app/materie-prime) | Petrolio, gas, metalli e agricole, con storico fino a 10 anni |
| 04 | [Province italiane](https://commodity-tracker-one-delta.vercel.app/italia) | Benzina e gasolio, self e servito, nelle 107 province, dai prezzi comunicati ogni giorno da ciascun distributore. Una pagina per provincia |
| 05 | [Traffico marittimo](https://commodity-tracker-one-delta.vercel.app/traffico-marittimo) | Navi in transito a Hormuz, Bab el-Mandeb e Suez contro il traffico normale, con mappa e grafico accanto al Brent |
| 06 | [Inflazione](https://commodity-tracker-one-delta.vercel.app/inflazione) | Variazione annua dei prezzi al consumo (indice generale, carrello della spesa, alimentari, beni energetici) e indice dal 2016 |

Pagine di servizio: [Metodologia](https://commodity-tracker-one-delta.vercel.app/metodologia)
(fonti, metodi e limiti), [Glossario](https://commodity-tracker-one-delta.vercel.app/glossario),
[Numeri](https://commodity-tracker-one-delta.vercel.app/numeri) (cifre annuali
da ADM ed Eurostat) e [Stato dei dati](https://commodity-tracker-one-delta.vercel.app/stato-dati),
dove si vede quando ogni fonte è stata interrogata l'ultima volta e quali
valori sono stati corretti.

| Mappa Europa | Calcolatore |
| --- | --- |
| ![Mappa interattiva dei prezzi carburante nei 27 paesi UE](docs/readme/mappa.png) | ![Calcolatore: costo di un pieno o di 100 km, Europa vs USA](docs/readme/calcolatore.png) |

| Province italiane | Stato dei dati |
| --- | --- |
| ![Carburanti in Italia, provincia per provincia, dati MIMIT](docs/readme/province.png) | ![Pipeline di acquisizione dati, job per job, con ultima esecuzione](docs/readme/stato-dati.png) |

## Fonti dati e frequenza di aggiornamento

| Fonte | Dati | Il dato esce | Il sito controlla |
| --- | --- | --- | --- |
| [Commissione Europea](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en) (Weekly Oil Bulletin) | Carburanti nei 27 paesi UE, con prezzo netto, accisa, IVA e media UE ponderata | Settimanale, di norma il giovedì | Ogni giorno |
| [EIA](https://www.eia.gov/opendata/) (U.S. Energy Information Administration) | Carburanti negli Stati Uniti | Settimanale | Ogni giorno |
| [MIMIT](https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti) | Carburanti in Italia, stazione per stazione, aggregati per provincia | Giornaliero | Ogni giorno |
| [BFS](https://www.bfs.admin.ch) (Ufficio federale di statistica svizzero) + [BCE](https://data.ecb.europa.eu) | Carburanti in Svizzera, in franchi, convertiti con il cambio medio mensile | Mensile | Nei primi dieci giorni del mese |
| [Alpha Vantage](https://www.alphavantage.co/documentation/#commodities) (rilancia EIA e FMI) | Petrolio, gas, metalli, agricole | Energia: prezzi giornalieri pubblicati ogni settimana. Metalli e agricole: medie mensili con circa due mesi di ritardo | Ogni giorno, a lotti |
| [IMF PortWatch](https://portwatch.imf.org) (Fondo Monetario Internazionale) | Navi in transito nei passaggi marittimi, stimate dai segnali AIS | Settimanale, dati giornalieri | Ogni giorno |
| [ISTAT](https://esploradati.istat.it) | Indice dei prezzi al consumo NIC (inflazione) | Mensile, verso metà del mese successivo | Ogni giorno |
| [Eurostat](https://ec.europa.eu/eurostat) e [ADM](https://www.adm.gov.it) | Cifre annuali della raccolta «Numeri» | Annuale | A mano, a ogni nuova edizione |

L'aggiornamento è gestito da cron job schedulati in `vercel.json`, che
chiamano gli endpoint protetti sotto `src/app/api/cron/`. Ogni esecuzione è
registrata in `fetch_runs`, e ogni valore che una fonte ripubblica diverso
finisce nel registro `data_corrections`: entrambi sono consultabili
pubblicamente in [/stato-dati](https://commodity-tracker-one-delta.vercel.app/stato-dati).
Ogni serie ha tre stati di freschezza (aggiornato, in attesa, non aggiornato),
calcolati sulla cadenza reale della sua fonte: vedi la
[Metodologia](https://commodity-tracker-one-delta.vercel.app/metodologia).

## Stack tecnico

- [Next.js 16](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS 4, grafici con Recharts, mappe con react-simple-maps
- Drizzle ORM + [Neon](https://neon.tech) Postgres (serverless)
- Deploy su [Vercel](https://vercel.com), con redeploy automatico a ogni push su `main`
- [Vitest](https://vitest.dev) per le funzioni pure: parser delle fonti,
  calcoli di freschezza, statistiche, raccordo degli indici, formattazione
- CI su GitHub Actions a ogni push e PR (tipi generati da Next, typecheck,
  lint, test); `main` è protetto e accetta solo modifiche con la CI verde

## API pubblica

```
GET /api/data
```

Restituisce in JSON gli ultimi prezzi di materie prime e carburanti UE/USA,
senza autenticazione e con CORS aperto. I valori sono grezzi come salvati
dalla fonte, senza conversioni di visualizzazione. Vedi
[`src/app/api/data/route.ts`](src/app/api/data/route.ts).

## Sviluppo locale

```bash
npm install
npx next typegen   # genera i tipi delle route: serve a `tsc` su una copia nuova
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

### Variabili d'ambiente

Crea un file `.env.local` nella cartella del progetto con questi valori:

| Variabile | Obbligatoria | Descrizione |
| --- | --- | --- |
| `DATABASE_URL` | sì | Connection string Postgres di Neon |
| `CRON_SECRET` | sì | Stringa segreta che protegge gli endpoint `/api/cron/*` (es. `openssl rand -hex 32`) |
| `ALPHA_VANTAGE_API_KEY` | per il cron materie prime | API key gratuita — https://www.alphavantage.co/support/#api-key |
| `EIA_API_KEY` | per il cron carburanti USA | API key gratuita — https://www.eia.gov/opendata/register.php |

Le altre fonti (Commissione Europea, MIMIT, BFS, BCE, IMF PortWatch, ISTAT)
sono pubbliche e non richiedono chiavi.

### Comandi utili

```bash
npm run dev            # server di sviluppo
npm run build          # build di produzione
npm test               # suite di test Vitest
npm run lint           # ESLint
npm run db:generate    # genera le migrazioni Drizzle dallo schema
npm run db:migrate     # applica le migrazioni al database
npm run db:studio      # Drizzle Studio
```

Caricamento dello storico (si lanciano a mano, una volta, dopo una
migrazione o una fonte nuova; sono idempotenti):

```bash
npm run backfill:commodities   # materie prime, 10 anni
npm run backfill:eu-fuel       # carburanti UE, 10 anni
npm run backfill:us-fuel       # carburanti USA
npm run backfill:ch-fuel       # carburanti Svizzera
npm run backfill:chokepoints   # traffico marittimo dal 2019 (senza --save solo lettura)
npm run backfill:nic           # inflazione ISTAT dal 2016 (una sola richiesta, poi --file)
```

Gli script `npm run inspect:*` leggono una fonte e stampano cosa ne
ricaverebbe il sito, senza scrivere nel database.

## Contribuire

Segnalazioni di errori, proposte di nuove fonti e correzioni sono benvenute:
vedi [CONTRIBUTING.md](CONTRIBUTING.md) o apri direttamente una
[issue](https://github.com/drakekluser99/Mercuriale/issues/new).

## Licenza

Codice rilasciato sotto licenza [MIT](./LICENSE). I dati provengono da fonti
terze (Commissione Europea, EIA, MIMIT, BFS, BCE, Alpha Vantage, IMF
PortWatch, ISTAT, Eurostat, ADM), ciascuna con i propri termini d'uso: non
sono coperti dalla licenza del codice.

## Disclaimer

Dati pubblici, **nessuna garanzia di accuratezza**. I prezzi sono medie
nazionali o provinciali o dati di mercato ritardati, non quotazioni in tempo
reale né prezzi di punti vendita specifici. Vedi la
[pagina Metodologia](https://commodity-tracker-one-delta.vercel.app/metodologia)
per fonti, limiti e frequenza di aggiornamento.

## Autore

Creato da [Yuri Copparini](https://www.linkedin.com/in/yuri-copparini).
