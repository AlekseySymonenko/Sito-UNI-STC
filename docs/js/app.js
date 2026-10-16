/* Interfaccia della piattaforma: pagine, navigazione e azioni. */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG;
  var Api = window.Api;
  var root = document.getElementById('app');
  var state = { user: null };

  var KINDS = {
    pdf: { label: 'PDF', plural: 'PDF', icon: 'file-pdf' },
    image: { label: 'Immagine', plural: 'Immagini', icon: 'image' },
    audio: { label: 'Audio', plural: 'Audio', icon: 'audio' },
    video: { label: 'Video', plural: 'Video', icon: 'video' },
    document: { label: 'Documento', plural: 'Documenti', icon: 'doc' },
    other: { label: 'Archivio', plural: 'Altro', icon: 'archive' },
  };
  var MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  // ---- Utilità -----------------------------------------------------------------
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(name) { return '<svg><use href="#i-' + name + '"/></svg>'; }
  function isAdmin() { return Boolean(state.user && state.user.role === 'admin'); }
  function bytes(n) {
    if (!n) return '0 B';
    var u = ['B', 'KB', 'MB', 'GB'];
    var i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
    return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0).replace('.', ',') + ' ' + u[i];
  }
  function date(s) { if (!s) return '—'; var d = new Date(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function dateTime(s) {
    if (!s) return '—';
    var d = new Date(s);
    return date(s) + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function initials(name) {
    return String(name || '?').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join('');
  }
  function toast(text, type) {
    var box = document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'flash flash-' + (type || 'success');
    el.setAttribute('role', 'status');
    el.textContent = text;
    box.appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, 4200);
    setTimeout(function () { el.remove(); }, 4700);
  }
  function fail(err) { toast(Api.friendlyError(err), 'error'); }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function parseHash() {
    var h = location.hash.replace(/^#/, '') || '/';
    var qi = h.indexOf('?');
    var path = qi >= 0 ? h.slice(0, qi) : h;
    var params = new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : '');
    return { path: path, params: params };
  }
  function qs(params) {
    var p = new URLSearchParams();
    Object.keys(params).forEach(function (k) { if (params[k]) p.set(k, params[k]); });
    var s = p.toString();
    return s ? '?' + s : '';
  }

  // ---- Struttura della pagina ------------------------------------------------------
  function shell(active, body) {
    var u = state.user;
    var nav = function (href, key, ic, label) {
      return '<a href="' + href + '" class="' + (active === key ? 'active' : '') + '">' + icon(ic) + label + '</a>';
    };
    return '' +
      (Api.demo ? '<div class="demo-bar">Modalità anteprima: i dati sono di esempio e restano solo su questo dispositivo.</div>' : '') +
      '<aside class="sidebar" id="sidebar">' +
        '<a class="brand" href="#/">' +
          '<svg class="brand-crest"><use href="#i-crest"/></svg>' +
          '<span class="brand-text"><strong>' + esc(CFG.platformName) + '</strong><small>' + esc(CFG.universityName) + '</small></span>' +
        '</a>' +
        '<nav class="nav">' +
          '<p class="nav-label">Didattica</p>' +
          nav('#/', 'home', 'home', 'Dashboard') +
          nav('#/corsi', 'courses', 'book', 'Corsi') +
          nav('#/cerca', 'search', 'search', 'Cerca materiali') +
          nav('#/miei', 'mine', 'upload', 'I miei caricamenti') +
          (isAdmin() ? '<p class="nav-label">Gestione</p>' + nav('#/admin', 'admin', 'shield', 'Amministrazione') : '') +
        '</nav>' +
        '<div class="sidebar-foot">' + icon('lock') + '<span>Accesso riservato agli account @' + esc(CFG.allowedDomain) + '</span></div>' +
      '</aside>' +
      '<div class="sidebar-backdrop" data-action="close-sidebar"></div>' +
      '<div class="main-wrap">' +
        '<header class="topbar">' +
          '<button class="icon-btn menu-btn" type="button" data-action="toggle-sidebar" aria-label="Apri menu">' + icon('menu') + '</button>' +
          '<form class="top-search" data-form="top-search" role="search">' + icon('search') +
            '<input type="search" name="q" placeholder="Cerca lezioni, dispense, registrazioni…" aria-label="Cerca" enterkeyhint="search">' +
          '</form>' +
          '<div class="user-menu">' +
            '<button class="user-btn" type="button" data-action="toggle-menu" aria-haspopup="true" aria-expanded="false">' +
              '<span class="avatar">' + esc(initials(u.name)) + '</span>' +
              '<span class="user-meta"><strong>' + esc(u.name) + '</strong><small>' + (isAdmin() ? 'Amministratore' : 'Studente') + '</small></span>' +
            '</button>' +
            '<div class="dropdown" role="menu">' +
              '<div class="dropdown-head"><strong>' + esc(u.name) + '</strong><small>' + esc(u.email) + '</small></div>' +
              '<a href="#/miei" role="menuitem">' + icon('upload') + 'I miei caricamenti</a>' +
              '<button type="button" role="menuitem" data-action="logout">' + icon('logout') + 'Esci</button>' +
            '</div>' +
          '</div>' +
        '</header>' +
        '<main id="main" class="content">' + body + '</main>' +
        '<footer class="footer"><span>' + esc(CFG.platformName) + ' · ' + esc(CFG.universityName) + '</span>' +
          '<span>' + esc(CFG.disclaimer || 'Materiali condivisi dagli studenti per uso didattico') + ' · <a href="privacy.html">Privacy</a></span></footer>' +
      '</div>';
  }

  function render(active, body, title) {
    document.title = (title ? title + ' · ' : '') + CFG.platformName + ' ' + CFG.shortName;
    root.innerHTML = shell(active, body);
    document.body.classList.remove('sidebar-open');
    window.scrollTo(0, 0);
  }

  function loading(active) { render(active, '<div class="boot"><div class="spinner"></div></div>'); }

  function empty(ic, text, action) {
    return '<div class="empty">' + icon(ic) + '<p>' + text + '</p>' + (action || '') + '</div>';
  }

  function courseCard(c) {
    return '<a class="course-card" href="#/corso/' + c.id + '">' +
      '<div class="course-cover cover-' + (c.color % 8) + '"><span class="course-code">' + esc(c.code || 'CORSO') + '</span>' +
      '<svg class="cover-ic"><use href="#i-book"/></svg></div>' +
      '<div class="course-info"><h3>' + esc(c.name) + '</h3>' +
      '<p class="muted">' + (c.teacher ? 'Prof. ' + esc(c.teacher) : 'Docente non indicato') + (c.year ? ' · ' + esc(c.year) : '') + '</p>' +
      '<div class="course-foot"><span>' + icon('folder') + c.file_count + ' ' + (c.file_count === 1 ? 'materiale' : 'materiali') + '</span></div>' +
      '</div></a>';
  }

  function fileItem(f, withCourse) {
    var k = KINDS[f.kind] || KINDS.other;
    return '<li class="file-item">' +
      '<a class="file-thumb kind-' + f.kind + '" href="#/file/' + f.id + '" tabindex="-1" aria-hidden="true">' +
        (f.kind === 'image' ? '<img alt="" data-thumb="' + f.id + '">' : icon(k.icon)) + '</a>' +
      '<div class="file-body">' +
        '<a class="file-title" href="#/file/' + f.id + '">' + esc(f.title) + '</a>' +
        '<div class="file-meta"><span class="tag kind-' + f.kind + '">' + k.label + '</span>' +
          (withCourse && f.course ? '<a class="meta-link" href="#/corso/' + f.course.id + '">' + esc(f.course.name) + '</a><span class="dot">·</span>' : '') +
          '<span>' + bytes(f.size) + '</span><span class="dot">·</span><span>' + date(f.created_at) + '</span>' +
          '<span class="dot">·</span><span>di ' + esc(f.uploader ? f.uploader.name : 'utente rimosso') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="file-actions">' +
        '<button class="icon-btn" type="button" data-action="download" data-id="' + f.id + '" title="Scarica" aria-label="Scarica ' + esc(f.title) + '">' + icon('download') + '</button>' +
        (isAdmin() ? '<button class="icon-btn danger" type="button" data-action="delete-file" data-id="' + f.id + '" title="Elimina" aria-label="Elimina ' + esc(f.title) + '">' + icon('trash') + '</button>' : '') +
      '</div></li>';
  }

  var fileCache = {};
  function fileList(files, withCourse) {
    files.forEach(function (f) { fileCache[f.id] = f; });
    return '<ul class="file-list">' + files.map(function (f) { return fileItem(f, withCourse); }).join('') + '</ul>';
  }
  // Miniature delle immagini caricate dopo il rendering (URL firmati temporanei)
  function loadThumbs() {
    root.querySelectorAll('img[data-thumb]').forEach(function (img) {
      var f = fileCache[img.getAttribute('data-thumb')];
      if (f) Api.fileUrl(f, false).then(function (url) { img.src = url; }).catch(function () {});
    });
  }

  // ---- Pagine -------------------------------------------------------------------------
  function loginPage(error) {
    document.title = 'Accesso · ' + CFG.platformName + ' ' + CFG.shortName;
    root.innerHTML = '' +
      '<div class="login-grid">' +
        '<section class="login-hero"><div class="hero-pattern" aria-hidden="true"></div>' +
          '<a class="brand brand-lg" href="#/"><svg class="brand-crest"><use href="#i-crest"/></svg>' +
            '<span class="brand-text"><strong>' + esc(CFG.platformName) + '</strong><small>' + esc(CFG.universityName) + '</small></span></a>' +
          '<div class="hero-copy"><p class="eyebrow">Piattaforma didattica</p>' +
            '<h1>Tutti i materiali dei tuoi corsi, in un unico luogo.</h1>' +
            '<p class="lead">Dispense, slide, registrazioni delle lezioni e immagini condivise dagli studenti.</p>' +
            '<ul class="hero-features">' +
              '<li><span class="feat-ic">' + icon('file-pdf') + '</span>PDF e dispense consultabili direttamente nel browser</li>' +
              '<li><span class="feat-ic">' + icon('audio') + '</span>Registrazioni audio e video con player integrato</li>' +
              '<li><span class="feat-ic">' + icon('users') + '</span>Ogni studente può contribuire caricando materiale</li>' +
            '</ul></div>' +
          '<p class="hero-foot">' + esc(CFG.disclaimer || '') + ' · <a href="privacy.html">Informativa privacy</a></p>' +
        '</section>' +
        '<section class="login-panel"><div class="login-card">' +
          '<h2>Accedi</h2>' +
          '<p class="muted">Entra con il tuo account istituzionale <strong>@' + esc(CFG.allowedDomain) + '</strong>.</p>' +
          (error ? '<div class="flash flash-error">' + esc(error) + '</div>' : '') +
          (Api.demo ? '<div class="dev-banner"><strong>Modalità anteprima</strong>Il sito non è ancora collegato a Supabase: puoi provarlo con dati di esempio.</div>' : '') +
          '<button class="btn btn-primary btn-block btn-sso" type="button" data-action="login">' +
            '<svg class="google-g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>' +
            (Api.demo ? 'Entra in anteprima' : 'Accedi con l\'account @' + esc(CFG.allowedDomain)) +
          '</button>' +
          '<div class="privacy-note">' + icon('shield') + '<p><strong>La tua password resta a Google e all\'Ateneo.</strong>' +
            'Il login avviene sulla pagina ufficiale di Google: questo sito non vede né salva la tua password, ' +
            'riceve solo nome ed email istituzionale per verificare che tu sia uno studente.</p></div>' +
        '</div></section>' +
      '</div>';
  }

  async function dashboardPage() {
    loading('home');
    var res = await Promise.all([Api.stats(), Api.listCourses(), Api.listFiles({ limit: 8 }), Api.listFiles({ mine: true, limit: 300 })]);
    var stats = res[0], courses = res[1], recent = res[2], mine = res[3];
    var top = courses.slice().sort(function (a, b) { return b.file_count - a.file_count; }).slice(0, 6);
    var first = String(state.user.name).split(' ')[0];
    render('home',
      '<section class="welcome"><div><p class="eyebrow">Bentornato/a</p><h1>' + esc(first) + ', cosa studiamo oggi?</h1>' +
        '<p class="muted">Consulta i materiali dei corsi o condividi i tuoi appunti con i colleghi.</p></div>' +
        '<div class="welcome-actions"><a class="btn btn-primary" href="#/corsi">' + icon('book') + 'Sfoglia i corsi</a>' +
        '<a class="btn btn-ghost" href="#/nuovo-corso">' + icon('plus') + 'Nuovo corso</a></div></section>' +
      '<section class="stats">' +
        stat('book', stats.courses, 'Corsi') + stat('folder', stats.files, 'Materiali') +
        stat('users', stats.users, 'Studenti iscritti') + stat('upload', mine.length, 'I tuoi contributi') +
      '</section>' +
      '<div class="two-col">' +
        '<section class="panel"><div class="panel-head"><h2>Corsi</h2><a class="link" href="#/corsi">Tutti i corsi →</a></div>' +
          (top.length ? '<div class="course-grid compact">' + top.map(courseCard).join('') + '</div>'
            : empty('book', 'Non ci sono ancora corsi.', '<a class="btn btn-primary" href="#/nuovo-corso">' + icon('plus') + 'Crea il primo corso</a>')) +
        '</section>' +
        '<section class="panel"><div class="panel-head"><h2>Caricati di recente</h2><a class="link" href="#/cerca">Cerca →</a></div>' +
          (recent.length ? fileList(recent, true) : empty('clock', 'Nessun materiale caricato finora.')) +
        '</section>' +
      '</div>', 'Dashboard');
    loadThumbs();
  }
  function stat(ic, n, label) {
    return '<div class="stat"><span class="stat-ic">' + icon(ic) + '</span><div><strong>' + esc(n) + '</strong><small>' + label + '</small></div></div>';
  }

  async function coursesPage(params) {
    loading('courses');
    var q = (params.get('q') || '').toLowerCase();
    var courses = (await Api.listCourses()).filter(function (c) {
      return !q || [c.name, c.code, c.teacher].some(function (v) { return (v || '').toLowerCase().indexOf(q) >= 0; });
    });
    render('courses',
      '<div class="page-head"><div><p class="eyebrow">Catalogo</p><h1>Corsi</h1>' +
        '<p class="muted">Scegli un insegnamento per consultarne i materiali o contribuire.</p></div>' +
        '<a class="btn btn-primary" href="#/nuovo-corso">' + icon('plus') + 'Nuovo corso</a></div>' +
      '<form class="filter-bar" data-form="filter-courses"><div class="input-ic">' + icon('search') +
        '<input type="search" name="q" value="' + esc(params.get('q') || '') + '" placeholder="Filtra per nome, codice o docente"></div>' +
        '<button class="btn btn-ghost" type="submit">Filtra</button></form>' +
      (courses.length ? '<div class="course-grid">' + courses.map(courseCard).join('') + '</div>'
        : '<div class="panel">' + empty('book', q ? 'Nessun corso corrisponde alla ricerca.' : 'Non ci sono ancora corsi.',
          '<a class="btn btn-primary" href="#/nuovo-corso">' + icon('plus') + 'Crea un corso</a>') + '</div>'), 'Corsi');
  }

  async function courseFormPage(id) {
    var course = {};
    if (id) {
      if (!isAdmin()) return errorPage('Accesso negato', 'Solo gli amministratori possono modificare i corsi.');
      loading('courses');
      course = await Api.getCourse(id);
      if (!course) return errorPage('Non trovato', 'Il corso richiesto non esiste.');
    }
    var back = id ? '#/corso/' + id : '#/corsi';
    var field = function (label, name, max, ph, req) {
      return '<label>' + label + '<input type="text" name="' + name + '" maxlength="' + max + '" value="' + esc(course[name] || '') + '" placeholder="' + ph + '"' + (req ? ' required' : '') + '></label>';
    };
    render('courses',
      '<a class="back-link" href="' + back + '">' + icon('arrow-left') + 'Indietro</a>' +
      '<div class="panel form-panel"><h1>' + (id ? 'Modifica corso' : 'Nuovo corso') + '</h1>' +
        '<p class="muted">' + (id ? 'Aggiorna le informazioni dell\'insegnamento.' : 'Aggiungi un insegnamento per raccogliere i relativi materiali.') + '</p>' +
        '<form class="form" data-form="course" data-id="' + (id || '') + '">' +
          field('Nome dell\'insegnamento *', 'name', 140, 'Chimica Organica I', true) +
          '<div class="form-row">' + field('Codice', 'code', 30, 'CHI-201') + field('Anno accademico', 'year', 30, '2026/2027') + '</div>' +
          field('Docente', 'teacher', 120, 'Nome Cognome') +
          '<label>Descrizione<textarea name="description" rows="4" maxlength="2000" placeholder="Programma, orari, note…">' + esc(course.description || '') + '</textarea></label>' +
          '<div class="form-actions"><a class="btn btn-ghost" href="' + back + '">Annulla</a>' +
          '<button class="btn btn-primary" type="submit">' + (id ? 'Salva modifiche' : 'Crea corso') + '</button></div>' +
        '</form></div>', id ? 'Modifica corso' : 'Nuovo corso');
  }

  async function coursePage(id, params) {
    loading('courses');
    var kind = KINDS[params.get('tipo')] ? params.get('tipo') : '';
    var q = params.get('q') || '';
    var res = await Promise.all([Api.getCourse(id), Api.listFiles({ courseId: id })]);
    var course = res[0], all = res[1];
    if (!course) return errorPage('Non trovato', 'Il corso richiesto non esiste.');
    var counts = {};
    all.forEach(function (f) { counts[f.kind] = (counts[f.kind] || 0) + 1; });
    var ql = q.toLowerCase();
    var files = all.filter(function (f) {
      return (!kind || f.kind === kind) &&
        (!ql || [f.title, f.description, f.original_name].some(function (v) { return (v || '').toLowerCase().indexOf(ql) >= 0; }));
    });
    var tab = function (k, label, n) {
      return '<a href="#/corso/' + id + qs({ tipo: k, q: q }) + '" class="' + (kind === k ? 'active' : '') + '">' + label + ' <span>' + n + '</span></a>';
    };
    render('courses',
      '<a class="back-link" href="#/corsi">' + icon('arrow-left') + 'Tutti i corsi</a>' +
      '<section class="course-hero cover-' + (course.color % 8) + '">' +
        '<div class="course-hero-body"><span class="course-code light">' + esc(course.code || 'CORSO') + (course.year ? ' · A.A. ' + esc(course.year) : '') + '</span>' +
          '<h1>' + esc(course.name) + '</h1><p>' + (course.teacher ? 'Docente: Prof. ' + esc(course.teacher) : 'Docente non indicato') + '</p>' +
          (course.description ? '<p class="course-desc">' + esc(course.description) + '</p>' : '') + '</div>' +
        '<div class="course-hero-side"><div class="hero-count"><strong>' + all.length + '</strong><small>materiali</small></div>' +
          '<div class="hero-admin"><a class="btn btn-light btn-sm" href="#upload" data-action="scroll-upload">' + icon('upload') + 'Carica</a>' +
          (isAdmin() ? '<a class="btn btn-light btn-sm" href="#/modifica-corso/' + id + '">' + icon('edit') + 'Modifica</a>' +
            '<button class="btn btn-light btn-sm danger" type="button" data-action="delete-course" data-id="' + id + '" data-name="' + esc(course.name) + '" data-count="' + all.length + '">' + icon('trash') + 'Elimina</button>' : '') +
          '</div></div>' +
      '</section>' +
      '<div class="course-layout">' +
        '<section class="panel"><div class="panel-head wrap"><nav class="tabs" aria-label="Filtra per tipo">' +
          tab('', 'Tutti', all.length) +
          Object.keys(KINDS).filter(function (k) { return counts[k]; }).map(function (k) { return tab(k, KINDS[k].plural, counts[k]); }).join('') +
          '</nav><form class="inline-search" data-form="filter-course" data-id="' + id + '" data-kind="' + kind + '">' + icon('search') +
          '<input type="search" name="q" value="' + esc(q) + '" placeholder="Cerca nel corso"></form></div>' +
          (files.length ? fileList(files, false) : empty('folder', q || kind ? 'Nessun materiale corrisponde ai filtri.' : 'Questo corso non ha ancora materiali. Sii il primo a contribuire!')) +
        '</section>' +
        uploadPanel(id) +
      '</div>', course.name);
    loadThumbs();
  }

  function uploadPanel(courseId) {
    return '<aside class="panel upload-panel" id="upload"><h2>' + icon('upload') + 'Carica materiale</h2>' +
      '<p class="muted small">PDF, immagini, audio, video e documenti. Max ' + CFG.maxUploadMb + ' MB per file.</p>' +
      '<form class="upload-form" data-form="upload" data-id="' + courseId + '">' +
        '<label class="dropzone" data-dropzone><input type="file" name="files" multiple accept="' + Api.acceptAttr + '" data-file-input>' +
          icon('upload') + '<strong>Tocca per scegliere i file</strong><span>oppure trascinali qui</span></label>' +
        '<ul class="selected-files" data-selected></ul>' +
        '<label>Titolo <small class="muted">(se carichi un solo file)</small><input type="text" name="title" maxlength="200" placeholder="Es. Lezione 3 – Equilibrio chimico"></label>' +
        '<label>Descrizione <small class="muted">(facoltativa)</small><textarea name="description" rows="3" maxlength="2000" placeholder="Argomenti trattati, data della lezione…"></textarea></label>' +
        '<div class="progress" data-progress hidden><div class="progress-bar" data-progress-bar></div><span data-progress-label></span></div>' +
        '<button class="btn btn-primary btn-block" type="submit">' + icon('upload') + 'Carica</button>' +
        '<p class="muted small center">I file caricati sono visibili a tutti gli studenti. Solo gli amministratori possono rimuoverli.</p>' +
      '</form></aside>';
  }

  async function filePage(id) {
    loading('courses');
    var f = await Api.getFile(id);
    if (!f) return errorPage('Non trovato', 'Il file richiesto non esiste.');
    fileCache[f.id] = f;
    var k = KINDS[f.kind] || KINDS.other;
    var inline = ['pdf', 'image', 'audio', 'video'].indexOf(f.kind) >= 0;
    var url = inline ? await Api.fileUrl(f, false) : '';
    var viewer;
    if (f.kind === 'pdf') viewer = '<iframe src="' + esc(url) + '" title="' + esc(f.title) + '"></iframe>';
    else if (f.kind === 'image') viewer = '<a href="' + esc(url) + '" target="_blank" rel="noopener"><img src="' + esc(url) + '" alt="' + esc(f.title) + '"></a>';
    else if (f.kind === 'audio') viewer = '<div class="audio-card"><div class="audio-art">' + icon('audio') + '</div><strong>' + esc(f.title) + '</strong><audio controls preload="metadata" src="' + esc(url) + '"></audio></div>';
    else if (f.kind === 'video') viewer = '<video controls playsinline preload="metadata" src="' + esc(url) + '"></video>';
    else viewer = '<div class="no-preview">' + icon(k.icon) + '<p>Anteprima non disponibile per questo formato.</p>' +
      '<button class="btn btn-primary" type="button" data-action="download" data-id="' + f.id + '">' + icon('download') + 'Scarica il file</button></div>';
    render('courses',
      '<a class="back-link" href="#/corso/' + f.course_id + '">' + icon('arrow-left') + esc(f.course ? f.course.name : 'Corso') + '</a>' +
      '<div class="file-layout">' +
        '<section class="panel viewer-panel"><div class="viewer kind-' + f.kind + '">' + viewer + '</div></section>' +
        '<aside class="panel file-details"><span class="tag kind-' + f.kind + '">' + k.label + '</span>' +
          '<h1>' + esc(f.title) + '</h1>' + (f.description ? '<p class="file-desc">' + esc(f.description) + '</p>' : '') +
          '<dl class="details">' +
            '<dt>Corso</dt><dd><a href="#/corso/' + f.course_id + '">' + esc(f.course ? f.course.name : '') + '</a></dd>' +
            '<dt>Nome file</dt><dd class="break">' + esc(f.original_name) + '</dd>' +
            '<dt>Dimensione</dt><dd>' + bytes(f.size) + '</dd>' +
            '<dt>Caricato da</dt><dd>' + esc(f.uploader ? f.uploader.name : 'utente rimosso') + '</dd>' +
            '<dt>Data</dt><dd>' + dateTime(f.created_at) + '</dd>' +
          '</dl>' +
          '<div class="stack">' +
            '<button class="btn btn-primary btn-block" type="button" data-action="download" data-id="' + f.id + '">' + icon('download') + 'Scarica</button>' +
            (inline ? '<a class="btn btn-ghost btn-block" href="' + esc(url) + '" target="_blank" rel="noopener">Apri a schermo intero</a>' : '') +
            (isAdmin() ? '<button class="btn btn-danger btn-block" type="button" data-action="delete-file" data-id="' + f.id + '" data-back="#/corso/' + f.course_id + '">' + icon('trash') + 'Elimina materiale</button>' : '') +
          '</div></aside>' +
      '</div>', f.title);
  }

  async function searchPage(params) {
    var q = params.get('q') || '';
    var kind = KINDS[params.get('tipo')] ? params.get('tipo') : '';
    var files = [];
    if (q) { loading('search'); files = await Api.listFiles({ q: q, kind: kind, limit: 200 }); }
    render('search',
      '<div class="page-head"><div><p class="eyebrow">Ricerca</p><h1>Cerca materiali</h1>' +
        '<p class="muted">Cerca per titolo, descrizione o nome del file.</p></div></div>' +
      '<form class="filter-bar" data-form="search"><div class="input-ic grow">' + icon('search') +
        '<input type="search" name="q" value="' + esc(q) + '" placeholder="Es. stechiometria, lezione 5, laboratorio…" enterkeyhint="search"></div>' +
        '<select name="tipo" aria-label="Tipo di file"><option value="">Tutti i tipi</option>' +
        Object.keys(KINDS).map(function (k) { return '<option value="' + k + '"' + (kind === k ? ' selected' : '') + '>' + KINDS[k].plural + '</option>'; }).join('') +
        '</select><button class="btn btn-primary" type="submit">Cerca</button></form>' +
      '<section class="panel">' +
        (!q ? empty('search', 'Scrivi una parola chiave per iniziare.')
          : files.length ? '<p class="muted small results-count">' + files.length + ' risultat' + (files.length === 1 ? 'o' : 'i') + ' per «' + esc(q) + '»</p>' + fileList(files, true)
          : empty('search', 'Nessun risultato per «' + esc(q) + '».')) +
      '</section>', 'Ricerca');
    loadThumbs();
  }

  async function minePage() {
    loading('mine');
    var files = await Api.listFiles({ mine: true });
    render('mine',
      '<div class="page-head"><div><p class="eyebrow">Profilo</p><h1>I miei caricamenti</h1>' +
        '<p class="muted">Il materiale che hai condiviso. Per rimuovere un file chiedi a un amministratore.</p></div></div>' +
      '<section class="panel">' +
        (files.length ? fileList(files, true) : empty('upload', 'Non hai ancora caricato nessun file.', '<a class="btn btn-primary" href="#/corsi">' + icon('book') + 'Scegli un corso</a>')) +
      '</section>', 'I miei caricamenti');
    loadThumbs();
  }

  var ACTION_LABELS = {
    primo_accesso: 'primo accesso', file_caricato: 'file caricato', file_eliminato: 'file eliminato',
    corso_creato: 'corso creato', corso_modificato: 'corso modificato', corso_eliminato: 'corso eliminato',
    ruolo_admin_assegnato: 'admin assegnato', ruolo_admin_revocato: 'admin revocato',
  };

  async function adminPage(params) {
    if (!isAdmin()) return errorPage('Accesso negato', 'Questa sezione è riservata agli amministratori.');
    loading('admin');
    var res = await Promise.all([Api.stats(), Api.listUsers(), Api.listAudit()]);
    var stats = res[0], audit = res[2];
    var q = (params.get('q') || '').toLowerCase();
    var users = res[1].filter(function (u) { return !q || (u.name + ' ' + u.email).toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1) || a.name.localeCompare(b.name); });
    render('admin',
      '<div class="page-head"><div><p class="eyebrow">Gestione piattaforma</p><h1>Amministrazione</h1>' +
        '<p class="muted">Gli amministratori possono modificare i corsi ed eliminare corsi e materiali.</p></div></div>' +
      '<section class="stats">' + stat('users', stats.users, 'Utenti') + stat('book', stats.courses, 'Corsi') +
        stat('folder', stats.files, 'Materiali') + stat('archive', bytes(stats.bytes), 'Spazio usato') + '</section>' +
      '<section class="panel"><div class="panel-head wrap"><h2>Utenti e ruoli</h2>' +
        '<form class="inline-search" data-form="filter-users">' + icon('search') + '<input type="search" name="q" value="' + esc(params.get('q') || '') + '" placeholder="Cerca per nome o email"></form></div>' +
        '<p class="muted small">Gli studenti compaiono qui dopo il loro primo accesso.</p>' +
        '<div class="table-wrap"><table class="table"><thead><tr><th>Utente</th><th>Ruolo</th><th>Caricamenti</th><th class="right">Azioni</th></tr></thead><tbody>' +
        users.map(function (u) {
          var admin = u.role === 'admin';
          return '<tr><td><div class="user-cell"><span class="avatar sm">' + esc(initials(u.name)) + '</span><div><strong>' + esc(u.name) + (u.id === state.user.id ? ' (tu)' : '') +
            '</strong><small>' + esc(u.email) + '</small></div></div></td>' +
            '<td><span class="role role-' + u.role + '">' + (admin ? 'Amministratore' : 'Studente') + '</span></td>' +
            '<td>' + u.uploads + '</td><td class="right">' +
            (admin ? '<button class="btn btn-ghost btn-sm" type="button" data-action="set-role" data-role="student" data-id="' + u.id + '" data-name="' + esc(u.name) + '">Revoca admin</button>'
              : '<button class="btn btn-primary btn-sm" type="button" data-action="set-role" data-role="admin" data-id="' + u.id + '" data-name="' + esc(u.name) + '">' + icon('shield') + 'Rendi admin</button>') +
            '</td></tr>';
        }).join('') +
        (users.length ? '' : '<tr><td colspan="4" class="center muted">Nessun utente trovato.</td></tr>') +
        '</tbody></table></div></section>' +
      '<section class="panel"><div class="panel-head"><h2>Registro attività</h2></div><ul class="audit">' +
        (audit.length ? audit.map(function (a) {
          return '<li><span class="audit-action a-' + esc(a.action) + '">' + esc(ACTION_LABELS[a.action] || a.action) + '</span>' +
            '<span class="audit-text"><strong>' + esc(a.user ? a.user.name : 'Sistema') + '</strong>' + (a.details ? ' — ' + esc(a.details) : '') + '</span>' +
            '<time class="muted small">' + dateTime(a.created_at) + '</time></li>';
        }).join('') : '<li class="muted">Nessuna attività registrata.</li>') +
      '</ul></section>', 'Amministrazione');
  }

  function errorPage(title, message) {
    render('', '<div class="panel error-card"><span class="error-code">!</span><h1>' + esc(title) + '</h1><p class="muted">' + esc(message) + '</p>' +
      '<a class="btn btn-primary" href="#/">' + icon('home') + 'Torna alla dashboard</a></div>', title);
  }

  // ---- Navigazione ------------------------------------------------------------------
  async function route() {
    if (!state.user) return loginPage();
    var h = parseHash();
    var m;
    try {
      if (h.path === '/') await dashboardPage();
      else if (h.path === '/corsi') await coursesPage(h.params);
      else if (h.path === '/nuovo-corso') await courseFormPage(null);
      else if ((m = /^\/modifica-corso\/(\d+)$/.exec(h.path))) await courseFormPage(Number(m[1]));
      else if ((m = /^\/corso\/(\d+)$/.exec(h.path))) await coursePage(Number(m[1]), h.params);
      else if ((m = /^\/file\/(\d+)$/.exec(h.path))) await filePage(Number(m[1]));
      else if (h.path === '/cerca') await searchPage(h.params);
      else if (h.path === '/miei') await minePage();
      else if (h.path === '/admin') await adminPage(h.params);
      else errorPage('Pagina non trovata', 'La pagina che cerchi non esiste.');
    } catch (err) {
      errorPage('Si è verificato un problema', Api.friendlyError(err));
    }
  }

  // ---- Azioni ------------------------------------------------------------------------
  async function download(id) {
    var f = fileCache[id] || await Api.getFile(Number(id));
    var url = await Api.fileUrl(f, true);
    var a = document.createElement('a');
    a.href = url;
    a.download = f.original_name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleAction(el) {
    var action = el.getAttribute('data-action');
    var id = el.getAttribute('data-id');
    switch (action) {
      case 'toggle-sidebar': document.body.classList.toggle('sidebar-open'); return;
      case 'close-sidebar': document.body.classList.remove('sidebar-open'); return;
      case 'toggle-menu': {
        var menu = el.closest('.user-menu');
        el.setAttribute('aria-expanded', String(menu.classList.toggle('open')));
        return;
      }
      case 'scroll-upload': document.getElementById('upload').scrollIntoView({ behavior: 'smooth' }); return;
      case 'login': return Api.signIn().catch(fail);
      case 'logout':
        await Api.signOut();
        state.user = null;
        location.hash = '#/';
        return loginPage();
      case 'download': return download(id).catch(fail);
      case 'delete-file': {
        var f = fileCache[id];
        if (!confirm('Eliminare definitivamente «' + (f ? f.title : 'questo file') + '»?')) return;
        el.disabled = true;
        try {
          await Api.deleteFile(f || await Api.getFile(Number(id)));
          toast('File eliminato.');
          var back = el.getAttribute('data-back');
          if (back) go(back); else route();
        } catch (err) { el.disabled = false; fail(err); }
        return;
      }
      case 'delete-course': {
        var name = el.getAttribute('data-name');
        if (!confirm('Eliminare il corso «' + name + '» e TUTTI i suoi ' + el.getAttribute('data-count') + ' materiali? L\'operazione è irreversibile.')) return;
        el.disabled = true;
        try { await Api.deleteCourse(Number(id)); toast('Corso «' + name + '» eliminato.'); go('#/corsi'); }
        catch (err) { el.disabled = false; fail(err); }
        return;
      }
      case 'set-role': {
        var role = el.getAttribute('data-role');
        var who = el.getAttribute('data-name');
        if (role === 'student' && !confirm('Revocare il ruolo di amministratore a ' + who + '?')) return;
        el.disabled = true;
        try {
          await Api.setRole(id, role);
          toast(role === 'admin' ? who + ' ora è amministratore.' : who + ' non è più amministratore.');
          var me = await Api.refreshMe();
          if (me && me.user) state.user = me.user;
          go(isAdmin() ? '#/admin' : '#/');
        } catch (err) { el.disabled = false; fail(err); }
      }
    }
  }

  async function handleForm(form) {
    var type = form.getAttribute('data-form');
    var data = Object.fromEntries(new FormData(form).entries());
    switch (type) {
      case 'top-search':
      case 'search':
        return go('#/cerca' + qs({ q: (data.q || '').trim(), tipo: data.tipo }));
      case 'filter-courses': return go('#/corsi' + qs({ q: data.q }));
      case 'filter-users': return go('#/admin' + qs({ q: data.q }));
      case 'filter-course':
        return go('#/corso/' + form.getAttribute('data-id') + qs({ tipo: form.getAttribute('data-kind'), q: data.q }));
      case 'course': {
        var id = Number(form.getAttribute('data-id')) || null;
        if (!String(data.name || '').trim()) return toast('Il nome del corso è obbligatorio.', 'error');
        var btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
          if (id) { await Api.updateCourse(id, data); toast('Corso aggiornato.'); go('#/corso/' + id); }
          else { var newId = await Api.createCourse(data); toast('Corso «' + data.name.trim() + '» creato.'); go('#/corso/' + newId); }
        } catch (err) { btn.disabled = false; fail(err); }
        return;
      }
      case 'upload': return upload(form);
    }
  }

  async function upload(form) {
    var input = form.querySelector('[data-file-input]');
    var files = Array.prototype.slice.call(input.files || []);
    if (!files.length) return toast('Scegli almeno un file.', 'error');
    var bad = files.filter(function (f) { return !Api.typeFor(f.name); });
    if (bad.length) return toast('Formato non ammesso: ' + bad.map(function (f) { return f.name; }).join(', '), 'error');
    var big = files.filter(function (f) { return f.size > CFG.maxUploadMb * 1024 * 1024; });
    if (big.length) return toast('Supera il limite di ' + CFG.maxUploadMb + ' MB: ' + big.map(function (f) { return f.name; }).join(', '), 'error');

    var courseId = Number(form.getAttribute('data-id'));
    var title = files.length === 1 ? form.title.value : '';
    var description = form.description.value;
    var btn = form.querySelector('button[type=submit]');
    var progress = form.querySelector('[data-progress]');
    var bar = form.querySelector('[data-progress-bar]');
    var label = form.querySelector('[data-progress-label]');
    btn.disabled = true;
    progress.hidden = false;
    var done = 0;
    try {
      for (var i = 0; i < files.length; i++) {
        label.textContent = 'Caricamento ' + (i + 1) + ' di ' + files.length + '…';
        bar.style.width = Math.round((i / files.length) * 100 + 100 / files.length / 3) + '%';
        await Api.uploadFile(courseId, files[i], { title: title, description: description });
        done++;
        bar.style.width = Math.round((done / files.length) * 100) + '%';
      }
      toast(done === 1 ? 'File caricato con successo.' : done + ' file caricati con successo.');
      route();
    } catch (err) {
      fail(err);
      if (done) { toast(done + ' file caricati prima dell\'errore.'); route(); return; }
      btn.disabled = false;
      progress.hidden = true;
    }
  }

  function showSelected(input) {
    var list = input.closest('form').querySelector('[data-selected]');
    list.innerHTML = Array.prototype.map.call(input.files, function (f) {
      var ok = Api.typeFor(f.name) && f.size <= CFG.maxUploadMb * 1024 * 1024;
      return '<li class="' + (ok ? '' : 'bad') + '"><span>' + esc(f.name) + '</span><span class="muted">' +
        (ok ? bytes(f.size) : (Api.typeFor(f.name) ? 'troppo grande' : 'formato non ammesso')) + '</span></li>';
    }).join('');
  }

  // ---- Eventi globali ----------------------------------------------------------------
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    var menu = document.querySelector('.user-menu.open');
    if (menu && !e.target.closest('.user-menu')) menu.classList.remove('open');
    if (!el) return;
    if (el.tagName === 'A') e.preventDefault();
    handleAction(el);
  });
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    handleForm(form);
  });
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-file-input]')) showSelected(e.target);
  });
  ['dragenter', 'dragover'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var zone = e.target.closest && e.target.closest('[data-dropzone]');
      if (zone) { e.preventDefault(); zone.classList.add('drag'); }
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var zone = e.target.closest && e.target.closest('[data-dropzone]');
      if (!zone) return;
      zone.classList.remove('drag');
      if (ev === 'drop' && e.dataTransfer && e.dataTransfer.files.length) {
        e.preventDefault();
        var input = zone.querySelector('input');
        input.files = e.dataTransfer.files;
        showSelected(input);
      }
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.body.classList.remove('sidebar-open');
      var menu = document.querySelector('.user-menu.open');
      if (menu) menu.classList.remove('open');
    }
  });
  window.addEventListener('hashchange', function () {
    if (location.hash === '#upload') return; // ancora interna della pagina corso
    route();
  });

  // ---- Avvio -------------------------------------------------------------------------
  Api.init().then(function (res) {
    if (res && res.user) { state.user = res.user; return route(); }
    if (res && res.error === 'domain') {
      return loginPage('L\'account ' + (res.email || '') + ' non è un account @' + CFG.allowedDomain + '. Esci da Google e accedi con l\'account universitario.');
    }
    if (res && res.error === 'profile') return loginPage('Profilo non trovato. Riprova tra qualche secondo o contatta un amministratore.');
    loginPage();
  }).catch(function (err) {
    loginPage(Api.friendlyError(err));
  });
})();
