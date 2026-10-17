/**
 * Trasferisce il vecchio Google Drive nel sito "Appunti per STC" — senza scaricare nulla sul tuo computer.
 * I file passano direttamente da Google agli archivi del sito (documenti su Backblaze, registrazioni su
 * Cloudflare). Sul Drive non viene modificato né cancellato niente.
 *
 * Come si usa (vedi README, "Importazione dal vecchio Drive"):
 *  1. script.google.com → Nuovo progetto → incolla tutto questo file
 *  2. scrivi qui sotto il link della cartella e il codice di servizio (sito → Amministrazione)
 *  3. controlla l'elenco ANNI (in che anno di corso va ogni corso)
 *  4. scegli la funzione "avvia" → Esegui → autorizza
 * Lo script lavora a blocchi di qualche minuto e riparte da solo finché non ha finito.
 * L'avanzamento è nel foglio "Importazione Drive" (colonna Stato) e nel sito, in Amministrazione.
 */
const CARTELLA = 'INCOLLA_QUI_IL_LINK_DELLA_CARTELLA';
const CODICE = 'INCOLLA_QUI_IL_CODICE_DI_SERVIZIO';

// Anno di corso di ogni corso (nome della cartella, maiuscole/minuscole non contano).
// I corsi non elencati finiscono in "Da assegnare": li sposti poi dal sito con il menu ⋯.
const ANNI = {
  triennale: {
    'Matematica I': 1, 'Matematica II': 1, 'Fisica I': 1, 'Chimica Generale e Laboratorio': 1, 'Chimica Organica I': 1,
    'Fisica II': 2, 'Chimica Analitica e Laboratorio': 2, 'Chimica Fisica I': 2, 'Chimica Fisica II e Laboratorio': 2,
    'Chimica Inorganica I e Laboratorio': 2, 'Chimica Organica II e Laboratorio': 2,
    'Chimica Analitica Strumentale e Laboratorio': 3, 'Chimica Fisica III e Laboratorio': 3, 'Chimica Inorganica II e Laboratorio': 3,
    'Chimica Organica III e Laboratorio': 3, 'Chimica Fisica Applicata': 3, 'Elementi di Polimeri': 3, 'Elementi di Biochimica': 3,
    'Controllo Ambientale e Sicurezza': 3,
  },
  magistrale: {
    'Bioinorganica': 1, 'Biotecnologie': 1, 'Chemiometria': 1, 'Chimica delle Formulazioni Organiche e Polimeriche': 1,
    'Chimica di Coordinazione e Metallorganica': 1, 'Chimica Fisica dello Stato Solido': 1, 'Chimica Fisica Superiore': 1,
    'Chimica Macromolecolare': 1, 'Chimica Fisica dei Sistemi Complessi': 1, 'Chimica Organica Superiore': 1,
    "Chimica Organica per l'Energetica Sostenibile": 1, 'Fondamenti Chimici della Sostenibilità': 1, 'Fotochimica': 1,
    'Metodi Analitici per la Chimica delle Formulazioni': 1, 'Modellistica Molecolare': 1,
    'Processi a basso impatto ambientale': 1, 'Teorie e Metodi per le Spettroscopie': 1, 'Termodinamica di non equilibrio': 1,
  },
};

// ---- Da qui in giù non serve modificare nulla ------------------------------------------------------
const FUNZIONE = 'https://bbyaljjyjfhufesjxycf.supabase.co/functions/v1/B2';
const CHIAVE_PUBBLICA = 'sb_publishable_i2fK_GSxrDxBBXTLZrnccQ_5Ct0ml8F'; // la stessa di docs/config.js (pubblica)
const MAX_MS = 4.5 * 60 * 1000;     // Google ferma gli script dopo 6 minuti
const ATTESA_PIENO_MIN = 15;        // archivio pieno: riprova dopo che il robot ha compresso
const COL = { path: 1, name: 2, mime: 3, mb: 4, date: 5, id: 6, stato: 7, ordine: 8 };

