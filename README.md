# Diario Allenamenti

PWA **offline-first** per registrare gli allenamenti in palestra dallo smartphone Android: programmi con un numero qualsiasi di schede (A/B, A/B/C/D…), calendario con sequenza automatica, registrazione serie per serie, timer di recupero, suggerimenti di progressione, storico completo, analisi con grafici e trend, record personali, backup JSON/CSV e sincronizzazione con Google Drive.

Tutti i dati vengono salvati **subito sul telefono** (IndexedDB). Internet serve solo per Google Drive.

---

## Indice

1. [Funzionalità](#funzionalità)
2. [Stack tecnologico](#stack-tecnologico)
3. [Avvio locale, build e test](#avvio-locale-build-e-test)
4. [Struttura del progetto](#struttura-del-progetto)
5. [Database](#database)
6. [Backup, importazione ed esportazione](#backup-importazione-ed-esportazione)
7. [Google Drive](#google-drive)
8. [Pubblicazione e installazione su Android](#pubblicazione-e-installazione-su-android)
9. [Limitazioni note](#limitazioni-note)
10. [Evoluzioni possibili](#evoluzioni-possibili)

Documentazione tecnica: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Funzionalità

| Area | Cosa fa |
|---|---|
| **Home** | Prossimo allenamento (data, programma, scheda) con «Inizia allenamento», allenamento in corso da riprendere, ultimo allenamento (durata, volume), progresso sintetico (sessioni recenti, record, esercizi migliorati/peggiorati), accesso rapido. |
| **Programmi** | Più programmi, ognuno con N schede in sequenza. Crea, modifica, duplica, archivia, riattiva, elimina (lo storico resta). Programma iniziale «Scheda palestra» con le schede A e B. |
| **Schede ed esercizi** | Aggiungi/rimuovi/riordina/sostituisci esercizi; serie, ripetizioni min–max, recupero, durata, note. Libreria esercizi con ricerca («panca» → Panca piana, Panca inclinata…), gruppo muscolare, tipo (sovraccarico, corpo libero, cardio), campi cardio configurabili, regola di progressione per esercizio. |
| **Calendario** | Giorni abituali (es. lun/mer/ven), data di inizio, sequenza automatica. Due modalità per i giorni saltati: *mantieni la sequenza* o *segui il calendario*. Cambio scheda/riposo per una singola data senza toccare il programma. Registrazione a posteriori di un allenamento passato. |
| **Allenamento attivo** | Testo grande, pulsanti grandi, uso con una mano. Per ogni esercizio: obiettivo, «Ultima volta», suggerimento, serie con carico/ripetizioni precompilati dall'ultima volta. Registrare una serie = 1 tocco («FINE SERIE»). Serie extra, recupero modificabile, RPE/RIR e note opzionali, salta esercizio, aggiungi esercizio, pausa (esclusa dalla durata), schermo sempre acceso, ripresa dopo chiusura accidentale. |
| **Timer di recupero** | Parte a «Fine serie» con il recupero configurato; pausa, stop, +15 s, +30 s, salta. A fine recupero: vibrazione, suono (volume regolabile) e indicazione visiva. Il recupero effettivo viene registrato sulla serie. |
| **Progressione** | Regole: progressione doppia, incremento fisso, incremento percentuale, mantenimento, manuale, nessun suggerimento. Segnala i peggioramenti. **Suggerisce soltanto**: il carico cambia solo se l'utente tocca «Usa questo carico». |
| **Storico** | Elenco cronologico filtrabile (programma, scheda, esercizio, gruppo muscolare, periodo). Dettaglio serie per serie con recuperi effettivi, stati (completato/parziale/saltato), note; serie «non registrate» distinte; correzione dei dati e esclusione dei valori anomali da statistiche e record. |
| **Analisi progressione** | Esercizio + data iniziale + data finale → ANALIZZA. Grafico per carico, ripetizioni, volume, 1RM stimato, RPE/RIR (cardio: durata, distanza, velocità, calorie) con linea di tendenza; sintesi del periodo (sessioni, valori iniziali/finali, variazione %, trend con colore + icona + testo); record nel periodo; tabella sessioni; **confronto tra due periodi**. |
| **Dashboard progressi** | Esercizi migliorati/stabili/peggiorati, record recenti, volume e frequenza settimanali, statistiche per programma e per gruppo muscolare, ultimi allenamenti. |
| **Backup** | Esporta JSON (completo) e CSV (tutte le serie), importa con validazione (unisci o sostituisci), copie di sicurezza automatiche, Google Drive con sincronizzazione, backup versionati e ripristino. |
| **Impostazioni** | kg/lb, tema scuro/chiaro/sistema, suono/volume/vibrazione/notifica, recupero predefinito, incremento carico, regola di progressione predefinita, formula 1RM, programma attivo e calendario, backup, dati demo, versioni e diagnostica. |

### Regole sui dati

- **Template ≠ sessione reale**: all'avvio di un allenamento i target della scheda vengono copiati nella sessione. Modificare una scheda (es. da 3 × 10 a 4 × 8) non cambia gli allenamenti già eseguiti.
- **Dati mancanti ≠ zero**: una serie non confermata viene salvata come «non registrata» (valori vuoti) ed è esclusa da grafici e statistiche.
- **Esercizi distinti**: sostituire Chest Press con Panca piana non mescola i due storici.
- **Dati demo separati**: la modalità demo usa un altro database IndexedDB e non viene mai sincronizzata.

---

## Stack tecnologico

| Componente | Scelta |
|---|---|
| UI | React 19 + TypeScript, CSS senza framework (tema con variabili, alto contrasto) |
| Build | Vite 8 |
| Routing | React Router (hash router: funziona su qualsiasi hosting statico) |
| Database locale | IndexedDB tramite Dexie 4 (schema versionato) |
| PWA | vite-plugin-pwa / Workbox (manifest, service worker, precache, aggiornamento su conferma) |
| Grafici | Recharts |
| Validazione backup | Zod |
| Google Drive | Google Identity Services (OAuth token model) + Drive REST v3, scope `drive.appdata` |
| Test | Vitest + fake-indexeddb + Testing Library; Playwright per i test PWA end-to-end |

Nessun backend: la build è un sito statico.

---

## Avvio locale, build e test

Requisiti: **Node.js 20+** (sviluppato con Node 24) e npm.

```bash
npm install
```

```bash
npm run dev
```

L'app è su http://localhost:5173 (in sviluppo il service worker è disattivato).

```bash
npm run build
```

Controlla i tipi (`tsc`) e crea la build di produzione in `dist/` con manifest e service worker.

```bash
npm run preview
```

Serve la build su http://localhost:4173 con il service worker attivo (per provare l'offline).

### Test

```bash
npm test
```

Unit e integration test (Vitest, database IndexedDB reale simulato con fake-indexeddb): volume, 1RM, trend, progressione, calendario e sequenze, date/ora legale, record, analisi e confronto periodi, repository (avvio sessione, serie, pausa, chiusura, recupero dopo chiusura, template vs storico, programmi), timer, backup/import/export/CSV, merge, sincronizzazione Drive tra due dispositivi (con Drive simulato), dati demo.

```bash
npm run build && npm run test:e2e
```

Test end-to-end con Playwright sulla build di produzione (usa il Chrome installato, `channel: 'chrome'`): manifest e icone, service worker, **funzionamento offline** con registrazione di una serie e ricarica, scenario reale nell'interfaccia (allenamento → storico → analisi → periodo senza dati).

Le icone PNG sono già in `public/icons`; per rigenerarle: `npm run icons`.

---

## Struttura del progetto

```
├─ docs/ARCHITECTURE.md        decisioni tecniche e modello dati
├─ public/                     favicon e icone PWA
├─ scripts/generate-icons.mjs  generatore icone PNG (senza dipendenze)
├─ src/
│  ├─ domain/                  logica pura e testabile (nessun DB, nessuna UI)
│  │   types.ts                modello dati
│  │   dates.ts format.ts units.ts search.ts
│  │   metrics.ts              volume, metriche per sessione, «ultima volta»
│  │   oneRm.ts                1RM stimato (Epley, Brzycki, Lombardi)
│  │   trend.ts                regressione lineare e classificazione del trend
│  │   progression.ts          motore di progressione
│  │   schedule.ts             calendario e sequenza delle schede
│  │   records.ts              record personali
│  │   analysis.ts             serie per grafici, sintesi e confronto periodi
│  │   dashboard.ts            filtri e statistiche aggregate
│  │   session.ts              durata effettiva, stato esercizi
│  ├─ data/
│  │   db.ts                   schema Dexie, versione DB, DB reale/demo
│  │   seed.ts                 programma iniziale (schede A e B)
│  │   demo.ts                 generatore dati demo
│  │   repo/                   programmi, esercizi, sessioni, calendario, impostazioni, statistiche
│  ├─ services/
│  │   timer.ts                timer di recupero (timestamp assoluti, persistito)
│  │   feedback.ts wakeLock.ts logger.ts
│  │   backup/                 schema Zod, backup/ripristino, merge, CSV
│  │   drive/                  OAuth Google, client Drive, sincronizzazione
│  ├─ ui/
│  │   App.tsx                 avvio, routing, gestione errori, effetti globali
│  │   pages/                  Home, Allenamento, Calendario, Storico, Programmi, Progressi, Analisi, Impostazioni…
│  │   components/             stepper numerico, timer, grafici, editor…
│  └─ main.tsx
└─ tests/e2e/                  test Playwright
```

---

## Database

- **IndexedDB** tramite Dexie, nome `diario-allenamenti` (demo: `diario-allenamenti-demo`).
- Tabelle: `programs`, `workoutTemplates`, `exercises`, `workoutExercises`, `sessions`, `sessionExercises`, `sets`, `scheduleOverrides`, `settings` (sincronizzate) + `meta` e `snapshots` (solo locali).
- Ogni record sincronizzabile ha `id` UUID, `createdAt`, `updatedAt`, `deletedAt` (le cancellazioni sono *tombstone*, così si propagano agli altri dispositivi).
- Carichi sempre in kg: la conversione in lb è solo di visualizzazione.
- All'avvio l'app chiede al browser l'archiviazione persistente (evita la cancellazione automatica dei dati).

**Versionamento**: versione app in `package.json` (mostrata in Impostazioni); versione schema `DB_VERSION` in `src/data/db.ts`; versione del formato di backup `BACKUP_FORMAT_VERSION`. Per cambiare lo schema: incrementare `DB_VERSION` e aggiungere `this.version(N).stores(...).upgrade(...)` mantenendo le versioni precedenti; per il backup aggiungere una migrazione in `migrate()` di `services/backup/backup.ts`.

---

## Backup, importazione ed esportazione

In **Impostazioni → Backup e sincronizzazione**:

- **Esporta JSON**: backup completo (tutte le tabelle, versione app/DB, data, id dispositivo).
- **Esporta CSV**: una riga per serie, compatibile con Excel in italiano (separatore `;`, decimali con virgola, UTF-8). Le serie non registrate hanno celle vuote.
- **Importa backup**: il file viene validato *prima* di toccare il database (JSON valido, formato, versione, schema di ogni record, coerenza dei riferimenti). Poi si sceglie:
  - **Unisci**: aggiunge ciò che manca e aggiorna i record più recenti (nessun duplicato: i record hanno id univoci);
  - **Sostituisci**: rimpiazza tutti i dati.
- Prima di ogni sostituzione/unione viene creata una **copia di sicurezza locale** (le ultime 5 sono ripristinabili). Le scritture sono transazionali: un errore a metà non lascia dati parziali.

---

## Google Drive

L'app usa l'OAuth ufficiale di Google direttamente dal browser, con lo scope minimo **`drive.appdata`**: può leggere e scrivere solo i propri file in una cartella nascosta del tuo Drive (non vede gli altri file). Nessuna password viene gestita dall'app; il token di accesso resta solo in memoria.

### 1. Creare il Client ID (una volta sola)

1. Apri [Google Cloud Console](https://console.cloud.google.com/) e crea un progetto (es. «Diario Allenamenti»).
2. **API e servizi → Libreria**: abilita **Google Drive API**.
3. **API e servizi → Schermata consenso OAuth** (Google Auth Platform):
   - tipo utente **Esterno**, nome app ed email;
   - **Accesso ai dati / Ambiti**: aggiungi `https://www.googleapis.com/auth/drive.appdata`;
   - **Pubblico / Utenti di test**: aggiungi il tuo account Google (per uso personale l'app può restare in modalità *Test*).
4. **API e servizi → Credenziali → Crea credenziali → ID client OAuth**:
   - tipo **Applicazione web**;
   - **Origini JavaScript autorizzate**: l'indirizzo HTTPS dove pubblichi l'app (es. `https://tuonome.github.io`) e, per le prove, `http://localhost:5173` e `http://localhost:4173`;
   - gli URI di reindirizzamento non servono.
5. Copia il **Client ID** (`…apps.googleusercontent.com`).

### 2. Configurare l'app

- Opzione A (build): crea `.env.local` partendo da `.env.example` con `VITE_GOOGLE_CLIENT_ID=...` e rifai la build.
- Opzione B (senza rebuild): nell'app, **Impostazioni → Backup e sincronizzazione**, incolla il Client ID e salva.

### 3. Uso

- **Connetti Google Drive** → scegli l'account e autorizza.
- **Sincronizza ora**: unisce i dati del telefono con `sync.json` su Drive (per id, vince la modifica più recente; le cancellazioni si propagano; i conflitti vengono risolti e conteggiati). Un file remoto non valido non modifica i dati locali.
- **Backup ora**: crea una versione `backup-AAAAMMGG-HHMMSS.json`; vengono conservate le ultime 10.
- **Ripristina un backup**: sceglie una versione e sostituisce i dati locali (con copia di sicurezza).
- **Backup automatico**: con app aperta, rete e Drive collegato, sincronizza periodicamente, quando l'app va in background e al ritorno della rete, e crea una versione al giorno.
- **Disconnetti e revoca accesso**: revoca il token presso Google.

**Cambiare telefono**: installa l'app sul nuovo telefono, collega lo stesso account Google e tocca *Sincronizza ora* (oppure *Ripristina un backup*).

Errori gestiti con messaggi comprensibili: offline, token scaduto (401), permessi, quota Drive esaurita, troppe richieste, server non disponibile, file danneggiati.

---

## Pubblicazione e installazione su Android

Una PWA installabile deve essere servita in **HTTPS** (fa eccezione `localhost`). La build in `dist/` è statica e usa percorsi relativi, quindi funziona anche in una sottocartella.

Esempi di hosting gratuito: GitHub Pages, Netlify, Cloudflare Pages (carica il contenuto di `dist/`). Ricorda di aggiungere il dominio tra le origini autorizzate del Client ID Google.

### Installazione sul telefono

1. Apri l'indirizzo dell'app con **Chrome per Android**.
2. Menu **⋮ → Installa app** (o **Aggiungi a schermata Home**). Chrome può anche proporre un banner di installazione.
3. L'app compare tra le app con la sua icona, si apre a schermo intero e funziona **offline** dopo il primo caricamento.
4. Consigliato: al primo avvio consenti le notifiche solo se vuoi l'avviso di fine recupero con l'app in background.

Per provare dal PC sul telefono nella stessa rete: `npm run build`, poi `npx vite preview --host` e apri l'indirizzo IP mostrato. Nota: su un indirizzo IP senza HTTPS Chrome non considera l'app installabile e alcune API (wake lock, service worker) non sono disponibili; per un test completo usa un hosting HTTPS oppure il port forwarding USB di Chrome (`chrome://inspect` → Port forwarding `4173 → localhost:4173`).

**Aggiornamenti**: quando pubblichi una nuova versione, l'app mostra «Nuova versione disponibile» e si aggiorna solo quando tocchi *Aggiorna* (mai durante un allenamento in modo automatico). I dati non vengono toccati.

---

## Limitazioni note

- **Timer in background**: Android/Chrome può sospendere JavaScript con lo schermo spento o l'app in background. Il timer usa l'orario di fine (non un contatore), quindi al ritorno il tempo è sempre corretto e lo stato «recupero terminato» viene mostrato subito; il suono/vibrazione esatti allo scadere richiedono che l'app sia in primo piano. Per questo di default lo **schermo resta acceso** durante l'allenamento (Wake Lock API). La notifica opzionale funziona solo se il browser mantiene attiva la pagina.
- **Suono**: il browser consente l'audio solo dopo un tocco; l'app lo sblocca al tocco «Fine serie».
- **Vibrazione**: non disponibile su iOS/Safari; il feedback visivo è sempre presente.
- **Google Drive**: il token OAuth dura circa un'ora e non viene salvato; dopo un riavvio dell'app bisogna toccare «Connetti» (se l'account è già autorizzato basta un tocco). Il backup automatico non può aprire la finestra di Google da solo. La sincronizzazione è *last-write-wins* per record: se lo stesso dato viene modificato su due telefoni prima di sincronizzare, vince la modifica più recente.
- **Sincronizzazione Drive**: verificata con test automatici su un Drive simulato che riproduce le API usate; va provata con un Client ID reale seguendo la guida sopra.
- **Installazione Android**: manifest, icone, service worker e funzionamento offline sono verificati con test automatici su Chrome desktop; l'installazione va confermata sul dispositivo reale (serve HTTPS).
- **Descrizioni esercizi**: la scheda originale non riportava testi descrittivi oltre a nome, gruppo, serie × ripetizioni, durata e recupero 60–90 s; le descrizioni tecniche inserite sono standard e modificabili.
- **Dimensione**: il bundle principale è ~185 KB gzip (React, Dexie, Recharts, Zod), interamente in cache dopo il primo avvio.

---

## Evoluzioni possibili

L'architettura (modello dati con id UUID e tombstone, logica di dominio separata, schema versionato) consente di aggiungere senza riscritture:

- esercizio «equivalente a…» per unire volontariamente storici di esercizi diversi;
- superserie, drop set, circuiti, serie di riscaldamento (campo tipo serie su `SetRecord`);
- peso corporeo, misure e circonferenze, foto progressi (nuove tabelle sincronizzabili);
- immagini/video degli esercizi (`Exercise.imageUrl` già previsto);
- notifiche programmate di promemoria, integrazione smartwatch;
- account utente e sincronizzazione multi-dispositivo in tempo reale con un backend;
- esportazione PDF e condivisione dei progressi;
- statistiche avanzate (volume per gruppo muscolare per settimana, stima della fatica, periodizzazione).
