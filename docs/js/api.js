/*
 * Accesso ai dati. Due implementazioni con la stessa interfaccia:
 *  - SupabaseApi: quella reale (login Google, database e archivio file su Supabase)
 *  - DemoApi:     anteprima senza configurazione, dati in memoria sul dispositivo
 * I permessi veri sono imposti dal database (supabase/setup.sql): l'interfaccia
 * nasconde i pulsanti, ma non è l'unica protezione.
 */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};

  // Formati ammessi: il tipo MIME è deciso dall'estensione, non dal browser.
  var TYPES = {
    pdf: ['application/pdf', 'pdf'],
    jpg: ['image/jpeg', 'image'], jpeg: ['image/jpeg', 'image'], png: ['image/png', 'image'],
    gif: ['image/gif', 'image'], webp: ['image/webp', 'image'], avif: ['image/avif', 'image'],
    mp3: ['audio/mpeg', 'audio'], m4a: ['audio/mp4', 'audio'], aac: ['audio/aac', 'audio'],
    wav: ['audio/wav', 'audio'], ogg: ['audio/ogg', 'audio'], oga: ['audio/ogg', 'audio'],
    opus: ['audio/opus', 'audio'], flac: ['audio/flac', 'audio'],
    mp4: ['video/mp4', 'video'], webm: ['video/webm', 'video'], mov: ['video/quicktime', 'video'],
    doc: ['application/msword', 'document'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
    ppt: ['application/vnd.ms-powerpoint', 'document'],
    pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'document'],
    xls: ['application/vnd.ms-excel', 'document'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'document'],
    odt: ['application/vnd.oasis.opendocument.text', 'document'],
    odp: ['application/vnd.oasis.opendocument.presentation', 'document'],
    ods: ['application/vnd.oasis.opendocument.spreadsheet', 'document'],
    txt: ['text/plain', 'document'], md: ['text/plain', 'document'],
    zip: ['application/zip', 'other'],
  };

  function typeFor(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || '');
    var ext = m ? m[1].toLowerCase() : '';
    var t = TYPES[ext];
    return t ? { ext: ext, mime: t[0], kind: t[1] } : null;
  }

  function emailAllowed(email) {
    return typeof email === 'string' && email.toLowerCase().endsWith('@' + CFG.allowedDomain);
  }

  function baseName(name) { return name.replace(/\.[^.]+$/, '').slice(0, 200) || name; }
  function clean(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
  function courseFields(d) {
    return {
      name: clean(d.name, 140), code: clean(d.code, 30) || null, teacher: clean(d.teacher, 120) || null,
      year: clean(d.year, 30) || null, description: clean(d.description, 2000) || null,
    };
  }
  // Per i filtri di ricerca di PostgREST: tolgo i caratteri con significato speciale.
  function safeQuery(q) { return clean(q, 100).replace(/[%*,()\\."':]/g, ' ').trim(); }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }

  function friendlyError(err) {
    var msg = (err && (err.message || err.error_description || err.error)) || String(err);
    if (/row-level security|permission denied|not authorized|Unauthorized/i.test(msg)) return 'Non hai i permessi per questa operazione.';
    if (/exceeded the maximum allowed size|Payload too large|413/i.test(msg)) return 'File troppo grande: il limite è ' + CFG.maxUploadMb + ' MB.';
    if (/mime type .* is not supported|invalid_mime_type/i.test(msg)) return 'Formato di file non ammesso.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Connessione assente o instabile. Riprova.';
    return msg;
  }

  // ===========================================================================
  //  Supabase (versione reale)
  // ===========================================================================
  function SupabaseApi() {
    var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    var BUCKET = 'materiali';
    var FILE_SELECT = '*, course:courses(id, name, color), uploader:profiles(name)';
    var USE_B2 = CFG.storage === 'b2';
    var me = null;
    var urlCache = {};

    // Chiamata alla funzione "b2" su Supabase (archivio Backblaze B2)
    async function b2(body) {
      var session = (await sb.auth.getSession()).data.session;
      if (!session) throw new Error('Sessione scaduta: accedi di nuovo.');
      var res;
      try {
        res = await fetch(CFG.supabaseUrl + '/functions/v1/b2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, apikey: CFG.supabaseAnonKey },
          body: JSON.stringify(body),
        });
      } catch (e) { throw new Error('Connessione assente o instabile. Riprova.'); }
      var data = await res.json().catch(function () { return {}; });
      if (res.status === 404) throw new Error('Archivio B2 non ancora installato (funzione "b2" mancante su Supabase).');
      if (!res.ok) throw new Error(data.error || 'Errore dell\'archivio (' + res.status + ').');
      return data;
    }

    // Caricamento diretto su B2 con barra di avanzamento
    function putWithProgress(url, file, contentType, onProgress) {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error('Caricamento non riuscito (errore ' + xhr.status + ').'));
        };
        xhr.onerror = function () { reject(new Error('Caricamento interrotto: controlla la connessione e riprova.')); };
        xhr.send(file);
      });
    }

    function check(res) {
      if (res.error) throw new Error(friendlyError(res.error));
      return res.data;
    }

    async function loadMe(session) {
      if (!session) { me = null; return null; }
      var email = session.user.email || '';
      if (!emailAllowed(email)) {
        await sb.auth.signOut();
        me = null;
        return { error: 'domain', email: email };
      }
      var res = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      if (res.error || !res.data) return { error: 'profile' };
      me = res.data;
      return { user: me };
    }

    return {
      demo: false,
      typeFor: typeFor,

      async init() {
        var res = await sb.auth.getSession();
        // Rimuove ?code=... dall'indirizzo dopo il ritorno da Google
        if (/[?&]code=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
        return loadMe(res.data.session);
      },

      async refreshMe() {
        var res = await sb.auth.getSession();
        return loadMe(res.data.session);
      },

      async signIn() {
        var res = await sb.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: location.origin + location.pathname,
            queryParams: { hd: CFG.allowedDomain, prompt: 'select_account' },
          },
        });
        check(res);
      },

      async signOut() { await sb.auth.signOut(); me = null; },

      async stats() { return check(await sb.rpc('stats')) || { courses: 0, files: 0, users: 0, bytes: 0 }; },

      async listCourses() {
        var rows = check(await sb.from('courses').select('*, files(count)').order('name'));
        return rows.map(function (c) {
          c.file_count = c.files && c.files[0] ? c.files[0].count : 0;
          delete c.files;
          return c;
        });
      },

      async getCourse(id) {
        return check(await sb.from('courses').select('*').eq('id', id).maybeSingle());
      },

      async createCourse(data) {
        return check(await sb.from('courses').insert(courseFields(data)).select('id').single()).id;
      },

      async updateCourse(id, data) {
        var rows = check(await sb.from('courses').update(courseFields(data)).eq('id', id).select('id'));
        if (!rows.length) throw new Error('Non hai i permessi per questa operazione.');
      },

      async deleteCourse(id) {
        var files = check(await sb.from('files').select('storage_path, storage').eq('course_id', id));
        if (files.some(function (f) { return f.storage === 'b2'; })) await b2({ action: 'delete-course-files', courseId: id });
        files = files.filter(function (f) { return f.storage !== 'b2'; });
        for (var i = 0; i < files.length; i += 100) {
          check(await sb.storage.from(BUCKET).remove(files.slice(i, i + 100).map(function (f) { return f.storage_path; })));
        }
        var rows = check(await sb.from('courses').delete().eq('id', id).select('id'));
        if (!rows.length) throw new Error('Non hai i permessi per questa operazione.');
      },

      async listFiles(opts) {
        opts = opts || {};
        var q = sb.from('files').select(FILE_SELECT).order('created_at', { ascending: false });
        if (opts.courseId) q = q.eq('course_id', opts.courseId);
        if (opts.kind) q = q.eq('kind', opts.kind);
        if (opts.mine && me) q = q.eq('uploaded_by', me.id);
        var s = opts.q ? safeQuery(opts.q) : '';
        if (s) q = q.or('title.ilike.*' + s + '*,description.ilike.*' + s + '*,original_name.ilike.*' + s + '*');
        q = q.limit(opts.limit || 300);
        return check(await q);
      },

      async getFile(id) {
        return check(await sb.from('files').select(FILE_SELECT).eq('id', id).maybeSingle());
      },

      async uploadFile(courseId, file, meta, onProgress) {
        var t = typeFor(file.name);
        if (!t) throw new Error('Formato non ammesso: ' + file.name);
        if (file.size > CFG.maxUploadMb * 1024 * 1024) throw new Error('«' + file.name + '» supera il limite di ' + CFG.maxUploadMb + ' MB.');
        if (USE_B2) {
          var up = await b2({ action: 'upload', name: file.name, size: file.size });
          await putWithProgress(up.url, file, up.contentType, onProgress);
          return (await b2({
            action: 'confirm', key: up.key, name: file.name, courseId: courseId,
            title: clean(meta.title, 200), description: clean(meta.description, 2000),
          })).id;
        }
        var path = me.id + '/' + uuid() + '.' + t.ext;
        check(await sb.storage.from(BUCKET).upload(path, file, { contentType: t.mime, upsert: false, cacheControl: '3600' }));
        return check(await sb.from('files').insert({
          course_id: courseId,
          title: clean(meta.title, 200) || baseName(file.name),
          description: clean(meta.description, 2000) || null,
          original_name: file.name.slice(0, 255),
          storage_path: path,
          mime: t.mime,
          kind: t.kind,
          size: file.size,
        }).select('id').single()).id;
      },

      async fileUrl(file, download) {
        if (file.storage === 'b2') {
          var ck = file.id + (download ? ':d' : ':v');
          var hit = urlCache[ck];
          if (hit && hit.until > Date.now()) return hit.url;
          var r = await b2({ action: 'url', id: file.id, download: Boolean(download) });
          urlCache[ck] = { url: r.url, until: Date.now() + (r.expires - 300) * 1000 };
          return r.url;
        }
        var res = await sb.storage.from(BUCKET).createSignedUrl(file.storage_path, 3600, download ? { download: file.original_name } : undefined);
        return check(res).signedUrl;
      },

      async deleteFile(file) {
        if (file.storage === 'b2') { await b2({ action: 'delete', id: file.id }); return; }
        check(await sb.storage.from(BUCKET).remove([file.storage_path]));
        var rows = check(await sb.from('files').delete().eq('id', file.id).select('id'));
        if (!rows.length) throw new Error('Non hai i permessi per questa operazione.');
      },

      async listUsers() {
        var users = check(await sb.from('profiles').select('*').order('name'));
        var files = check(await sb.from('files').select('uploaded_by').limit(10000));
        var counts = {};
        files.forEach(function (f) { counts[f.uploaded_by] = (counts[f.uploaded_by] || 0) + 1; });
        users.forEach(function (u) { u.uploads = counts[u.id] || 0; });
        return users;
      },

      async setRole(userId, role) { check(await sb.rpc('set_role', { target: userId, new_role: role })); },

      // Spazio usato rispetto al limite dell'archivio in uso
      async usage() {
        if (USE_B2) {
          var u = await b2({ action: 'usage' });
          return { used: u.used, quota: u.quota, where: 'Backblaze B2' };
        }
        var st = await this.stats();
        return { used: st.bytes - (st.b2_bytes || 0), quota: 1024 * 1024 * 1024, where: 'Supabase' };
      },

      async listAudit() {
        return check(await sb.from('audit_log').select('*, user:profiles(name)').order('id', { ascending: false }).limit(40));
      },
    };
  }

  // ===========================================================================
  //  Anteprima (nessuna configurazione): dati di esempio in memoria
  // ===========================================================================
  function DemoApi() {
    var now = Date.now();
    var iso = function (minsAgo) { return new Date(now - minsAgo * 60000).toISOString(); };
    var me = null;
    var seq = 100;
    var users = [
      { id: 'u-demo', email: 'tu@' + CFG.allowedDomain, name: 'Studente Anteprima', role: 'admin', created_at: iso(5000) },
      { id: 'u-2', email: 'g.bianchi@' + CFG.allowedDomain, name: 'Giulia Bianchi', role: 'student', created_at: iso(4000) },
      { id: 'u-3', email: 'l.ferrari@' + CFG.allowedDomain, name: 'Luca Ferrari', role: 'student', created_at: iso(3000) },
    ];
    var courses = [
      { id: 1, name: 'Chimica Generale e Inorganica', code: 'CHI-101', teacher: 'Rossi', year: '2026/2027', color: 0, description: 'Struttura atomica, legame chimico, stechiometria, equilibri in soluzione.' },
      { id: 2, name: 'Chimica Organica I', code: 'CHI-201', teacher: 'Colombo', year: '2026/2027', color: 2, description: 'Gruppi funzionali, stereochimica, meccanismi di reazione.' },
      { id: 3, name: 'Chimica Analitica', code: 'CHI-210', teacher: 'Ricci', year: '2026/2027', color: 1, description: 'Analisi quantitativa, titolazioni, metodi strumentali.' },
      { id: 4, name: 'Chimica Fisica I', code: 'CHI-220', teacher: 'Marino', year: '2026/2027', color: 3, description: 'Termodinamica chimica e cinetica.' },
      { id: 5, name: 'Matematica', code: 'MAT-101', teacher: 'Greco', year: '2026/2027', color: 4, description: '' },
    ];
    var files = [];
    var blobs = {};
    var audit = [];

    function pdfBlob(title) {
      var text = 'BT /F1 26 Tf 60 760 Td (' + title.replace(/[()\\]/g, '') + ') Tj ET';
      var src = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
        '4 0 obj<</Length ' + text.length + '>>stream\n' + text + '\nendstream endobj\n' +
        '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
      return new Blob([src], { type: 'application/pdf' });
    }
    function wavBlob() {
      var rate = 8000, n = rate * 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
      var w = function (o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true);
      v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
      v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
      for (var i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i * 2 * Math.PI * 440 / rate) * 6000 * (1 - i / n), true);
      return new Blob([buf], { type: 'audio/wav' });
    }
    function imgBlob() {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><defs><linearGradient id="g" x1="0" x2="1">' +
        '<stop offset="0" stop-color="#1d4e89"/><stop offset="1" stop-color="#34977a"/></linearGradient></defs>' +
        '<rect width="640" height="400" fill="url(#g)"/><g fill="none" stroke="#fff" stroke-width="5" opacity=".9">' +
        '<polygon points="320,120 390,160 390,240 320,280 250,240 250,160"/><line x1="390" y1="160" x2="470" y2="115"/>' +
        '<line x1="250" y1="240" x2="170" y2="285"/></g><text x="320" y="360" font-family="Arial" font-size="28" fill="#fff" text-anchor="middle">Anello benzenico</text></svg>';
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          var c = document.createElement('canvas'); c.width = 640; c.height = 400;
          c.getContext('2d').drawImage(img, 0, 0);
          c.toBlob(resolve, 'image/png');
        };
        img.onerror = function () { resolve(new Blob([svg], { type: 'image/png' })); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      });
    }
    function addFile(courseId, name, blob, title, uploader, minsAgo, description) {
      var t = typeFor(name);
      var id = ++seq;
      blobs[id] = blob;
      files.push({
        id: id, course_id: courseId, title: title || baseName(name), description: description || null,
        original_name: name, storage_path: 'demo/' + id, mime: t.mime, kind: t.kind, size: blob.size,
        uploaded_by: uploader, created_at: iso(minsAgo || 0),
      });
      return id;
    }
    function withRefs(f) {
      var c = courses.find(function (x) { return x.id === f.course_id; }) || {};
      var u = users.find(function (x) { return x.id === f.uploaded_by; });
      return Object.assign({}, f, { course: { id: c.id, name: c.name, color: c.color }, uploader: u ? { name: u.name } : null });
    }
    function log(action, details) { audit.unshift({ id: ++seq, action: action, details: details, created_at: iso(0), user: me ? { name: me.name } : null }); }
    function requireAdmin() { if (!me || me.role !== 'admin') throw new Error('Non hai i permessi per questa operazione.'); }
    var wait = function () { return new Promise(function (r) { setTimeout(r, 120); }); };

    var seeded = (async function () {
      addFile(1, 'Lezione 01 - Struttura atomica.pdf', pdfBlob('Lezione 1 - Struttura atomica'), null, 'u-2', 3000);
      addFile(1, 'Esercizi stechiometria.pdf', pdfBlob('Esercizi di stechiometria'), 'Esercizi di stechiometria (con soluzioni)', 'u-3', 2000, 'Raccolta di esercizi svolti in aula.');
      addFile(1, 'Registrazione lezione 3.wav', wavBlob(), 'Registrazione – Lezione 3: legame covalente', 'u-2', 900);
      addFile(2, 'Benzene.png', await imgBlob(), 'Schema anello benzenico', 'u-3', 600);
      addFile(2, 'Appunti stereochimica.pdf', pdfBlob('Appunti di stereochimica'), null, 'u-2', 120);
      addFile(3, 'Titolazioni acido-base.pdf', pdfBlob('Titolazioni acido-base'), null, 'u-3', 60);
    })();

    return {
      demo: true,
      typeFor: typeFor,
      async init() {
        await seeded;
        try { if (sessionStorage.getItem('demo-login')) me = users[0]; } catch (e) { /* storage non disponibile */ }
        return me ? { user: me } : null;
      },
      async refreshMe() { return me ? { user: me } : null; },
      async signIn() {
        me = users[0];
        try { sessionStorage.setItem('demo-login', '1'); } catch (e) { /* ignora */ }
        location.hash = '#/';
        location.reload();
      },
      async signOut() { me = null; try { sessionStorage.removeItem('demo-login'); } catch (e) { /* ignora */ } },
      async stats() {
        await wait();
        return { courses: courses.length, files: files.length, users: users.length, bytes: files.reduce(function (a, f) { return a + f.size; }, 0) };
      },
      async listCourses() {
        await wait();
        return courses.map(function (c) {
          return Object.assign({}, c, { file_count: files.filter(function (f) { return f.course_id === c.id; }).length });
        }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      },
      async getCourse(id) { return courses.find(function (c) { return c.id === id; }) || null; },
      async createCourse(data) {
        var c = Object.assign({ id: ++seq, color: courses.length % 8, created_at: iso(0) }, courseFields(data));
        if (!c.name) throw new Error('Il nome del corso è obbligatorio.');
        courses.push(c); log('corso_creato', c.name);
        return c.id;
      },
      async updateCourse(id, data) {
        requireAdmin();
        Object.assign(courses.find(function (c) { return c.id === id; }), courseFields(data));
        log('corso_modificato', data.name);
      },
      async deleteCourse(id) {
        requireAdmin();
        var c = courses.find(function (x) { return x.id === id; });
        files = files.filter(function (f) { return f.course_id !== id; });
        courses = courses.filter(function (x) { return x.id !== id; });
        log('corso_eliminato', c && c.name);
      },
      async listFiles(opts) {
        opts = opts || {};
        await wait();
        var s = opts.q ? clean(opts.q, 100).toLowerCase() : '';
        return files.filter(function (f) {
          if (opts.courseId && f.course_id !== opts.courseId) return false;
          if (opts.kind && f.kind !== opts.kind) return false;
          if (opts.mine && (!me || f.uploaded_by !== me.id)) return false;
          if (s && ![f.title, f.description, f.original_name].some(function (v) { return (v || '').toLowerCase().indexOf(s) >= 0; })) return false;
          return true;
        }).sort(function (a, b) { return b.created_at.localeCompare(a.created_at); }).slice(0, opts.limit || 300).map(withRefs);
      },
      async getFile(id) { var f = files.find(function (x) { return x.id === id; }); return f ? withRefs(f) : null; },
      async uploadFile(courseId, file, meta, onProgress) {
        var t = typeFor(file.name);
        if (!t) throw new Error('Formato non ammesso: ' + file.name);
        if (file.size > CFG.maxUploadMb * 1024 * 1024) throw new Error('«' + file.name + '» supera il limite di ' + CFG.maxUploadMb + ' MB.');
        if (onProgress) onProgress(0.5);
        await wait();
        var id = addFile(courseId, file.name, file, clean(meta.title, 200), me.id, 0, clean(meta.description, 2000));
        log('file_caricato', file.name);
        return id;
      },
      async fileUrl(file) { return URL.createObjectURL(blobs[file.id]); },
      async usage() {
        return { used: files.reduce(function (a, f) { return a + f.size; }, 0), quota: 10 * 1024 * 1024 * 1024, where: 'anteprima' };
      },
      async deleteFile(file) {
        requireAdmin();
        files = files.filter(function (f) { return f.id !== file.id; });
        log('file_eliminato', file.original_name);
      },
      async listUsers() {
        return users.map(function (u) {
          return Object.assign({}, u, { uploads: files.filter(function (f) { return f.uploaded_by === u.id; }).length });
        });
      },
      async setRole(userId, role) {
        requireAdmin();
        var u = users.find(function (x) { return x.id === userId; });
        if (role === 'student' && u.role === 'admin' && users.filter(function (x) { return x.role === 'admin'; }).length <= 1) {
          throw new Error('Deve rimanere almeno un amministratore');
        }
        u.role = role;
        log(role === 'admin' ? 'ruolo_admin_assegnato' : 'ruolo_admin_revocato', u.email);
      },
      async listAudit() { return audit.slice(0, 40); },
    };
  }

  var configured = Boolean(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
  window.Api = configured ? SupabaseApi() : DemoApi();
  window.Api.typeFor = typeFor;
  window.Api.friendlyError = friendlyError;
  window.Api.acceptAttr = Object.keys(TYPES).map(function (e) { return '.' + e; }).join(',');
})();
