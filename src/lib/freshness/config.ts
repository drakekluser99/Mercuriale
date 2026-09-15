export type FreshnessState = 'aggiornato' | 'in_attesa' | 'non_aggiornato';

export interface FreshnessConfig {
  expectedIntervalDays: number;
  graceDays: number;
  label: string; // solo per log/debug, non per la UI
}

export const FRESHNESS_CONFIG: Record<string, FreshnessConfig> = {
  // Energia: il dato è GIORNALIERO ma la fonte originale (EIA, prezzi
  // spot) lo PUBBLICA UNA VOLTA A SETTIMANA. Verificato il 15 set 2026
  // sulla pagina EIA: release del 10/9 con dati fino al 9/9 (WTI 97,26,
  // Brent 109,51 — gli stessi valori del sito), prossima release il 16/9.
  // Quindi un ultimo dato di 6-7 giorni prima è il funzionamento normale,
  // non un ritardo. Fino a questa data la configurazione era 1 + 3 giorni
  // e il sito segnava "non aggiornato" per quasi tutta la settimana.
  // 8 giorni = una settimana fra una release e l'altra + il giro del cron;
  // 4 di tolleranza per una release che slitta (festività USA).
  'alpha_vantage:WTI': { expectedIntervalDays: 8, graceDays: 4, label: 'WTI (giornaliero, pubblicato ogni settimana)' },
  'alpha_vantage:BRENT': { expectedIntervalDays: 8, graceDays: 4, label: 'Brent (giornaliero, pubblicato ogni settimana)' },
  'alpha_vantage:NATURAL_GAS': { expectedIntervalDays: 8, graceDays: 4, label: 'Gas naturale (giornaliero, pubblicato ogni settimana)' },

  // Metalli e agricole: interval=daily richiesto dal fetcher ma ignorato
  // dall'API (questi endpoint supportano solo Monthly/Quarterly/Annual,
  // confermato dalla documentazione Alpha Vantage).
  //
  // Il valore è una MEDIA MENSILE datata al primo del mese, e arriva con
  // un ritardo lungo. Verificato il 15 set 2026 interrogando Alpha Vantage
  // per tutte e sette: il dato più recente alla fonte è LUGLIO 2026
  // (datato 1/7, 76 giorni prima) — lo stesso che abbiamo in database.
  // Con la vecchia soglia (30 + 10 giorni) il sito segnava "non
  // aggiornato" una serie perfettamente allineata alla fonte.
  // 80 giorni coprono il ciclo normale (il mese successivo esce circa due
  // mesi e mezzo dopo la data del precedente); 15 di tolleranza per
  // un'uscita che slitta. Oltre i 95 giorni c'è davvero qualcosa che non va.
  'alpha_vantage:COPPER': { expectedIntervalDays: 80, graceDays: 15, label: 'Rame (mensile)' },
  'alpha_vantage:ALUMINUM': { expectedIntervalDays: 80, graceDays: 15, label: 'Alluminio (mensile)' },
  'alpha_vantage:WHEAT': { expectedIntervalDays: 80, graceDays: 15, label: 'Grano (mensile)' },
  'alpha_vantage:CORN': { expectedIntervalDays: 80, graceDays: 15, label: 'Mais (mensile)' },
  'alpha_vantage:COTTON': { expectedIntervalDays: 80, graceDays: 15, label: 'Cotone (mensile)' },
  'alpha_vantage:SUGAR': { expectedIntervalDays: 80, graceDays: 15, label: 'Zucchero (mensile)' },
  'alpha_vantage:COFFEE': { expectedIntervalDays: 80, graceDays: 15, label: 'Caffè (mensile)' },

  // Carburanti: pubblicazione settimanale su giorno fisso. Grace di 3
  // giorni copre un possibile ritardo occasionale della fonte.
  eu_weekly_oil_bulletin: { expectedIntervalDays: 7, graceDays: 3, label: 'Bollettino UE (settimanale)' },
  eia_us: { expectedIntervalDays: 7, graceDays: 3, label: 'EIA USA (settimanale)' },

  // MIMIT (Fase 4): il CSV si aggiorna ogni giorno (dato comunicato il
  // giorno prima). Grace di 2 giorni, più stretto delle fonti settimanali
  // sopra perché una cadenza giornaliera che salta un giorno è già un
  // segnale, non un weekend di mercati chiusi.
  mimit: { expectedIntervalDays: 1, graceDays: 2, label: 'MIMIT (giornaliero)' },

  // BFS Svizzera (blocco D): media MENSILE, datata al primo del mese e
  // pubblicata nei primi giorni del mese dopo. Il dato di agosto (1/8) esce
  // il 3/9 e resta il più recente fino ai primi di ottobre, cioè fino a ~63
  // giorni dopo la sua data: per questo 62 giorni sono ancora "aggiornato".
  // Grace di 10 giorni per una pubblicazione che slitta.
  bfs_lik: { expectedIntervalDays: 62, graceDays: 10, label: 'BFS Svizzera (mensile)' },
};
