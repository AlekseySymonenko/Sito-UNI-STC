// Esegue drive-import/importa.gs con i servizi Google simulati e la VERA funzione B2 (nel worker).
// Uso: node drive-import/test/importa.test.cjs
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');
const GS = path.join(__dirname, '..', 'importa.gs');
const FN = path.join(__dirname, '..', '..', 'supabase', 'functions', 'b2', 'index.ts');
const { Worker } = require('worker_threads');
const assert = require('assert');
const TOKEN = 'c'.repeat(64);
const worker = new Worker(__dirname + '/worker.mjs', { workerData: { fn: FN, token: TOKEN, r2Quota: 150 * 1048576 }, execArgv: ['--experimental-strip-types', '--no-warnings'] });
const sab = new SharedArrayBuffer(160 * 1024 * 1024);
function call(req) {
  const view = new Int32Array(sab, 0, 2); Atomics.store(view, 0, 0);
  worker.postMessage({ sab, req });
  Atomics.wait(view, 0, 0, 120000);
  const r = JSON.parse(Buffer.from(new Uint8Array(sab, 8, view[1])).toString());
  if (r.status === 599) throw new Error('worker: ' + Buffer.from(r.body, 'base64'));
  return r;
}
let clock = 0; const RealDate = Date;
let kills = 0; class KillSignal { }
class FakeDate extends RealDate { static now() { return clock; } }

// --- Drive simulato ---------------------------------------------------------------
const rnd = (n) => crypto.randomBytes(n);
let n = 0; const files = {};
const mkf = (name, mime, buf, date) => { const id = 'id' + (++n) + 'xxxxxxxxxxxxxxxxxxxx'; files[id] = { id, name, mime, buf, date: date || new RealDate(2024, 10, 5), owner: 'autore' + (n % 3) + '@campus.unimib.it' }; return files[id]; };
const mkd = (name, kids = [], fl = []) => ({ id: 'D' + (++n) + 'yyyyyyyyyyyyyyyyyyyy', name, kids, files: fl });
const big1 = rnd(70 * 1048576), big2 = rnd(110 * 1048576);
const tree = mkd('Scienze e Tecnologie Chimiche', [
  mkd('Triennale', [mkd('Chimica Generale e Laboratorio', [mkd('Appunti Chimica Generale', [], [mkf('cap1.pdf', 'application/pdf', rnd(1000))])],
    [mkf('a.pdf', 'application/pdf', rnd(5000), new RealDate(2025, 8, 2)), mkf('Copia di a.pdf', 'application/pdf', null), mkf('._a.pdf', 'application/octet-stream', rnd(10)),
     mkf('pagina.html', 'text/html', rnd(10)), mkf('Domande', 'application/vnd.google-apps.document', Buffer.alloc(0))])]),
  mkd('Magistrale', [mkd('CHEMIOMETRIA', [mkd('Audiolezioni', [], [mkf('Lez 13 - 9', 'audio/mp4', big1, new RealDate(2025, 1, 10))]), mkd('__MACOSX', [], [mkf('x', 'text/plain', rnd(5))])],
    [mkf('Videolezioni Chemiometria.zip', 'application/zip', big2)])]),
], [mkf('Presentazione Matricole.pdf', 'application/pdf', rnd(100))]);
// "Copia di" identico (stessa dimensione)
const copia = Object.values(files).find((f) => f.name === 'Copia di a.pdf'); copia.buf = Object.values(files).find((f) => f.name === 'a.pdf').buf;
const byId = {}; (function walk(f) { byId[f.id] = f; f.kids.forEach(walk); })(tree);
call({ cmd: 'drive', files: Object.fromEntries(Object.values(files).map((f) => [f.id, f.buf.toString('base64')])) });

const iter = (arr, wrap, start = 0, fid) => { let i = start; return { hasNext: () => i < arr.length, next: () => { clock += 300; return wrap(arr[i++]); }, getContinuationToken: () => fid + ':' + i }; };
const fileObj = (f) => ({ getMimeType: () => f.mime, getOwner: () => ({ getEmail: () => f.owner }), getDateCreated: () => f.date, getName: () => f.name,
  getSize: () => (f.mime.startsWith('application/vnd.google-apps') ? 0 : f.buf.length), getId: () => f.id });