// Estensione dal tipo di file, per i file senza estensione nel nome
const EXT = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/ogg': 'ogg', 'audio/flac': 'flac', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'text/plain': 'txt', 'application/zip': 'zip', 'application/x-zip-compressed': 'zip', 'chemical/x-cif': 'cif',
  'application/msword': 'doc', 'application/vnd.ms-powerpoint': 'ppt', 'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};
const NOTI = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac',
  'mp4', 'webm', 'mov', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'odp', 'ods', 'txt', 'md', 'zip', 'cif', 'mryx'];
// Documenti Google: convertiti in un formato apribile da tutti
const EXPORT = {
  'application/vnd.google-apps.document': ['application/pdf', 'pdf'],
  'application/vnd.google-apps.presentation': ['application/pdf', 'pdf'],
  'application/vnd.google-apps.spreadsheet': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
};

function avvia() {
  if (CODICE.indexOf('INCOLLA') === 0) throw new Error('Scrivi in CODICE il codice di servizio (sito → Amministrazione).');
  const props = PropertiesService.getScriptProperties();
  props.deleteAllProperties();
  fermaRipartenze_();
  const id = idDaLink_(CARTELLA);
  const root = DriveApp.getFolderById(id);
  const ss = SpreadsheetApp.create('Importazione Drive - ' + root.getName());
  const sh = ss.getSheets()[0];
  sh.setName('Importazione');
  sh.appendRow(['Percorso', 'Nome', 'Tipo', 'Dimensione (MB)', 'Caricato il', 'ID', 'Stato', 'Ordine']);
  sh.setFrozenRows(1);
  props.setProperties({ fase: 'elenco', foglio: ss.getId(), coda: JSON.stringify([{ id: id, path: root.getName() }]) });
  Logger.log('Foglio creato: ' + ss.getUrl());
  continua();
}

// Riprova i file finiti in errore (es. connessione interrotta)
function riprova_errori() {
  const props = PropertiesService.getScriptProperties();
  const sh = SpreadsheetApp.openById(props.getProperty('foglio')).getSheetByName('Importazione');
  const stati = sh.getRange(2, COL.stato, Math.max(1, sh.getLastRow() - 1), 1).getValues();
  stati.forEach(function (r, i) { if (String(r[0]).indexOf('errore') === 0) sh.getRange(i + 2, COL.stato).setValue(''); });
  props.setProperties({ fase: 'importa', riga: '2' });
  props.deleteProperty('corrente');
  continua();
}

function continua() {
  const props = PropertiesService.getScriptProperties();
  const start = Date.now();
  const ss = SpreadsheetApp.openById(props.getProperty('foglio'));
  const sh = ss.getSheetByName('Importazione');
  fermaRipartenze_();
  if (props.getProperty('fase') === 'elenco') {
    if (!elenca_(props, sh, start)) return ripartiTra_(1);
    props.setProperties({ fase: 'importa', riga: '2' });
  }
  if (props.getProperty('fase') === 'importa') {
    const esito = importa_(props, sh, start);
    if (esito === 'tempo') return ripartiTra_(1);
    if (esito === 'pieno') {
      Logger.log('Archivio delle registrazioni pieno: aspetto che il robot comprima i file (riprovo tra ' + ATTESA_PIENO_MIN + ' minuti).');
      return ripartiTra_(ATTESA_PIENO_MIN);
    }
    props.setProperty('fase', 'finito');
    riepilogo_(sh);
    Logger.log('FINITO: ' + ss.getUrl());
  }
}

