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
  tests/         test dei permessi su PostgreSQL locale: sh supabase/tests/run.sh
```
I permessi sono imposti dal database (Row Level Security), non dall'interfaccia.
