# Contesto del progetto — "Appunti per STC"

Sito per gli studenti di **Scienze e Tecnologie Chimiche (UniMiB)** per condividere appunti, PDF,
immagini, audio e video. Fatto da Aleksey Symonenko (rappresentante, utente non tecnico).

## Come lavorare con l'utente
- Scrive in **italiano**, usa **iPad o Mac**, non è uno sviluppatore: spiegazioni semplici e
  **passo passo**, con link diretti ai file su GitHub da copiare (icona "due quadratini").
- Se chiede "non fare nulla senza conferma" → rispondi soltanto.
- Vuole costo **0 €**. Repository **pubblico**: mai mettere nel codice contatti personali
  (telefoni, link WhatsApp) o chiavi segrete; quei dati vanno nel database.

## Architettura (tutto gratuito)
- **Sito statico** in `docs/` pubblicato da **GitHub Pages** (ramo `claude/elearning-university-auth-dep8hk`,
  cartella `/docs`): https://alekseysymonenko.github.io/Sito-UNI-STC/
- **Supabase** (progetto `bbyaljjyjfhufesjxycf`): login Google, database Postgres con Row Level
  Security, archivio file Supabase (1 GB, file vecchi) e Edge Function **`B2`** (nome MAIUSCOLO,
  "Verify JWT" disattivato).
- **Backblaze B2**: bucket `appunti-stc-bicocca-2026`, endpoint `s3.eu-central-003.backblazeb2.com`,
  tetti di spesa a $0, ciclo di vita "keep only last version". Chiavi nei Secrets della funzione
  (`B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET`, `B2_ENDPOINT`). Limite 9,5 GB con pulizia automatica.
- **Google OAuth** (Google Cloud, app "e-Learning Bicocca", in produzione) collegato a Supabase.
- Accesso consentito solo a `@campus.unimib.it` (controllato dal database, `is_campus()`).

## File principali
- `docs/config.js` impostazioni (URL/chiave pubblica Supabase, `storage: 'b2'`, `b2FunctionName: 'B2'`).
- `docs/js/api.js` accesso ai dati (SupabaseApi + DemoApi per l'anteprima).
- `docs/js/app.js` tutte le pagine (router su `#/...`), `docs/js/leagues.js` leghe e stemmi SVG.
- `docs/index.html` (icone SVG, CSP), `docs/css/style.css`, `docs/privacy.html`.
- `supabase/setup.sql` schema + permessi, **rieseguibile** (idempotente).
- `supabase/professori.sql` 62 docenti (inseriti solo se tabella vuota).
- `supabase/functions/b2/index.ts` firma link S3 (SigV4), quota, pulizia, CORS automatico.

## Funzionalità presenti
Corsi per laurea (triennale 1–3, magistrale 1–2) e **anno accademico** (menu, normalizzato), menu ⋯
sulle schede per modificare/spostare (solo admin); upload su B2 fino a 500 MB; anteprime
PDF/immagini/audio/video; ricerca; classifica a leghe (punti: +10 file max 10/giorno, +1 apertura
altrui, −10 se un admin elimina); segnalazioni, sospensione utenti; file protetti 📌; pulizia
automatica (meno aperti nell'ultimo anno, mai file < 14 giorni); pagine Rappresentanti e
Professori (dati nel DB, modificabili dagli admin); firma "Fatto con ♥ da Aleksey Symonenko".
Studenti: vedono tutto, caricano, creano corsi, segnalano. Admin: modificano/eliminano tutto,
gestiscono ruoli, sospensioni, contenuti delle pagine. Il primo utente è diventato admin.

## Regole tecniche
- **Versione**: a ogni modifica di CSS/JS aggiorna lo stesso valore in `docs/index.html`
  (`data-v` e tutti i `?v=`) e `VERSION` in `docs/js/app.js` (il sito si ricarica da solo se vecchio).
- **CSP**: niente stili o script inline (usare classi CSS; larghezze via `data-width`).
- Modifiche al DB → aggiornare `setup.sql` (idempotente) e dire all'utente di rieseguirlo; se il
  nuovo sito dipende da nuove colonne, valutare l'ordine (sito compatibile con DB vecchio).
- Modifiche a `functions/b2/index.ts` → l'utente deve ripubblicare la funzione `B2` su Supabase.
- Dall'ambiente cloud non si raggiungono Supabase, Backblaze né github.io: verificare con mock.

## Test
- Permessi SQL (PostgreSQL locale): `sh supabase/tests/run.sh` (come utente postgres).
- Funzione B2: `node --experimental-strip-types --test supabase/functions/b2/test/*.test.ts`
  e `npx -y deno@2.1.4 check supabase/functions/b2/index.ts`.
- Interfaccia: servire `docs/` e usare Playwright (`/opt/node-tools/node_modules/playwright`),
  con `supabaseUrl: ''` per la modalità anteprima.

## In sospeso
- **Importazione dal vecchio Google Drive** (proposta, non ancora iniziata): script Apps Script
  per l'elenco file+autori, ZIP del Drive, pagina admin "Importa da Drive" che crea corsi e
  cartelle e attribuisce i file (e i punti) agli autori anche al loro primo accesso.
  In attesa dall'utente: dimensione del Drive, screenshot delle cartelle, via libera.
- Possibili: cambio URL (organizzazione GitHub `appunti-stc`), nuovi formati (.key, .pages, .rtf, .csv).