// ---- Fase 1: elenco dei file (come l'inventario) ----------------------------------------------------
function elenca_(props, sh, start) {
  const coda = JSON.parse(props.getProperty('coda') || '[]');
  let rows = [];
  const scrivi = function () {
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    rows = [];
  };
  while (coda.length) {
    const item = coda.shift();
    const folder = DriveApp.getFolderById(item.id);
    if (!item.subsDone) {
      const subs = folder.getFolders();
      while (subs.hasNext()) {
        const s = subs.next();
        if (s.getName() !== '__MACOSX') coda.push({ id: s.getId(), path: item.path + ' / ' + s.getName() });
      }
      item.subsDone = true;
    }
    const files = item.token ? DriveApp.continueFileIterator(item.token) : folder.getFiles();
    while (files.hasNext()) {
      if (Date.now() - start > MAX_MS) {
        item.token = files.getContinuationToken();
        coda.unshift(item);
        scrivi();
        props.setProperty('coda', JSON.stringify(coda));
        return false;
      }
      const f = files.next();
      const mime = f.getMimeType();
      const mb = Math.round(f.getSize() / 1048576 * 100) / 100;
      const rec = /^(audio|video)\//.test(mime) || (/zip/.test(mime) && mb > 100);
      rows.push([item.path, f.getName(), mime, mb, f.getDateCreated(), f.getId(), '', rec ? 1 : 0]);
      if (rows.length >= 200) scrivi();
    }
    scrivi();
    props.setProperty('coda', JSON.stringify(coda));
  }
  const n = sh.getLastRow() - 1;
  if (n > 0) {
    // prima i documenti (veloci), poi le registrazioni; segna subito i file da saltare
    sh.getRange(2, 1, n, COL.ordine).sort([{ column: COL.ordine, ascending: true }, { column: COL.path, ascending: true }]);
    const data = sh.getRange(2, 1, n, COL.ordine).getValues();
    const stati = data.map(function (r) { return [daSaltare_(r, data)]; });
    sh.getRange(2, COL.stato, n, 1).setValues(stati);
  }
  Logger.log('Elenco completato: ' + n + ' file. Inizio il trasferimento.');
  return true;
}

function daSaltare_(r, data) {
  const path = String(r[COL.path - 1]), name = String(r[COL.name - 1]), mime = String(r[COL.mime - 1]);
  if (name.indexOf('._') === 0 || name === '.DS_Store') return 'saltato: file di sistema del Mac';
  if (path.split(' / ').length < 3) return 'saltato: fuori dalle cartelle dei corsi';
  if (mime.indexOf('application/vnd.google-apps') === 0 && !EXPORT[mime]) return 'saltato: tipo Google non convertibile';
  const m = /^Copia di (.+)$/i.exec(name);
  if (m && data.some(function (o) {
    return o[COL.path - 1] === r[COL.path - 1] && o[COL.name - 1] === m[1] && o[COL.mb - 1] === r[COL.mb - 1];
  })) return 'saltato: doppione';
  if (!EXPORT[mime] && NOTI.indexOf(estensione_(name, mime)) < 0) return 'saltato: formato non ammesso';
  return '';
}

// ---- Fase 2: trasferimento --------------------------------------------------------------------------
function importa_(props, sh, start) {
  const last = sh.getLastRow();
  let riga = Number(props.getProperty('riga') || 2);
  for (; riga <= last; riga++) {
    if (Date.now() - start > MAX_MS) { props.setProperty('riga', String(riga)); return 'tempo'; }
    const r = sh.getRange(riga, 1, 1, COL.ordine).getValues()[0];
    if (r[COL.stato - 1]) continue;
    let stato;
    try {
      stato = importaFile_(props, r, start);
    } catch (err) {
      annullaCorrente_(props);
      stato = 'errore: ' + String(err && err.message || err).slice(0, 200);
    }
    if (stato === 'tempo' || stato === 'pieno') { props.setProperty('riga', String(riga)); return stato; }
    sh.getRange(riga, COL.stato).setValue(stato);
    props.setProperty('riga', String(riga + 1));
  }
  return 'fatto';
}