const folderObj = (f) => ({ getName: () => f.name, getId: () => f.id, getFolders: () => iter(f.kids, folderObj), getFiles: () => iter(f.files, fileObj, 0, f.id) });
// --- Fogli, proprietà, attivatori -------------------------------------------------
const sheets = {}; let triggers = []; let props = {}; const logs = [];
const sheet = (name) => { const s = { name, rows: [] }; Object.assign(s, {
  appendRow: (r) => s.rows.push(r.slice()), setFrozenRows() {}, setName: (x) => { delete sheets[s.name]; s.name = x; sheets[x] = s; }, getLastRow: () => s.rows.length,
  getRange: (r, c, nr = 1, nc = 1) => ({
    setValues: (v) => { v.forEach((row, i) => { s.rows[r - 1 + i] = s.rows[r - 1 + i] || []; row.forEach((x, j) => { s.rows[r - 1 + i][c - 1 + j] = x; }); }); },
    setValue: (x) => { s.rows[r - 1][c - 1] = x; },
    getValues: () => s.rows.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)),
    sort: (specs) => { const part = s.rows.slice(r - 1, r - 1 + nr); part.sort((a, b) => { for (const sp of specs) { const x = a[sp.column - 1], y = b[sp.column - 1]; if (x < y) return sp.ascending ? -1 : 1; if (x > y) return sp.ascending ? 1 : -1; } return 0; }); s.rows.splice(r - 1, nr, ...part); },
  }) }); sheets[name] = s; return s; };
const ss = { getSheets: () => [sheets.Sheet1], getId: () => 'SS', getUrl: () => 'url', getSheetByName: (x) => sheets[x] };
sheet('Sheet1');
const ctx = { Date: FakeDate, Math, JSON, String, Number, Object, Error, RegExp, console,
  Logger: { log: (m) => { logs.push(m); } },
  Utilities: { sleep() {} },
  PropertiesService: { getScriptProperties: () => ({ deleteAllProperties: () => { props = {}; }, setProperties: (o) => Object.assign(props, o), setProperty: (k, v) => { props[k] = String(v); }, getProperty: (k) => (k in props ? props[k] : null), deleteProperty: (k) => { delete props[k]; } }) },
  DriveApp: { getFolderById: (id) => folderObj(byId[id]), getFileById: (id) => fileObj(files[id]), continueFileIterator: (tok) => { const [fid, i] = tok.split(':'); return iter(byId[fid].files, fileObj, +i, fid); } },
  SpreadsheetApp: { create: () => ss, openById: () => ss, flush: () => {
    // simula Google che interrompe lo script mentre lavora su cap1.pdf (le prime 2 volte)
    const r = (sheets.Importazione || { rows: [] }).rows.find((x) => x[1] === 'cap1.pdf');
    if (r && /^in corso \(tentativo [12]\)$/.test(r[6])) { kills++; throw new KillSignal(); }
  } },
  LockService: { getScriptLock: () => ({ tryLock: () => true }) },
  ScriptApp: { getOAuthToken: () => 'tok123', getProjectTriggers: () => triggers, deleteTrigger: (t) => { triggers = triggers.filter((x) => x !== t); },
    newTrigger: (h) => ({ timeBased: () => ({ after: (ms) => ({ create: () => triggers.push({ getHandlerFunction: () => h, ms }) }) }) }) },
  UrlFetchApp: { fetch: (url, o = {}) => {
    clock += 25000; // ogni richiesta "costa" 25 s: forza pause a metà file
    const headers = Object.assign({}, o.headers || {}); if (o.contentType) headers['Content-Type'] = o.contentType;
    if (o.payload && Array.isArray(o.payload)) throw new Error('memoria: lo script deve passare Blob, non array di byte');
    const body = o.payload === undefined ? '' : (o.payload._buf || Buffer.from(o.payload)).toString('base64');
    const r = call({ url, method: (o.method || 'get').toUpperCase(), headers, body });
    const buf = Buffer.from(r.body, 'base64');
    return { getResponseCode: () => r.status, getContentText: () => buf.toString(), getContent: () => { throw new Error('memoria: getContent non va usato sui file'); },
      getBlob: () => ({ _buf: buf, getBytes: () => [...buf].map((b) => (b > 127 ? b - 256 : b)) }), getAllHeaders: () => r.headers };
  } },
};
vm.createContext(ctx);
let src = fs.readFileSync(GS, 'utf8')
  .replace("'INCOLLA_QUI_IL_LINK_DELLA_CARTELLA'", `'https://drive.google.com/drive/u/1/folders/${tree.id}'`)
  .replace("'INCOLLA_QUI_IL_CODICE_DI_SERVIZIO'", `'${TOKEN}'`);
