(function () {
  'use strict';

  function formatBytes(n) {
    var u = ['B', 'KB', 'MB', 'GB'];
    var i = n ? Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1) : 0;
    return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0).replace('.', ',') + ' ' + u[i];
  }

  document.addEventListener('click', function (e) {
    // Sidebar mobile
    if (e.target.closest('[data-toggle-sidebar]')) document.body.classList.toggle('sidebar-open');
    if (e.target.closest('[data-close-sidebar]')) document.body.classList.remove('sidebar-open');

    // Menu utente
    var menuBtn = e.target.closest('[data-toggle-menu]');
    var menu = document.querySelector('.user-menu');
    if (menuBtn && menu) {
      var open = menu.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
    } else if (menu && !e.target.closest('.user-menu')) {
      menu.classList.remove('open');
    }

    // Chiusura messaggi
    var dismiss = e.target.closest('[data-dismiss]');
    if (dismiss) dismiss.parentElement.remove();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.body.classList.remove('sidebar-open');
      var menu = document.querySelector('.user-menu');
      if (menu) menu.classList.remove('open');
    }
  });

  // Conferma prima delle azioni distruttive
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  // Caricamento file con drag & drop e barra di avanzamento
  document.querySelectorAll('[data-upload]').forEach(function (form) {
    var input = form.querySelector('[data-file-input]');
    var zone = form.querySelector('[data-dropzone]');
    var list = form.querySelector('[data-selected]');
    var progress = form.querySelector('[data-progress]');
    var bar = form.querySelector('[data-progress-bar]');
    var label = form.querySelector('[data-progress-label]');
    var errorBox = form.querySelector('[data-upload-error]');
    var submit = form.querySelector('button[type=submit]');

    function render() {
      list.innerHTML = '';
      Array.prototype.forEach.call(input.files, function (f) {
        var li = document.createElement('li');
        var name = document.createElement('span');
        name.textContent = f.name;
        var size = document.createElement('span');
        size.className = 'muted';
        size.textContent = formatBytes(f.size);
        li.appendChild(name);
        li.appendChild(size);
        list.appendChild(li);
      });
    }

    input.addEventListener('change', render);
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function () { zone.classList.remove('drag'); });
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        render();
      }
    });

    form.addEventListener('submit', function (e) {
      if (!window.FormData || !window.XMLHttpRequest) return; // invio classico
      e.preventDefault();
      if (!input.files.length) return;
      errorBox.hidden = true;
      progress.hidden = false;
      submit.disabled = true;

      var xhr = new XMLHttpRequest();
      xhr.open('POST', form.action.split('?')[0]);
      xhr.setRequestHeader('X-CSRF-Token', form.getAttribute('data-csrf'));
      xhr.upload.addEventListener('progress', function (ev) {
        if (!ev.lengthComputable) return;
        var pct = Math.round((ev.loaded / ev.total) * 100);
        bar.style.width = pct + '%';
        label.textContent = pct < 100 ? pct + '%' : 'Elaborazione…';
      });
      xhr.addEventListener('load', function () {
        var data = {};
        try { data = JSON.parse(xhr.responseText); } catch (err) { /* risposta non JSON */ }
        if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
          window.location.reload();
        } else {
          fail(data.error || 'Caricamento non riuscito (errore ' + xhr.status + ').');
        }
      });
      xhr.addEventListener('error', function () { fail('Errore di rete durante il caricamento.'); });
      xhr.send(new FormData(form));

      function fail(msg) {
        errorBox.textContent = msg;
        errorBox.hidden = false;
        progress.hidden = true;
        bar.style.width = '0';
        submit.disabled = false;
      }
    });
  });
})();