function importaFile_(props, r, start) {
  const id = String(r[COL.id - 1]);
  const mime = String(r[COL.mime - 1]);
  const parts = String(r[COL.path - 1]).split(' / ');
  const corso = nomeCorso_(parts[2]);
  const laurea = /magistrale/i.test(parts[1]) ? 'magistrale' : /triennale/i.test(parts[1]) ? 'triennale' : null;
  const anno = laurea ? annoDi_(laurea, corso) : null;
  const created = new Date(r[COL.date - 1]);
  const exp = EXPORT[mime];
  const name = nomeFile_(String(r[COL.name - 1]), mime);
  const meta = {
    token: CODICE, driveId: id, name: name, title: name.replace(/\.[^.]+$/, ''),
    description: 'Dal vecchio Drive dei rappresentanti' + (parts.length > 3 ? ' · Cartella: ' + parts.slice(3).join(' / ') : ''),
    created: created.toISOString(), owner: proprietario_(id), course: corso,
    degree: anno ? laurea : null, studyYear: anno, aa: annoAccademico_(created),
  };

  // trasferimento a parti già iniziato in un blocco precedente?
  let cur = JSON.parse(props.getProperty('corrente') || 'null');
  if (cur && cur.id !== id) cur = null;

  let bytes = null;
  if (!cur) {
    let size = Math.round(Number(r[COL.mb - 1]) * 1048576);
    if (exp) {
      bytes = scarica_('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=' + encodeURIComponent(exp[0]));
      size = bytes.length;
    } else {
      size = DriveApp.getFileById(id).getSize();
    }
    const b = chiama_(Object.assign({ action: 'import-begin', size: size }, meta));
    if (b.status === 'exists') return 'già importato';
    if (b.status === 'unsupported') return 'saltato: formato non ammesso';
    if (b.status === 'too_big') return 'saltato: troppo grande';
    if (b.status === 'full') return 'pieno';
    if (b.url) {
      if (!bytes) bytes = scarica_('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media&supportsAllDrives=true');
      carica_(b.url, bytes);
      const done = chiama_(Object.assign({ action: 'import-finish', store: b.store, key: b.key }, meta));
      return 'importato (' + (done.store === 'r2' ? 'Cloudflare' : 'Backblaze') + ')';
    }
    cur = { id: id, store: b.store, key: b.key, uploadId: b.uploadId, partSize: b.partSize, size: size, parts: [] };
    props.setProperty('corrente', JSON.stringify(cur));
  }

  // file grande: a parti da 32 MB, si può interrompere e riprendere
  const total = Math.ceil(cur.size / cur.partSize);
  for (let n = cur.parts.length + 1; n <= total; n++) {
    if (Date.now() - start > MAX_MS) return 'tempo';
    const from = (n - 1) * cur.partSize;
    const to = Math.min(cur.size, from + cur.partSize) - 1;
    const chunk = scarica_('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media&supportsAllDrives=true', from, to);
    const p = chiama_({ action: 'import-part', token: CODICE, store: cur.store, key: cur.key, uploadId: cur.uploadId, part: n });
    const etag = carica_(p.url, chunk);
    cur.parts.push({ n: n, etag: etag });
    props.setProperty('corrente', JSON.stringify(cur));
  }
  const done = chiama_(Object.assign({ action: 'import-finish', store: cur.store, key: cur.key, uploadId: cur.uploadId, parts: cur.parts }, meta));
  props.deleteProperty('corrente');
  return 'importato (' + (done.store === 'r2' ? 'Cloudflare' : 'Backblaze') + ', ' + total + ' parti)';
}

// ---- Strumenti ---------------------------------------------------------------------------------------
// Ripete una richiesta fino a 3 volte se la connessione cade o il server risponde con un errore temporaneo
function fetchRiprova_(url, opts) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = UrlFetchApp.fetch(url, opts);
      if (res.getResponseCode() < 500) return res;
      last = res;
    } catch (e) {
      if (i === 2) throw e;
    }
    Utilities.sleep(2000 * (i + 1));
  }
  return last;
}

// Trasferimento a parti interrotto da un errore: libera lo spazio occupato dalle parti già caricate
function annullaCorrente_(props) {
  const cur = JSON.parse(props.getProperty('corrente') || 'null');
  props.deleteProperty('corrente');
  if (!cur) return;
  try { chiama_({ action: 'import-abort', token: CODICE, store: cur.store, key: cur.key, uploadId: cur.uploadId }); } catch (e) { /* pazienza */ }
}

