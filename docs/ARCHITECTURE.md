# Architettura tecnica — Diario Allenamenti (PWA)

Documento sintetico delle decisioni di progetto. Per uso e installazione vedere il `README.md`.

## 1. Analisi dei requisiti (sintesi)

| Area | Requisiti chiave | Rischi tecnici |
|---|---|---|
| PWA / offline | installabile Android, funziona senza rete, dati locali immediati | cache SW obsoleta, eviction dello storage del browser |
| Dati | template ≠ sessione reale, dati mancanti ≠ zero, cardio separato, versione schema | migrazioni, integrità storico |
| Programmi | N schede per programma (A/B, A/B/C/D…), più programmi, archiviazione | nessuna assunzione "solo A/B" |
| Calendario | giorni abituali, sequenza, 2 modalità per i giorni saltati, override per data | logica date/fusi orari |
| Allenamento attivo | 2–3 tocchi per serie, timer, pausa, ripresa dopo chiusura, schermo acceso | timer in background limitato dal browser |
| Progressione | suggerisce senza applicare, regole per esercizio (fissa, %, doppia, mantenimento, manuale, nessuna) | motore isolato dalla UI |
| Analisi | esercizio + periodo, metriche (carico, reps, volume, 1RM stimato, RPE/RIR), trend, confronto periodi, record | grafici che non inventano continuità |
| Backup | Google Drive (auto/manuale/ripristino), JSON/CSV, import validato | OAuth solo client-side, conflitti, token scaduti |

Ambiguità risolte autonomamente (non bloccanti):
- **Recupero effettivo**: misurato dal tocco "Fine serie" fino a stop/salto del timer o sua scadenza naturale; modificabile nello storico.
- **Carico di riferimento** per "ultima volta" e progressione: carico più usato nelle serie completate (a parità, il maggiore).
- **Record**: si segnala "nuovo record" solo quando si supera un valore precedente (la prima sessione crea la baseline). Le serie anomale possono essere corrette o escluse dalle statistiche.
- **Trend**: regressione lineare sui valori per sessione; servono ≥ 3 sessioni, altrimenti "dati insufficienti". Variazioni entro ±2,5% = stabile.
- **Buchi nei grafici**: la linea viene interrotta se tra due sessioni passano più di 21 giorni o se il valore manca.
- **Dati demo**: database IndexedDB completamente separato (`allenamento-demo`), mai sincronizzato.

## 2. Stack