vm.runInContext(src, ctx);
const run = (fn) => { try { fn(); } catch (e) { if (!(e instanceof KillSignal)) throw e; } };
run(() => ctx.avvia());
let runs = 1, waits = 0;
while (triggers.length && runs < 200) {
  const t = triggers[0];
  if (t.ms >= 15 * 60 * 1000) { waits++; call({ cmd: 'robot' }); } // archivio pieno: il robot comprime nel frattempo
  clock = 0; runs++; run(() => ctx.continua());
}
const st = JSON.parse(Buffer.from(call({ cmd: 'state' }).body, 'base64'));
const stato = Object.fromEntries(sheets.Importazione.rows.slice(1).map((r) => [r[1], r[6]]));
console.log('esecuzioni', runs, 'attese per archivio pieno', waits);
console.log(stato);
console.log(logs.filter((l) => /FINITO|Riepilogo|pieno/.test(l)));
// --- verifiche -----------------------------------------------------------------------
const row = (name) => st.db.find((r) => r.name === name);
assert.ok(/^importato \(Backblaze\)/.test(stato['a.pdf']));
assert.strictEqual(stato['Copia di a.pdf'], 'saltato: doppione');
assert.strictEqual(stato['._a.pdf'], 'saltato: file di sistema del Mac');
assert.strictEqual(stato['pagina.html'], 'saltato: formato non ammesso');
assert.strictEqual(stato['Presentazione Matricole.pdf'], 'saltato: fuori dalle cartelle dei corsi');
assert.ok(!('x' in stato), '__MACOSX ignorata');
assert.match(stato['Lez 13 - 9'], /^importato \(Cloudflare, 3 parti\)/);
assert.match(stato['Videolezioni Chemiometria.zip'], /^importato \(Cloudflare, 4 parti\)/);
assert.ok(waits >= 1, 'pausa mentre il robot comprime');
assert.strictEqual(kills, 2, 'interrotto due volte da Google');
assert.ok(/^importato/.test(stato['cap1.pdf']), 'dopo le interruzioni riparte da solo e importa il file');
assert.strictEqual(triggers.length, 0, 'a lavoro finito nessuna ripartenza rimasta');
assert.deepStrictEqual([row('a.pdf').course, row('a.pdf').degree, row('a.pdf').study_year, row('a.pdf').aa, row('a.pdf').store], ['Chimica Generale e Laboratorio', 'triennale', 1, '2025/2026', 'b2']);
assert.strictEqual(row('cap1.pdf').description, 'Dal vecchio Drive dei rappresentanti · Cartella: Appunti Chimica Generale');
assert.strictEqual(row('Domande.pdf').kind, 'pdf', 'documento Google esportato in PDF');
const lez = row('Lez 13 - 9.m4a');
assert.deepStrictEqual([lez.course, lez.degree, lez.study_year, lez.aa, lez.store, lez.kind, lez.needs_processing], ['Chemiometria', 'magistrale', 1, '2024/2025', 'r2', 'audio', true]);
assert.ok(/^autore\d@campus\.unimib\.it$/.test(lez.owner));
const obj = (path) => st.objects.find(([k]) => k.endsWith('/' + path));
assert.deepStrictEqual(obj(lez.path).slice(1), [big1.length, big1.subarray(0, 4).toString('hex'), big1.subarray(-4).toString('hex')], 'file grande ricomposto identico');
const z = row('Videolezioni Chemiometria.zip');
assert.deepStrictEqual(obj(z.path).slice(1), [big2.length, big2.subarray(0, 4).toString('hex'), big2.subarray(-4).toString('hex')]);
assert.strictEqual(st.uploads, 0, 'nessun caricamento a parti lasciato a metà');
assert.strictEqual(st.db.length, 5);
// rieseguire da capo non crea doppioni
delete sheets.Importazione; sheet('Sheet1');
run(() => ctx.avvia()); while (triggers.length) { clock = 0; run(() => ctx.continua()); }
const st2 = JSON.parse(Buffer.from(call({ cmd: 'state' }).body, 'base64'));
assert.strictEqual(st2.db.length, 5, 'seconda esecuzione: nessun doppione');
assert.ok(sheets.Importazione.rows.slice(1).filter((r) => r[6] === 'già importato').length === 5);
console.log('TUTTE LE VERIFICHE SUPERATE');
worker.terminate();
