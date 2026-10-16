/*
 * Leghe della classifica e relativi stemmi (disegni originali in SVG).
 * Leghe con 4 divisioni (IV → I); in cima Maestro, Gran Maestro (posizioni 2–5)
 * e Sfidante (n° 1), riservate a chi supera la soglia del Maestro.
 */
(function () {
  'use strict';

  var TIERS = [
    { key: 'ferro', name: 'Ferro', min: 0, c1: '#4a4542', c2: '#9a918b', gem: '#c9c2bc' },
    { key: 'bronzo', name: 'Bronzo', min: 40, c1: '#6b3a1f', c2: '#c98a55', gem: '#f0c7a0' },
    { key: 'argento', name: 'Argento', min: 100, c1: '#5f6b77', c2: '#dfe6ec', gem: '#ffffff' },
    { key: 'oro', name: 'Oro', min: 180, c1: '#8a5a0b', c2: '#f5cf5a', gem: '#fff3c4' },
    { key: 'platino', name: 'Platino', min: 300, c1: '#14615c', c2: '#7fe3d3', gem: '#d9fff8' },
    { key: 'smeraldo', name: 'Smeraldo', min: 460, c1: '#0b5a33', c2: '#3fd68b', gem: '#c9ffe3' },
    { key: 'diamante', name: 'Diamante', min: 660, c1: '#28388f', c2: '#a8b9ff', gem: '#eef1ff' },
    { key: 'maestro', name: 'Maestro', min: 1000, c1: '#5a1f7a', c2: '#d38cff', gem: '#f6e4ff' },
    { key: 'granmaestro', name: 'Gran Maestro', min: 1000, c1: '#7a1424', c2: '#ff7f7f', gem: '#ffe1e1' },
    { key: 'sfidante', name: 'Sfidante', min: 1000, c1: '#174f8f', c2: '#7fc4ff', gem: '#ffe48a' },
  ];
  var BY_KEY = {};
  TIERS.forEach(function (t, i) { t.index = i; BY_KEY[t.key] = t; });
  var DIVISIONS = ['IV', 'III', 'II', 'I'];
  var MASTER_MIN = BY_KEY.maestro.min;

  /** Lega di un utente dati i punti e la posizione in classifica. */
  function leagueFor(points, rank) {
    points = Number(points) || 0;
    if (points >= MASTER_MIN) {
      var top = rank === 1 ? 'sfidante' : rank >= 2 && rank <= 5 ? 'granmaestro' : 'maestro';
      return { tier: BY_KEY[top], division: '', label: BY_KEY[top].name, next: null, progress: 1 };
    }
    var i = 0;
    while (i + 1 < 7 && points >= TIERS[i + 1].min) i++;
    var t = TIERS[i];
    var span = TIERS[i + 1].min - t.min;
    var quarter = span / 4;
    var d = Math.min(3, Math.floor((points - t.min) / quarter));
    var from = t.min + quarter * d;
    var to = Math.round(t.min + quarter * (d + 1));
    var nextLabel = d < 3 ? t.name + ' ' + DIVISIONS[d + 1] : TIERS[i + 1].name + (i + 1 < 7 ? ' IV' : '');
    return {
      tier: t, division: DIVISIONS[d], label: t.name + ' ' + DIVISIONS[d],
      next: { label: nextLabel, points: to, missing: to - points },
      progress: Math.max(0, Math.min(1, (points - from) / (to - from))),
    };
  }

  var uid = 0;
  /** Stemma SVG della lega. size in px. */
  function emblem(key, size) {
    var t = BY_KEY[key] || TIERS[0];
    var id = 'lg' + (++uid);
    var lvl = t.index; // 0..9: più alto = più decorato
    var parts = [];
    parts.push('<defs>' +
      '<linearGradient id="' + id + 'a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + t.c2 + '"/><stop offset="1" stop-color="' + t.c1 + '"/></linearGradient>' +
      '<linearGradient id="' + id + 'b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="' + t.gem + '"/><stop offset="1" stop-color="' + t.c2 + '"/></linearGradient>' +
      '</defs>');
    // Ali (dal Platino in su), più ampie salendo
    if (lvl >= 4) {
      var w = lvl >= 7 ? 1 : lvl >= 5 ? 0.85 : 0.7;
      var wing = function (flip) {
        var s = flip ? -1 : 1;
        var x = function (v) { return 50 + s * v; };
        return '<path fill="url(#' + id + 'a)" stroke="' + t.c1 + '" stroke-width="1.2" d="M' + x(22) + ' 40 ' +
          'C' + x(34 + 8 * w) + ' 30 ' + x(40 + 8 * w) + ' 22 ' + x(44 + 4 * w) + ' ' + (14 - 4 * w) + ' ' +
          'C' + x(42 + 4 * w) + ' 30 ' + x(38) + ' 44 ' + x(26) + ' 58 Z"/>' +
          '<path fill="none" stroke="' + t.gem + '" stroke-opacity=".7" stroke-width="1" d="M' + x(26) + ' 46 C' + x(33) + ' 38 ' + x(38) + ' 32 ' + x(41 + 3 * w) + ' 22"/>';
      };
      parts.push(wing(false) + wing(true));
    }
    // Alloro laterale (dall'Argento al Platino)
    if (lvl >= 2 && lvl <= 4) {
      for (var k = 0; k < 4; k++) {
        var y = 62 - k * 9;
        parts.push('<ellipse cx="' + (24 - k) + '" cy="' + y + '" rx="5" ry="2.4" transform="rotate(-35 ' + (24 - k) + ' ' + y + ')" fill="' + t.c2 + '" stroke="' + t.c1 + '" stroke-width=".8"/>' +
          '<ellipse cx="' + (76 + k) + '" cy="' + y + '" rx="5" ry="2.4" transform="rotate(35 ' + (76 + k) + ' ' + y + ')" fill="' + t.c2 + '" stroke="' + t.c1 + '" stroke-width=".8"/>');
      }
    }
    // Scudo
    parts.push('<path fill="url(#' + id + 'a)" stroke="' + t.c1 + '" stroke-width="2.5" stroke-linejoin="round" ' +
      'd="M50 12 L76 22 L74 54 C72 70 62 80 50 88 C38 80 28 70 26 54 L24 22 Z"/>');
    parts.push('<path fill="none" stroke="' + t.gem + '" stroke-opacity=".75" stroke-width="1.5" stroke-linejoin="round" ' +
      'd="M50 18 L70 26 L68.5 53 C67 66 59 74 50 80 C41 74 33 66 31.5 53 L30 26 Z"/>');
    // Gemma centrale
    parts.push('<path fill="url(#' + id + 'b)" stroke="' + t.c1 + '" stroke-width="1.6" stroke-linejoin="round" d="M50 32 L62 46 L50 66 L38 46 Z"/>' +
      '<path fill="#ffffff" fill-opacity=".55" d="M50 32 L56 46 L50 46 L44 46 Z"/>' +
      '<path fill="none" stroke="' + t.c1 + '" stroke-opacity=".6" stroke-width="1" d="M38 46 H62 M50 32 V66"/>');
    // Corona (Maestro e superiori)
    if (lvl >= 7) {
      parts.push('<path fill="' + t.gem + '" stroke="' + t.c1 + '" stroke-width="1.5" stroke-linejoin="round" ' +
        'd="M36 14 L40 4 L45 11 L50 1 L55 11 L60 4 L64 14 Z"/>' +
        '<circle cx="50" cy="3" r="2.2" fill="' + t.c2 + '"/>');
    }
    // Stelle per Gran Maestro e Sfidante
    if (lvl >= 8) {
      var star = function (cx, cy, r) {
        var pts = [];
        for (var j = 0; j < 10; j++) {
          var a = Math.PI / 5 * j - Math.PI / 2;
          var rr = j % 2 ? r * 0.45 : r;
          pts.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
        }
        return '<polygon points="' + pts.join(' ') + '" fill="' + t.gem + '" stroke="' + t.c1 + '" stroke-width=".8"/>';
      };
      parts.push(star(18, 78, 5) + star(82, 78, 5) + (lvl === 9 ? star(50, 95, 4.5) : ''));
    }
    return '<svg class="emblem" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" role="img" aria-label="Lega ' + t.name + '">' + parts.join('') + '</svg>';
  }

  window.Leagues = { TIERS: TIERS, leagueFor: leagueFor, emblem: emblem, MASTER_MIN: MASTER_MIN };
})();