| Scelta | Motivo |
|---|---|
| **Vite + React + TypeScript** | stack standard, build veloce, tipizzazione forte per il modello dati |
| **Dexie (IndexedDB)** | database strutturato, persistente, indici, transazioni, migrazioni versionate; `useLiveQuery` aggiorna la UI al cambio dati |
| **vite-plugin-pwa (Workbox)** | manifest + service worker precache generati e versionati a ogni build |
| **Recharts** | grafici React dichiarativi, gestione esplicita dei valori nulli (nessun collegamento artificiale) |
| **Zod** | validazione rigorosa dei file di backup prima di toccare il DB |
| **Google Identity Services + Drive REST v3** | OAuth ufficiale lato client, scope minimo `drive.appdata` (cartella nascosta dell'app) |
| **Vitest + fake-indexeddb + Testing Library** | unit e integration test del DB reale Dexie in Node |
| **Playwright** | test PWA end-to-end (service worker, offline, persistenza) |

Nessun backend: l'app è statica, ospitabile su qualunque hosting HTTPS.
Nessuna libreria di stato globale: lo stato persistente vive in IndexedDB (fonte di verità), lo stato UI è locale ai componenti.

## 3. Struttura del progetto

```
src/
  domain/        logica pura, senza DB né UI (testabile in isolamento)
    types.ts         entità del modello dati
    dates.ts         date locali ISO (yyyy-mm-dd), senza problemi di fuso
    metrics.ts       volume, reps, metriche per sessione, riepilogo "ultima volta"
    oneRm.ts         formule 1RM stimato (Epley, Brzycki, Lombardi)
    trend.ts         regressione lineare e classificazione trend
    progression.ts   motore di progressione (regole configurabili)
    schedule.ts      calendario, sequenza schede, modalità giorni saltati
    records.ts       record personali
    analysis.ts      serie temporali, sintesi periodo, confronto periodi
    units.ts         kg/lb
    search.ts        ricerca esercizi (case/accent-insensitive)
  data/          persistenza
    db.ts            schema Dexie versionato + migrazioni
    seed.ts          programma iniziale (schede A e B)
    demo.ts          generatore dataset demo (DB separato)
    repo/*.ts        repository: programmi, esercizi, sessioni, calendario, impostazioni, statistiche
  services/      servizi applicativi con effetti collaterali
    timer.ts         timer di recupero basato su timestamp assoluti (sopravvive a sospensione/ricarica)
    feedback.ts      suono (Web Audio) e vibrazione
    wakeLock.ts      schermo acceso durante l'allenamento
    backup/          formato, export JSON/CSV, import validato, merge
    drive/           OAuth GIS, client Drive, servizio di sincronizzazione
    logger.ts        logging (debug solo in sviluppo)
  ui/            componenti, pagine, hook, stili
tests/e2e/       test Playwright PWA
```

## 4. Modello dati

Tutti i record sincronizzabili hanno: `id` (UUID stringa), `createdAt`, `updatedAt`, `deletedAt` (tombstone: le cancellazioni si propagano con la sincronizzazione).

- **Program** — nome, descrizione, stato `active|archived`, configurazione calendario (giorni, data inizio, modalità).
- **WorkoutTemplate** — `programId`, codice (A, B, …), nome, descrizione, posizione nella sequenza.
- **Exercise** — nome, gruppo muscolare, descrizione, tipo (`strength|bodyweight|cardio`), campi cardio abilitati, regola di progressione (null = default), note, attivo.
- **WorkoutExercise** — `workoutTemplateId`, `exerciseId`, ordine, serie, reps min/max, recupero, durata prevista, note.
- **WorkoutSession** — `programId`, `workoutTemplateId`, data, inizio/fine, pause, durata attiva, stato (`in_progress|paused|completed|abandoned`), note, **snapshot** di nomi programma/scheda.
- **SessionExercise** — copia dei target della scheda al momento dell'avvio (serie, reps, recupero, nome, tipo), stato (`pending|completed|partial|skipped`), note.
- **SetRecord** — serie reale: carico (kg), reps, durata, distanza, velocità, inclinazione, livello, calorie, recupero effettivo, RPE, RIR, `completed`, `excludedFromStats`, note, timestamp. **Valori assenti = `null`**, mai 0.
- **ScheduleOverride** — data → scheda (o riposo) per un programma, senza modificare il programma.
- **Settings** — record unico sincronizzabile.
- **Meta** (locale, non sincronizzato) — deviceId, stato sync, snapshot locali pre-ripristino.

**Template vs sessione reale**: all'avvio di un allenamento i target della scheda vengono copiati in `SessionExercise`; le serie registrate referenziano la sessione. Modificare la scheda non tocca mai sessioni passate (test dedicato).

**Versionamento**: `APP_VERSION` (package.json) e `DB_VERSION` (schema Dexie) visibili in Impostazioni e scritti in ogni backup; `formatVersion` del backup con migrazioni in import.

## 5. Calendario

- **Modalità "mantieni sequenza"**: la prossima scheda è quella successiva all'ultima eseguita; un giorno saltato non consuma la scheda.
- **Modalità "segui calendario"**: ogni giorno di allenamento dalla data di inizio ha uno slot fisso (`indice % n schede`); un giorno saltato consuma lo slot.
- **Override**: una data può essere assegnata a un'altra scheda o a riposo, solo per quel giorno.

## 6. Sincronizzazione Google Drive

- Scope `drive.appdata`: l'app vede solo i propri file, in una cartella nascosta.
- Token OAuth solo in memoria (nessuna credenziale salvata); logout = revoca token.
- File `sync.json` (stato corrente) + `backup-<timestamp>.json` (versioni, ultime 10).
- **Sync**: scarica remoto → valida → merge per id (last-write-wins su `updatedAt`, tombstone incluse) → scrive in locale in una transazione → carica il risultato. Id deterministici per i dati iniziali evitano duplicati tra dispositivi.
- Offline o token assente: le modifiche restano locali, lo stato "in sospeso" è visibile.
- Ripristino: validazione completa, snapshot locale automatico, sostituzione transazionale.

## 7. Strategia di test

| Livello | Strumento | Copertura |
|---|---|---|
| Unit (dominio) | Vitest | date/ora legale, volume, 1RM, trend, progressione (tutte le regole), calendario A/B e A/B/C/D con entrambe le modalità e override, record, analisi, confronto periodi, ricerca, timer |
| Integration (DB) | Vitest + fake-indexeddb (Dexie reale) | seed, avvio sessione con snapshot, serie, pausa, chiusura con dati non registrati, ripresa dopo chiusura, template vs storico, programmi/schede/esercizi, scenario reale lun/mer/ven, analisi Chest Press 2026 |
| Backup/sync | Vitest + Drive simulato in memoria | export/import, file corrotti o incoerenti, copie di sicurezza, merge LWW e tombstone, CSV, due dispositivi, conflitti, offline, token scaduto, versioni di backup |
| E2E PWA | Playwright su build di produzione (Chrome di sistema) | manifest/icone, service worker, offline con registrazione e ricarica, flusso completo nell'interfaccia |

## 8. Limiti del browser (gestiti)

- Timer in background: i timer JS possono essere sospesi; il timer usa timestamp assoluti e al ritorno mostra subito lo stato corretto (e notifica se il permesso è concesso e il browser esegue ancora la pagina).
- Wake Lock: usato se disponibile, ripreso al ritorno in primo piano.
- Vibrazione non disponibile su iOS; il feedback visivo è sempre presente.
