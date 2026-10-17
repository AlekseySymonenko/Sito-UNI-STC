/**
 * Inventario della cartella del vecchio Drive — SOLO LETTURA, non sposta né modifica nulla.
 *
 * Crea nel tuo Drive un Foglio Google "Inventario Drive - ..." con:
 *  - "File": percorso, nome, tipo, dimensione, data di caricamento, anno accademico, proprietario
 *  - "Riepilogo": numero di file, peso totale, peso per cartella e per anno accademico
 * Funziona anche se sulla cartella hai solo accesso in lettura.
 *
 * Come si usa: script.google.com → Nuovo progetto → incolla tutto → scrivi il link della
 * cartella qui sotto → in alto scegli la funzione "avvia" → Esegui → autorizza.
 * Se la cartella è grande lo script riparte da solo ogni minuto finché non ha finito.
 */
const CARTELLA = 'INCOLLA_QUI_IL_LINK_DELLA_CARTELLA';

const MAX_MS = 4.5 * 60 * 1000; // Google ferma gli script dopo 6 minuti

function avvia() {
  const props = PropertiesService.getScriptProperties();
  props.deleteAllProperties();
  fermaRipartenze_();
  const id = idDaLink_(CARTELLA);
  const root = DriveApp.getFolderById(id);
  const ss = SpreadsheetApp.create('Inventario Drive - ' + root.getName());
  const sh = ss.getSheets()[0];
  sh.setName('File');
  sh.appendRow(['Percorso', 'Nome', 'Tipo', 'Dimensione (MB)', 'Caricato il', 'Anno accademico', 'Proprietario', 'ID']);
  sh.setFrozenRows(1);
  props.setProperties({ foglio: ss.getId(), coda: JSON.stringify([{ id: id, path: root.getName() }]) });
  Logger.log('Foglio creato: ' + ss.getUrl());
  continua();
}

function continua() {
  const props = PropertiesService.getScriptProperties();
  const start = Date.now();
  const coda = JSON.parse(props.getProperty('coda') || '[]');
  const ss = SpreadsheetApp.openById(props.getProperty('foglio'));
  const sh = ss.getSheetByName('File');
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
        coda.push({ id: s.getId(), path: item.path + ' / ' + s.getName() });
      }
      item.subsDone = true;
    }
    const files = item.token ? DriveApp.continueFileIterator(item.token) : folder.getFiles();
    while (files.hasNext()) {
      if (Date.now() - start > MAX_MS) {
        // tempo quasi finito: salva il punto esatto e riparti tra un minuto
        item.token = files.getContinuationToken();
        coda.unshift(item);
        scrivi();
        props.setProperty('coda', JSON.stringify(coda));
        fermaRipartenze_();
        ScriptApp.newTrigger('continua').timeBased().after(60 * 1000).create();
        Logger.log('Pausa: riparto da solo tra un minuto (' + (sh.getLastRow() - 1) + ' file finora)');
        return;
      }
      rows.push(riga_(files.next(), item.path));
      if (rows.length >= 200) scrivi();
    }
    scrivi();
    props.setProperty('coda', JSON.stringify(coda));
  }
  fermaRipartenze_();
  riepilogo_(ss);
  Logger.log('FINITO: ' + ss.getUrl());
}

function riga_(f, path) {
  const mime = f.getMimeType();
  const google = mime.indexOf('application/vnd.google-apps') === 0;
  let owner = '';
  try { const o = f.getOwner(); owner = o ? o.getEmail() : ''; } catch (e) { /* non visibile */ }
  const d = f.getDateCreated();
  return [path, f.getName(), google ? 'Documento Google' : mime,
    google ? 0 : Math.round(f.getSize() / 1048576 * 100) / 100, d, annoAccademico_(d), owner, f.getId()];
}

// Dal 1° settembre si passa all'anno accademico successivo
function annoAccademico_(d) {
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return y + '/' + (y + 1);
}

function riepilogo_(ss) {
  const data = ss.getSheetByName('File').getDataRange().getValues().slice(1);
  const perCartella = {}, perAnno = {}, autori = {};
  let totale = 0, senzaAutore = 0, google = 0;
  data.forEach(function (r) {
    const mb = Number(r[3]) || 0;
    totale += mb;
    const top = String(r[0]).split(' / ')[1] || '(cartella principale)';
    perCartella[top] = (perCartella[top] || 0) + mb;
    perAnno[r[5]] = (perAnno[r[5]] || 0) + mb;
    if (r[6]) autori[r[6]] = true; else senzaAutore++;
    if (r[2] === 'Documento Google') google++;
  });
  let sh = ss.getSheetByName('Riepilogo');
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet('Riepilogo', 0);
  const gb = function (mb) { return Math.round(mb / 1024 * 100) / 100; };
  const out = [
    ['File in totale', data.length],
    ['Peso totale (GB)', gb(totale)],
    ['Autori diversi', Object.keys(autori).length],
    ['File senza autore visibile', senzaAutore],
    ['Documenti Google (peso non calcolabile)', google],
    ['', ''],
    ['Peso per cartella (GB)', ''],
  ];
  Object.keys(perCartella).sort().forEach(function (k) { out.push([k, gb(perCartella[k])]); });
  out.push(['', ''], ['Peso per anno accademico (GB)', '']);
  Object.keys(perAnno).sort().forEach(function (k) { out.push([k, gb(perAnno[k])]); });
  sh.getRange(1, 1, out.length, 2).setValues(out);
  sh.autoResizeColumn(1);
}

function idDaLink_(link) {
  const m = String(link).match(/folders\/([A-Za-z0-9_-]+)/) || String(link).match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(link)) return link;
  throw new Error('Scrivi in CARTELLA il link della cartella (https://drive.google.com/drive/folders/...)');
}

function fermaRipartenze_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'continua') ScriptApp.deleteTrigger(t);
  });
}
