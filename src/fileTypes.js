'use strict';

const path = require('node:path');

/**
 * Tipi di file ammessi. Il MIME servito al browser è deciso dal server in base
 * all'estensione (mai quello dichiarato dal client) per evitare contenuti attivi.
 */
const TYPES = {
  // PDF
  pdf: { mime: 'application/pdf', kind: 'pdf' },
  // Immagini (SVG escluso: può contenere script)
  jpg: { mime: 'image/jpeg', kind: 'image' },
  jpeg: { mime: 'image/jpeg', kind: 'image' },
  png: { mime: 'image/png', kind: 'image' },
  gif: { mime: 'image/gif', kind: 'image' },
  webp: { mime: 'image/webp', kind: 'image' },
  avif: { mime: 'image/avif', kind: 'image' },
  // Audio
  mp3: { mime: 'audio/mpeg', kind: 'audio' },
  m4a: { mime: 'audio/mp4', kind: 'audio' },
  aac: { mime: 'audio/aac', kind: 'audio' },
  wav: { mime: 'audio/wav', kind: 'audio' },
  ogg: { mime: 'audio/ogg', kind: 'audio' },
  oga: { mime: 'audio/ogg', kind: 'audio' },
  opus: { mime: 'audio/opus', kind: 'audio' },
  flac: { mime: 'audio/flac', kind: 'audio' },
  // Video
  mp4: { mime: 'video/mp4', kind: 'video' },
  webm: { mime: 'video/webm', kind: 'video' },
  mov: { mime: 'video/quicktime', kind: 'video' },
  // Documenti e slide
  doc: { mime: 'application/msword', kind: 'document' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document' },
  ppt: { mime: 'application/vnd.ms-powerpoint', kind: 'document' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'document' },
  xls: { mime: 'application/vnd.ms-excel', kind: 'document' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'document' },
  odt: { mime: 'application/vnd.oasis.opendocument.text', kind: 'document' },
  odp: { mime: 'application/vnd.oasis.opendocument.presentation', kind: 'document' },
  ods: { mime: 'application/vnd.oasis.opendocument.spreadsheet', kind: 'document' },
  txt: { mime: 'text/plain; charset=utf-8', kind: 'document' },
  md: { mime: 'text/plain; charset=utf-8', kind: 'document' },
  zip: { mime: 'application/zip', kind: 'other' },
};

const KINDS = {
  pdf: { label: 'PDF', plural: 'PDF', icon: 'file-pdf' },
  image: { label: 'Immagine', plural: 'Immagini', icon: 'image' },
  audio: { label: 'Audio', plural: 'Audio', icon: 'audio' },
  video: { label: 'Video', plural: 'Video', icon: 'video' },
  document: { label: 'Documento', plural: 'Documenti', icon: 'doc' },
  other: { label: 'Archivio', plural: 'Altro', icon: 'archive' },
};

// Tipi che il browser può mostrare in pagina in modo sicuro.
const INLINE_KINDS = new Set(['pdf', 'image', 'audio', 'video']);

function typeFor(filename) {
  const ext = path.extname(filename || '').slice(1).toLowerCase();
  return TYPES[ext] ? { ext, ...TYPES[ext] } : null;
}

const acceptAttr = Object.keys(TYPES).map((e) => `.${e}`).join(',');

module.exports = { TYPES, KINDS, INLINE_KINDS, typeFor, acceptAttr };
