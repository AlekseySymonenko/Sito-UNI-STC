# Sito per studenti da studenti per condividere appunti

Piattaforma in stile e-learning universitario per condividere i materiali dei corsi:
**PDF, immagini, audio, video e documenti** (slide, dispense, appunti).

- 🔐 Accesso **solo con l'account Google @campus.unimib.it**: il sito non vede né salva password.
- ⬆️ **Tutti gli studenti** possono creare corsi e caricare file.
- 🗑️ **Solo gli amministratori** possono eliminare file e corsi (o modificarli).
- 🛡️ Pagina **Amministrazione** per nominare altri amministratori, con registro delle attività.
- 💶 **Costo: 0 €.** Pagine su GitHub Pages, login/dati/file su Supabase (piano gratuito).

> **Gli studenti non devono usare GitHub.** Per loro è un normale sito: aprono il link,
> premono «Accedi con l'account @campus.unimib.it» e basta. GitHub e Supabase servono solo
> a chi gestisce il sito, e si configurano **una volta sola** (da iPad va benissimo).

---

## Configurazione (una volta sola, circa 30 minuti)

### Passo 1 · Pubblicare il sito su GitHub Pages
1. In questo repository: **Settings → Pages**.
2. In *Build and deployment*: Source **Deploy from a branch**, poi scegli il ramo
   `claude/elearning-university-auth-dep8hk` e la cartella **`/docs`** → **Save**.
3. Dopo 1–2 minuti il sito è online su `https://alekseysymonenko.github.io/Sito-UNI-STC/`.

Finché il passo 2 non è completato il sito funziona in **modalità anteprima** (dati di esempio).

### Passo 2 · Creare il progetto Supabase (gratis, senza carta di credito)
1. Vai su <https://supabase.com> → **Start your project** → accedi con GitHub.
2. **New project**: nome `elearning-bicocca`, scegli una password per il database
   (salvala, non servirà al sito), regione **Central EU (Frankfurt)** → **Create**.
3. Quando è pronto: menu a sinistra **SQL Editor** → **New query** → incolla tutto il contenuto
   del file [`supabase/setup.sql`](supabase/setup.sql) → **Run**. Deve comparire "Success".
4. Pulsante **Connect** in alto (oppure *Project Settings → API*): copia
   **Project URL** e **anon public key**. *(Non usare mai la chiave "service_role/secret".)*

### Passo 3 · Attivare il login con Google
1. Vai su <https://console.cloud.google.com> e crea un progetto (es. `elearning-bicocca`).
2. **API e servizi → Schermata consenso OAuth**: tipo **Esterno**, nome app, email di supporto,
   poi **Pubblica app**.
3. **Credenziali → Crea credenziali → ID client OAuth → Applicazione web**:
   - *Origini JavaScript autorizzate*: `https://alekseysymonenko.github.io`
   - *URI di reindirizzamento autorizzati*: `https://<il-tuo-progetto>.supabase.co/auth/v1/callback`
     (lo trovi già scritto su Supabase in *Authentication → Sign In / Providers → Google*)
4. Copia **ID client** e **Client secret**.
5. Su Supabase: **Authentication → Sign In / Providers → Google** → attiva, incolla ID e secret → **Save**.
6. Su Supabase: **Authentication → URL Configuration**:
   - *Site URL*: `https://alekseysymonenko.github.io/Sito-UNI-STC/`
   - *Redirect URLs*: aggiungi `https://alekseysymonenko.github.io/Sito-UNI-STC/`

### Passo 4 · Collegare il sito a Supabase
Apri il file [`docs/config.js`](docs/config.js), tocca la matita ✏️ e incolla
**Project URL** e **anon public key** tra le virgolette di `supabaseUrl` e `supabaseAnonKey`
→ **Commit changes**. Dopo un minuto il sito è collegato.

### Passo 5 · Diventare amministratore
**La prima persona che accede diventa automaticamente amministratore**: entra subito tu.
Poi dalla pagina **Amministrazione** puoi nominare altri amministratori.

---

## Archivio grande con Backblaze B2 (facoltativo, 10 GB gratis)

Al posto dell'archivio di Supabase (1 GB) i file possono andare su **Backblaze B2**:
10 GB gratuiti, file fino a 500 MB, nessun costo grazie al tetto di spesa a 0 $ e al
limite impostato nel sito (i caricamenti si bloccano a 9,5 GB).

1. **Account**: su <https://www.backblaze.com/sign-up/cloud-storage> registrati (meglio con l'email
   dei rappresentanti) scegliendo la regione **EU Central**.
2. **Tetto di spesa**: menu *Caps & Alerts* → imposta **tutti i limiti giornalieri a $0** → *Update*.
3. **Bucket**: *Buckets → Create a Bucket* → nome univoco (es. `appunti-stc-bicocca-2026`),
   *Files in Bucket*: **Private** → *Create*. Annota l'**Endpoint** (es. `s3.eu-central-003.backblazeb2.com`).
