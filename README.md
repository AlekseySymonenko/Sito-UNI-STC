# Sito per studenti da studenti per condividere appunti

Piattaforma web in stile e-learning universitario per condividere i materiali dei corsi:
**PDF, immagini, audio, video e documenti** (slide, dispense, appunti).

- 🔐 **Accesso con le credenziali d'Ateneo** tramite Single Sign-On: la piattaforma
  **non riceve e non salva mai le password**. Serve solo a verificare che l'utente
  sia uno studente dell'Ateneo (dominio email istituzionale + IdP dell'Ateneo).
- ⬆️ **Tutti gli studenti** autenticati possono creare corsi e caricare file
  (drag & drop, più file insieme, barra di avanzamento).
- 🗑️ **Solo gli amministratori** possono eliminare file e corsi o modificarli.
- 🛡️ **Pannello di amministrazione** per assegnare/revocare il ruolo di amministratore,
  con registro delle attività (caricamenti, eliminazioni, cambi di ruolo, accessi rifiutati).
- 👀 Anteprima integrata: visualizzatore PDF, immagini, player audio e video.
- 🔎 Ricerca per titolo, descrizione, nome file o corso e filtri per tipo.
- 📱 Interfaccia responsive, colori e nome dell'Ateneo personalizzabili.

## Requisiti

- Node.js **22.13 o superiore** (usa il modulo integrato `node:sqlite`, nessuna dipendenza nativa)

## Avvio rapido (sviluppo)

```bash
npm install
npm run dev
```

Apri <http://localhost:3000>. In sviluppo è attiva la modalità `AUTH_MODE=dev`, che mostra un
login simulato (basta un'email). Per diventare subito amministratore:

```bash
ADMIN_EMAILS=tuo.nome@studenti.ateneo.it npm run dev
```

Test automatici: `npm test`.

## Messa in produzione

1. Copia `.env.example` in `.env` e compila i valori.
2. Registra l'applicazione presso l'Identity Provider dell'Ateneo (vedi sotto).
3. Avvia con `npm start` dietro un reverse proxy HTTPS (nginx/Apache) con `TRUST_PROXY=true`.

In produzione (`NODE_ENV=production`) l'avvio fallisce volutamente se manca
`SESSION_SECRET`, se `ALLOWED_EMAIL_DOMAINS` è vuoto o se si tenta di usare `AUTH_MODE=dev`.

I dati (database SQLite e file caricati) stanno in `DATA_DIR` (default `./data`): è l'unica
cartella da includere nei backup.

## Come funziona l'accesso con le credenziali d'Ateneo

L'utente clicca **«Accedi con le credenziali d'Ateneo»** e viene reindirizzato alla pagina di
login **ufficiale dell'Ateneo**. Dopo l'autenticazione l'IdP rimanda alla piattaforma
un'asserzione **firmata** contenente solo identificativo, nome ed email istituzionale.
La piattaforma:

1. verifica firma, `state`, `nonce` e PKCE (OpenID Connect, Authorization Code Flow);
2. controlla che l'email appartenga a uno dei domini in `ALLOWED_EMAIL_DOMAINS`;
3. (opzionale) controlla un attributo aggiuntivo, es. `eduPersonAffiliation = student`;
4. crea/aggiorna il profilo (nessuna password) e apre la sessione.

### Opzione A — OpenID Connect (consigliata)

Funziona con qualunque IdP OIDC. Esempi tipici negli atenei italiani:

| IdP | `OIDC_ISSUER` |
| --- | --- |
| Microsoft Entra ID (Office 365 d'Ateneo) | `https://login.microsoftonline.com/<TENANT_ID>/v2.0` |
| Google Workspace for Education | `https://accounts.google.com` |
| Keycloak / IdP d'Ateneo | `https://idp.ateneo.it/realms/<realm>` |

Registra un'applicazione con redirect URI `https://<tuo-dominio>/auth/callback`, poi imposta
`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` e `OIDC_REDIRECT_URI`.
Con Microsoft Entra usa sempre l'issuer **del tenant dell'Ateneo** (non `common`), così solo
gli account dell'Ateneo possono autenticarsi.

### Opzione B — SAML / Shibboleth (federazione IDEM)

Se l'Ateneo offre solo SAML, metti davanti all'app un Service Provider (es. Apache +
`mod_shib`) che protegga la rotta `/auth/sso` e passi gli attributi come header, poi imposta
`AUTH_MODE=header` (vedi `AUTH_HEADER_*` in `.env.example`).
⚠️ In questa modalità l'app **non deve essere raggiungibile direttamente**, solo tramite lo SP.

## Ruoli

| Azione | Studente | Amministratore |
| --- | :---: | :---: |
| Consultare e scaricare materiali | ✅ | ✅ |
| Caricare file | ✅ | ✅ |
| Creare corsi | ✅ | ✅ |
| Modificare corsi | — | ✅ |
| Eliminare file e corsi | — | ✅ |
| Assegnare / revocare il ruolo di amministratore | — | ✅ |

- I primi amministratori si definiscono con `ADMIN_EMAILS` (diventano admin al loro accesso).
- Dopo, dal menu **Amministrazione → Utenti e ruoli** si può rendere amministratore qualunque
  utente che abbia effettuato almeno un accesso, oppure revocare il ruolo.
- Non è possibile rimuovere l'ultimo amministratore.
- I permessi sono verificati **lato server** su ogni richiesta: nascondere i pulsanti non è
  l'unica protezione.

## Sicurezza

- Nessuna password memorizzata; sessioni su cookie `HttpOnly`, `SameSite=Lax`, `Secure` in produzione.
- Protezione CSRF su tutte le operazioni di modifica.
- Content Security Policy restrittiva (nessuno script inline).
- Upload: elenco di estensioni ammesse (niente HTML/SVG/eseguibili), nomi su disco casuali,
  tipo MIME deciso dal server, `X-Content-Type-Options: nosniff`, contenuti multimediali
  serviti in sandbox, limite di dimensione configurabile.
- I file sono accessibili solo agli utenti autenticati.

## Struttura

```
src/
  server.js        avvio Express, sicurezza, sessioni
  config.js        configurazione da variabili d'ambiente
  auth.js          SSO d'Ateneo (OIDC / SAML via header / dev)
  db.js            schema e query SQLite
  routes/          corsi e caricamenti, file, amministrazione
views/             template EJS
public/            CSS, JavaScript, immagini
test/              test automatici (node:test)
```