function chiama_(body) {
  const res = fetchRiprova_(FUNZIONE, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true,
    headers: { apikey: CHIAVE_PUBBLICA },
  });
  let data = {};
  try { data = JSON.parse(res.getContentText() || '{}'); } catch (e) { /* risposta non JSON */ }
  if (res.getResponseCode() !== 200) throw new Error(data.error || ('risposta ' + res.getResponseCode() + ' dal sito'));
  return data;
}

function scarica_(url, from, to) {
  const headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  if (from !== undefined) headers.Range = 'bytes=' + from + '-' + to;
  const res = fetchRiprova_(url, { headers: headers, muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code !== 200 && code !== 206) throw new Error('lettura da Drive non riuscita (' + code + ')');
  return res.getContent();
}

function carica_(url, bytes) {
  const res = fetchRiprova_(url, { method: 'put', payload: bytes, contentType: 'application/octet-stream', muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('caricamento non riuscito (' + res.getResponseCode() + ')');
  const h = res.getAllHeaders();
  return h.ETag || h.etag || h.Etag || '';
}

function proprietario_(id) {
  try { const o = DriveApp.getFileById(id).getOwner(); return o ? o.getEmail() : ''; } catch (e) { return ''; }
}

function estensione_(name, mime) {
  const m = /\.([A-Za-z0-9]{2,5})$/.exec(name);
  const ext = m ? m[1].toLowerCase() : '';
  if (NOTI.indexOf(ext) >= 0) return ext;
  if (EXPORT[mime]) return EXPORT[mime][1];
  return EXT[mime] || ext;
}

// Nome con l'estensione giusta (i file senza estensione la ricevono dal tipo)
function nomeFile_(name, mime) {
  const ext = estensione_(name, mime);
  const clean = name.replace(/[\/\\]/g, '-').trim();
  return new RegExp('\\.' + ext + '$', 'i').test(clean) ? clean : clean.replace(/\.+$/, '') + '.' + ext;
}

// "CHIMICA FISICA SUPERIORE" → "Chimica Fisica Superiore"; gli altri nomi restano come sono
function nomeCorso_(n) {
  n = String(n || 'Senza corso').trim();
  if (n !== n.toUpperCase()) return n;
  const small = ['di', 'e', 'per', 'della', 'delle', 'dello', 'dei', 'degli', 'del', 'a', 'in', 'la', 'le', 'il'];
  return n.toLowerCase().split(/\s+/).map(function (w, i) {
    return i > 0 && small.indexOf(w) >= 0 ? w : w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function annoDi_(laurea, corso) {
  const norm = function (s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); };
  const elenco = ANNI[laurea] || {};
  const k = Object.keys(elenco).filter(function (x) { return norm(x) === norm(corso); })[0];
  return k ? elenco[k] : null;
}

// Dal 1° settembre si passa all'anno accademico successivo
function annoAccademico_(d) {
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return y + '/' + (y + 1);
}

function riepilogo_(sh) {
  const n = sh.getLastRow() - 1;
  const conta = {};
  if (n > 0) sh.getRange(2, COL.stato, n, 1).getValues().forEach(function (r) {
    const k = String(r[0]).replace(/ \(.*$/, '').replace(/:.*$/, '');
    conta[k] = (conta[k] || 0) + 1;
  });
  Logger.log('Riepilogo: ' + JSON.stringify(conta));
}

function idDaLink_(link) {
  const m = String(link).match(/folders\/([A-Za-z0-9_-]+)/) || String(link).match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(link)) return link;
  throw new Error('Scrivi in CARTELLA il link della cartella (https://drive.google.com/drive/folders/...)');
}

function ripartiTra_(min) {
  fermaRipartenze_();
  ScriptApp.newTrigger('continua').timeBased().after(min * 60 * 1000).create();
}

function fermaRipartenze_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'continua') ScriptApp.deleteTrigger(t);
  });
}