4. **Chiave**: *Application Keys → Add a New Application Key* → nome `sito`,
   *Allow access to Bucket(s)*: **All**, *Type of Access*: **Read and Write** → *Create*.
   Copia subito **keyID** e **applicationKey** (la seconda viene mostrata una sola volta).
5. **Database**: su Supabase riesegui tutto [`supabase/setup.sql`](supabase/setup.sql) nello SQL Editor.
6. **Funzione**: Supabase → *Edge Functions → Deploy a new function → Via Editor* → nome **`b2`** →
   incolla tutto [`supabase/functions/b2/index.ts`](supabase/functions/b2/index.ts) → *Deploy*.
   Nei dettagli della funzione disattiva **"Verify JWT"** (la funzione controlla da sola chi la chiama).
7. **Secrets**: *Edge Functions → Secrets* → aggiungi `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET` (nome del
   bucket), `B2_ENDPOINT` (l'endpoint del punto 3).
8. In [`docs/config.js`](docs/config.js) imposta `storage: 'b2'` e `maxUploadMb: 500`.

I file già caricati su Supabase restano visibili; i nuovi vanno su B2.
La chiave di B2 resta solo nei Secrets di Supabase: il sito non la vede mai.

### Pulizia automatica dello spazio
Se un nuovo file non ci sta nei 9,5 GB, il sistema elimina **solo quanto basta**, scegliendo:
1. i file aperti meno volte negli ultimi 6 mesi (ogni studente conta al massimo una volta al giorno);
2. a parità, quelli aperti (o caricati) meno di recente.

Non vengono mai eliminati i file caricati da meno di 14 giorni né quelli **protetti 📌**
(pulsante nella pagina del file, solo amministratori). Se non c'è abbastanza da eliminare,
il caricamento viene rifiutato. In *Amministrazione* si vedono i prossimi file eliminabili e nel
registro attività ogni eliminazione automatica.

I numeri si cambiano dallo SQL Editor di Supabase, per esempio:
`update app_settings set value = '30' where key = 'evict_grace_days';`
(chiavi: `b2_quota_bytes`, `evict_grace_days`, `evict_window_days`).

## Classifica e moderazione

**Classifica a leghe** (menu *Classifica*): Ferro, Bronzo, Argento, Oro, Platino, Smeraldo e
Diamante con 4 divisioni ciascuna; sopra i 1000 punti Maestro, Gran Maestro (posizioni 2–5) e
Sfidante (n° 1). Gli stemmi sono disegni originali.
- **+10** punti per file caricato (max 10 file al giorno)
- **+1** quando un altro studente apre un tuo file (max una volta al giorno per persona)
- **−10** se un amministratore elimina un tuo file (la pulizia automatica e l'eliminazione di un corso non tolgono punti)

**Moderazione**
- Ogni studente può **segnalare** un file inappropriato; le segnalazioni compaiono in *Amministrazione*
  con i pulsanti *Elimina file*, *Sospendi autore*, *Ignora*.
- Gli amministratori possono **sospendere** un utente indicando il motivo (ed eliminare tutti i suoi file).
  L'utente sospeso non vede più nulla e trova la pagina "Account sospeso"; si può riattivare in ogni momento.
  Gli amministratori non sono sospendibili finché non viene revocato il ruolo.

## Limiti del piano gratuito
- Spazio per i file: circa **1 GB** in totale; ogni file al massimo **50 MB**.
- Se nessuno usa il sito per **7 giorni**, Supabase mette in pausa il progetto: i dati restano,
  si riattiva con un clic dalla dashboard di Supabase.
- Lo spazio usato è visibile nella pagina **Amministrazione**.

## Domande frequenti
**Google dice "app bloccata" o "accesso negato"?** L'Ateneo potrebbe bloccare le app esterne
sugli account campus. Si può passare all'accesso con link via email istituzionale.

**Un utente con Gmail personale può entrare?** No: il database rifiuta qualunque account che non
sia `@campus.unimib.it`, anche se qualcuno modificasse il sito.

**Cambiare nome, testo a piè di pagina o limite dei file?** Sono tutti in `docs/config.js`.

---

## Per chi sviluppa
```
docs/            il sito (HTML, CSS, JavaScript) pubblicato da GitHub Pages
  config.js      impostazioni
  js/api.js      accesso a Supabase (+ modalità anteprima)
  js/app.js      pagine e interfaccia
supabase/
  setup.sql      tabelle, permessi (Row Level Security) e archivio file
  functions/b2/  funzione che firma i link di caricamento/scaricamento su Backblaze B2
  tests/         test dei permessi su PostgreSQL locale: sh supabase/tests/run.sh
Test della funzione B2: node --experimental-strip-types --test supabase/functions/b2/test/*.test.ts
```
I permessi sono imposti dal database (Row Level Security), non dall'interfaccia.

Dopo ogni modifica a CSS/JS aggiorna il numero di versione in tre punti: i `?v=` e `data-v`
in `docs/index.html` e `VERSION` in `docs/js/app.js`. Se un browser tiene in memoria una pagina
vecchia, il sito se ne accorge e si ricarica da solo.
