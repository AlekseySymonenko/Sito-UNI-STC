// =============================================================================
//  Funzione "B2" — archivio file per Appunti per STC
//    • Backblaze B2: documenti (PDF, appunti, foto…)
//    • Cloudflare R2: registrazioni audio e video (facoltativo; senza, tutto va su B2)
//
//  COME INSTALLARLA: Supabase → Edge Functions → funzione "B2" → Code →
//  incolla TUTTO questo file → Deploy.
//  Secrets (Edge Functions → Secrets):
//    B2_KEY_ID, B2_APP_KEY, B2_BUCKET, B2_ENDPOINT  (es. s3.eu-central-003.backblazeb2.com)
//    R2_ACCOUNT_ID, R2_KEY_ID, R2_APP_KEY, R2_BUCKET (Cloudflare; R2_ENDPOINT solo se diverso dal solito)
//    ALLOWED_ORIGIN (facoltativo)
//  I limiti di spazio (9,5 GB ciascuno) sono nel database: tabella app_settings.
//
//  Cosa fa: verifica chi chiama (solo account @campus.unimib.it), poi rilascia
//  link temporanei firmati per caricare/scaricare i file. Le chiavi degli archivi
//  restano qui, sul server: il browser non le vede mai.
//  Le azioni "import-…" servono allo script che trasferisce il vecchio Google Drive:
//  non hanno un account, si identificano con il codice di servizio generato in Amministrazione.
// =============================================================================

const ALLOWED_DOMAIN = 'campus.unimib.it';
const MAX_FILE_MB = 500;
const URL_TTL = 3600; // secondi di validità dei link firmati

// Formati ammessi (stessa lista del sito): estensione → [MIME, tipo]
const TYPES: Record<string, [string, string]> = {
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
  txt: ['text/plain; charset=utf-8', 'document'], md: ['text/plain; charset=utf-8', 'document'],
  zip: ['application/zip', 'other'],
  cif: ['application/octet-stream', 'other'], mryx: ['application/octet-stream', 'other'],
};

export function typeFor(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  const ext = m ? m[1].toLowerCase() : '';
  const t = TYPES[ext];
  return t ? { ext, mime: t[0], kind: t[1] } : null;
}

// ---- Firma AWS Signature V4 (link "presigned", compatibile S3) -----------------
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function hmac(key: ArrayBuffer | Uint8Array, msg: string) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(msg));
}
// Codifica URI secondo le regole di SigV4
const uriEncode = (s: string, keepSlash = false) =>
  [...enc.encode(s)].map((b) => {
    const c = String.fromCharCode(b);
    if (/[A-Za-z0-9\-_.~]/.test(c) || (keepSlash && c === '/')) return c;
    return '%' + b.toString(16).toUpperCase().padStart(2, '0');
  }).join('');

export async function presign(opts: {
  method: string; host: string; region: string; bucket: string; key: string;
  accessKey: string; secretKey: string; expires: number; date?: Date;
  query?: Record<string, string>;
}) {
  const d = opts.date || new Date();
  const amzDate = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${opts.region}/s3/aws4_request`;
  const path = (opts.bucket ? `/${opts.bucket}` : "") + `/${uriEncode(opts.key, true)}`;
  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${opts.accessKey}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(opts.expires),
    'X-Amz-SignedHeaders': 'host',
    ...(opts.query || {}),
  };
  const qs = Object.keys(params).sort().map((k) => `${uriEncode(k)}=${uriEncode(params[k])}`).join('&');
  const canonical = [opts.method, path, qs, `host:${opts.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n');
  let k: ArrayBuffer = await hmac(enc.encode('AWS4' + opts.secretKey), day);
  for (const part of [opts.region, 's3', 'aws4_request']) k = await hmac(k, part);
  const signature = hex(await hmac(k, toSign));
  return `https://${opts.host}${path}?${qs}&X-Amz-Signature=${signature}`;
}

// ---- Configurazione ---------------------------------------------------------------
function env(name: string, fallback = '') {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  return (g.Deno ? g.Deno.env.get(name) : g.process?.env?.[name]) || fallback;
}
type Store = 'b2' | 'r2';
type B2 = { name: Store; host: string; region: string; bucket: string; accessKey: string; secretKey: string };
const cleanHost = (h: string) => h.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

function b2Config(): B2 {
  const host = cleanHost(env('B2_ENDPOINT'));
  const region = (/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/.exec(host) || [])[1] || env('B2_REGION');
  const cfg: B2 = {
    name: 'b2', host, region, bucket: env('B2_BUCKET'), accessKey: env('B2_KEY_ID'), secretKey: env('B2_APP_KEY'),
  };
  if (!cfg.host || !cfg.region || !cfg.bucket || !cfg.accessKey || !cfg.secretKey) {
    throw new HttpError(500, 'Archivio B2 non configurato: mancano dei Secrets nella funzione.');
  }
  return cfg;
}
// Cloudflare R2 (compatibile S3, regione "auto"). null se non configurato.
function r2Config(): B2 | null {
  const account = env('R2_ACCOUNT_ID').trim();
  const host = cleanHost(env('R2_ENDPOINT')) || (account ? `${account}.r2.cloudflarestorage.com` : '');
  const cfg: B2 = {
    name: 'r2', host, region: 'auto', bucket: env('R2_BUCKET'), accessKey: env('R2_KEY_ID'), secretKey: env('R2_APP_KEY'),
  };
  return cfg.host && cfg.bucket && cfg.accessKey && cfg.secretKey ? cfg : null;
}
function storeConfig(name: unknown): B2 {
  if (name === 'r2') {
    const r2 = r2Config();
    if (!r2) throw new HttpError(500, 'Archivio Cloudflare R2 non configurato: mancano dei Secrets nella funzione.');
    return r2;
  }
  return b2Config();
}
// Le registrazioni vanno su Cloudflare R2 (download gratuiti illimitati), il resto su B2
const isRecording = (kind: string) => kind === 'audio' || kind === 'video';
const storeFor = (kind: string): Store => (isRecording(kind) && r2Config() ? 'r2' : 'b2');

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// ---- Supabase (con il token dell'utente: valgono le regole del database) ------------
function sbFetch(req: Request, path: string, init: RequestInit = {}) {
  const apikey = env('SUPABASE_ANON_KEY') || req.headers.get('apikey') || '';
  const auth = req.headers.get('Authorization');
  return fetch(env('SUPABASE_URL') + path, {
    ...init,
    headers: {
      apikey,
      ...(auth ? { Authorization: auth } : {}),
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}
async function sbJson(req: Request, path: string, init: RequestInit = {}) {
  const res = await sbFetch(req, path, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new HttpError(res.status === 401 ? 401 : 400, (data && (data.message || data.msg)) || 'Errore del database');
  return data;
}

async function currentUser(req: Request) {
  if (!/^Bearer\s+\S+/.test(req.headers.get('Authorization') || '')) throw new HttpError(401, 'Accesso richiesto.');
  const user = await sbJson(req, '/auth/v1/user').catch(() => null);
  const email = String(user?.email || '').toLowerCase();
  if (!user?.id || !email.endsWith('@' + ALLOWED_DOMAIN)) throw new HttpError(403, 'Accesso riservato agli account @' + ALLOWED_DOMAIN + '.');
  const rows = await sbJson(req, `/rest/v1/profiles?select=id,role&id=eq.${user.id}`);
  if (!rows?.length) throw new HttpError(403, 'Profilo non trovato.');
  return { id: user.id as string, email, role: rows[0].role as string };
}

const rpc = (req: Request, name: string, args: Record<string, unknown> = {}) =>
  sbJson(req, '/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(args) });

async function usage(req: Request, store: Store) {
  if (store === 'b2') {
    return {
      used: Number(await rpc(req, 'b2_used_bytes')) || 0,
      quota: Number(await rpc(req, 'b2_quota_bytes')) || Math.round(9.5 * 1024 ** 3),
    };
  }
  const u = await rpc(req, 'storage_usage', { st: store });
  return { used: Number(u?.used) || 0, quota: Number(u?.quota) || Math.round(9.5 * 1024 ** 3) };
}

async function getFile(req: Request, id: unknown) {
  if (!Number.isInteger(id)) throw new HttpError(400, 'File non valido.');
  const rows = await sbJson(req, `/rest/v1/files?select=*&id=eq.${id}`);
  if (!rows?.length) throw new HttpError(404, 'File non trovato.');
  return rows[0];
}

// Nome file per l'intestazione Content-Disposition (RFC 5987): oltre a quanto codifica
// encodeURIComponent vanno codificati anche ' ( ) * ! , altrimenti B2 rifiuta la richiesta.
export const rfc5987 = (name: string) =>
  encodeURIComponent(name).replace(/['()*!]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// ---- Operazioni su B2 ------------------------------------------------------------------
const sign = (b2: B2, method: string, key: string, expires = URL_TTL, query?: Record<string, string>) =>
  presign({ method, key, expires, query, host: b2.host, region: b2.region, bucket: b2.bucket, accessKey: b2.accessKey, secretKey: b2.secretKey });

// Con la versione indicata il file viene cancellato subito e per sempre
// (altrimenti B2 lo terrebbe "nascosto" occupando ancora spazio).
async function b2Delete(b2: B2, key: string, version?: string | null) {
  const res = await fetch(await sign(b2, 'DELETE', key, 300, version ? { versionId: version } : undefined), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new HttpError(502, 'Eliminazione su B2 non riuscita (' + res.status + ').');
}

// Imposta (una volta) la regola CORS che permette al sito di caricare file su B2.
let corsReady = false;
async function ensureCors(b2: B2, origin: string) {
  if (corsReady) return;
  const auth = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
    headers: { Authorization: 'Basic ' + btoa(`${b2.accessKey}:${b2.secretKey}`) },
  });
  if (!auth.ok) throw new HttpError(502, 'Chiave B2 non valida.');
  const a = await auth.json();
  const api = a.apiInfo.storageApi.apiUrl;
  const h = { Authorization: a.authorizationToken, 'Content-Type': 'application/json' };
  const list = await (await fetch(`${api}/b2api/v3/b2_list_buckets`, {
    method: 'POST', headers: h, body: JSON.stringify({ accountId: a.accountId, bucketName: b2.bucket }),
  })).json();
  const bucket = list.buckets && list.buckets[0];
  if (!bucket) throw new HttpError(502, 'Bucket B2 "' + b2.bucket + '" non trovato.');
  const wanted = {
    corsRuleName: 'appuntiSito',
    allowedOrigins: [origin],
    allowedOperations: ['s3_put', 's3_get', 's3_head'],
    allowedHeaders: ['*'],
    exposeHeaders: ['ETag'],
    maxAgeSeconds: 3600,
  };
  const current = (bucket.corsRules || []).find((r: { corsRuleName: string }) => r.corsRuleName === wanted.corsRuleName);
  if (!current || JSON.stringify(current.allowedOrigins) !== JSON.stringify(wanted.allowedOrigins)) {
    const others = (bucket.corsRules || []).filter((r: { corsRuleName: string }) => r.corsRuleName !== wanted.corsRuleName);
    const upd = await fetch(`${api}/b2api/v3/b2_update_bucket`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ accountId: a.accountId, bucketId: bucket.bucketId, corsRules: [...others, wanted] }),
    });
    if (!upd.ok) {
      throw new HttpError(502, 'Impossibile configurare B2 (CORS). La chiave deve avere accesso a "All buckets" ' +
        'oppure il permesso writeBuckets.');
    }
  }
  corsReady = true;
}

// Se il nuovo file non ci sta, elimina i file meno usati dello stesso archivio (regole
// nel database: storage_make_room) e li cancella. Restituisce i titoli dei file rimossi.
async function makeRoom(req: Request, b2: B2, size: number) {
  const u = await usage(req, b2.name);
  if (u.used + size <= u.quota) return [];
  let removed: { path: string; version: string | null; file_title: string }[];
  try {
    removed = b2.name === 'b2'
      ? await rpc(req, 'b2_make_room', { needed: size })
      : await rpc(req, 'storage_make_room', { st: b2.name, needed: size });
  } catch (err) {
    throw new HttpError(507, err instanceof Error ? err.message : 'Spazio dell\'archivio esaurito.');
  }
  for (const r of removed) {
    try { await b2Delete(b2, r.path, r.version); } catch (err) { console.error('Pulizia', b2.name, r.path, err); }
  }
  return removed.map((r) => r.file_title);
}

// ---- Importazione dal vecchio Google Drive (script Google, codice di servizio) ----------------
const PART_SIZE = 32 * 1024 * 1024;  // parti da 32 MB (uguali per tutte: lo richiede R2)
const BIG_ZIP = 100 * 1024 * 1024;   // ZIP più grandi: registrazioni da scompattare (robot)
const xmlValue = (xml: string, tag: string) => (new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml) || [])[1] || '';
const validImportKey = (key: unknown) => typeof key === 'string' && /^import\/[0-9a-f-]{36}\.[a-z0-9]+$/.test(key);

async function serviceCheck(req: Request, token: unknown) {
  const ok = await rpc(req, 'service_ping', { token: String(token || '') }).catch(() => false);
  if (ok !== true) throw new HttpError(403, 'Codice di servizio non valido: generane uno nuovo in Amministrazione.');
}

async function handleImport(req: Request, body: Record<string, unknown>) {
  const token = String(body.token || '');
  await serviceCheck(req, token);

  switch (body.action) {
    case 'import-begin': {
      const name = String(body.name || '');
      const size = Number(body.size);
      const t = typeFor(name);
      if (!t) return { status: 'unsupported' };
      if (!(size >= 0)) throw new HttpError(400, 'Dimensione non valida.');
      const store: Store = (isRecording(t.kind) || (t.ext === 'zip' && size > BIG_ZIP)) && r2Config() ? 'r2' : 'b2';
      const status = await rpc(req, 'import_prepare', { token, p_drive_id: String(body.driveId || ''), p_store: store, p_size: size });
      if (status !== 'ok') return { status, store };
      const cfg = storeConfig(store);
      const key = `import/${crypto.randomUUID()}.${t.ext}`;
      if (size <= PART_SIZE) return { status, store, key, url: await sign(cfg, 'PUT', key, 3600) };
      const res = await fetch(await sign(cfg, 'POST', key, 300, { uploads: '' }), { method: 'POST' });
      const uploadId = xmlValue(await res.text(), 'UploadId');
      if (!res.ok || !uploadId) throw new HttpError(502, 'Avvio del caricamento a parti non riuscito (' + res.status + ').');
      return { status, store, key, uploadId, partSize: PART_SIZE };
    }

    case 'import-part': {
      if (!validImportKey(body.key) || !body.uploadId) throw new HttpError(400, 'Caricamento non valido.');
      const part = Number(body.part);
      if (!Number.isInteger(part) || part < 1 || part > 10000) throw new HttpError(400, 'Parte non valida.');
      const cfg = storeConfig(body.store);
      return { url: await sign(cfg, 'PUT', String(body.key), 3600, { partNumber: String(part), uploadId: String(body.uploadId) }) };
    }

    case 'import-finish': {
      if (!validImportKey(body.key)) throw new HttpError(400, 'Caricamento non valido.');
      const key = String(body.key);
      const cfg = storeConfig(body.store);
      const name = String(body.name || '').slice(0, 255);
      const t = typeFor(name);
      if (!t || t.ext !== typeFor(key)?.ext) throw new HttpError(400, 'Dati del file non validi.');
      if (body.uploadId) {
        const parts = (Array.isArray(body.parts) ? body.parts : []) as { n: number; etag: string }[];
        if (!parts.length) throw new HttpError(400, 'Nessuna parte caricata.');
        const xml = '<CompleteMultipartUpload>' + parts.map((p) =>
          `<Part><PartNumber>${Number(p.n)}</PartNumber><ETag>${String(p.etag).replace(/[<>&]/g, '')}</ETag></Part>`).join('') +
          '</CompleteMultipartUpload>';
        const res = await fetch(await sign(cfg, 'POST', key, 300, { uploadId: String(body.uploadId) }), {
          method: 'POST', body: xml, headers: { 'Content-Type': 'application/xml' },
        });
        const text = await res.text();
        if (!res.ok || text.includes('<Error>')) throw new HttpError(502, 'Unione delle parti non riuscita: ' + (xmlValue(text, 'Message') || res.status));
      }
      const head = await fetch(await sign(cfg, 'HEAD', key, 300), { method: 'HEAD' });
      if (!head.ok) throw new HttpError(400, 'Il file non risulta caricato.');
      const size = Number(head.headers.get('content-length')) || 0;
      const version = head.headers.get('x-amz-version-id') || '';
      const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
      try {
        const id = await rpc(req, 'import_register', {
          token,
          p: {
            drive_id: clean(body.driveId, 200), store: cfg.name, path: key, version, size, name,
            title: clean(body.title, 200), description: clean(body.description, 2000),
            kind: t.kind, mime: t.mime.split(';')[0], created: body.created || null, owner: clean(body.owner, 200),
            course: clean(body.course, 140), degree: body.degree || null, study_year: body.studyYear || null, aa: clean(body.aa, 30),
            needs_processing: cfg.name === 'r2',
          },
        });
        return { id, store: cfg.name };
      } catch (err) {
        await b2Delete(cfg, key, version);
        throw err;
      }
    }

    case 'import-abort': {
      if (!validImportKey(body.key)) throw new HttpError(400, 'Caricamento non valido.');
      const cfg = storeConfig(body.store);
      if (body.uploadId) {
        await fetch(await sign(cfg, 'DELETE', String(body.key), 300, { uploadId: String(body.uploadId) }), { method: 'DELETE' });
      } else {
        await b2Delete(cfg, String(body.key));
      }
      return { ok: true };
    }

    default:
      throw new HttpError(400, 'Azione sconosciuta.');
  }
}

// ---- Azioni ----------------------------------------------------------------------------------
async function handle(req: Request, body: Record<string, unknown>) {
  if (typeof body.action === 'string' && body.action.startsWith('import-')) return handleImport(req, body);
  const user = await currentUser(req);
  const isAdmin = user.role === 'admin';

  switch (body.action) {
    case 'usage': {
      const b2 = await usage(req, 'b2');
      const r2 = r2Config() ? await usage(req, 'r2').catch(() => null) : null;
      return { used: b2.used, quota: b2.quota, maxFileMb: MAX_FILE_MB, b2, r2 };
    }

    case 'upload': {
      const name = String(body.name || '');
      const size = Number(body.size);
      const t = typeFor(name);
      if (!t) throw new HttpError(400, 'Formato non ammesso: ' + name);
      if (!(size > 0) || size > MAX_FILE_MB * 1024 * 1024) throw new HttpError(400, 'Il file supera il limite di ' + MAX_FILE_MB + ' MB.');
      const b2 = storeConfig(storeFor(t.kind));
      const origin = env('ALLOWED_ORIGIN') || req.headers.get('Origin') || '';
      if (origin && b2.name === 'b2') await ensureCors(b2, origin); // su R2 il CORS si imposta dal pannello Cloudflare
      const evicted = await makeRoom(req, b2, size);
      const key = `${user.id}/${crypto.randomUUID()}.${t.ext}`;
      return { key, url: await sign(b2, 'PUT', key, 900), contentType: t.mime, evicted, store: b2.name };
    }

    case 'confirm': {
      // Dopo il caricamento: controlla il file realmente presente su B2 e lo registra.
      const key = String(body.key || '');
      if (!key.startsWith(user.id + '/') || key.includes('..')) throw new HttpError(403, 'Percorso non valido.');
      const t = typeFor(key);
      const name = String(body.name || '').slice(0, 255);
      if (!t || !name || typeFor(name)?.ext !== t.ext) throw new HttpError(400, 'Dati del file non validi.');
      const b2 = storeConfig(body.store === 'r2' && storeFor(t.kind) === 'r2' ? 'r2' : 'b2');
      const head = await fetch(await sign(b2, 'HEAD', key, 300), { method: 'HEAD' });
      if (!head.ok) throw new HttpError(400, 'Il file non risulta caricato. Riprova.');
      const size = Number(head.headers.get('content-length')) || 0;
      const version = head.headers.get('x-amz-version-id');
      if (size > MAX_FILE_MB * 1024 * 1024) {
        await b2Delete(b2, key, version);
        throw new HttpError(400, 'Il file supera il limite di ' + MAX_FILE_MB + ' MB.');
      }
      try {
        await makeRoom(req, b2, size); // nel caso altri abbiano caricato nel frattempo
      } catch (err) {
        await b2Delete(b2, key, version);
        throw err;
      }
      const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
      try {
        const rows = await sbJson(req, '/rest/v1/files?select=id', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            course_id: Number(body.courseId),
            title: clean(body.title, 200) || name.replace(/\.[^.]+$/, '').slice(0, 200) || name,
            description: clean(body.description, 2000) || null,
            original_name: name,
            storage_path: key,
            storage: b2.name,
            storage_version: version,
            mime: t.mime.split(';')[0],
            kind: t.kind,
            size,
          }),
        });
        return { id: rows[0].id };
      } catch (err) {
        await b2Delete(b2, key, version);
        throw err;
      }
    }

    case 'url': {
      // Link temporaneo per vedere o scaricare (solo per chi può leggere il file: RLS).
      const f = await getFile(req, body.id);
      if (f.storage !== 'b2' && f.storage !== 'r2') throw new HttpError(400, 'Il file non è su B2 né su R2.');
      const b2 = storeConfig(f.storage);
      if (body.count) await rpc(req, 'record_file_open', { fid: f.id }).catch(() => null);
      const t = typeFor(f.storage_path);
      const name = String(f.original_name);
      const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
      const inline = !body.download && ['pdf', 'image', 'audio', 'video'].includes(f.kind);
      const query: Record<string, string> = {
        'response-content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${rfc5987(name)}`,
        'response-content-type': t ? t.mime : 'application/octet-stream',
      };
      return { url: await sign(b2, 'GET', f.storage_path, URL_TTL, query), expires: URL_TTL };
    }

    case 'delete': {
      if (!isAdmin) throw new HttpError(403, 'Solo gli amministratori possono eliminare i file.');
      const f = await getFile(req, body.id);
      if (f.storage === 'b2' || f.storage === 'r2') await b2Delete(storeConfig(f.storage), f.storage_path, f.storage_version);
      await sbJson(req, `/rest/v1/files?id=eq.${f.id}`, { method: 'DELETE' });
      return { ok: true };
    }

    case 'delete-course-files': {
      if (!isAdmin) throw new HttpError(403, 'Solo gli amministratori possono eliminare i corsi.');
      const courseId = Number(body.courseId);
      if (!Number.isInteger(courseId)) throw new HttpError(400, 'Corso non valido.');
      const rows = await sbJson(req, `/rest/v1/files?select=storage,storage_path,storage_version&storage=in.(b2,r2)&course_id=eq.${courseId}`);
      for (const r of rows) await b2Delete(storeConfig(r.storage), r.storage_path, r.storage_version);
      return { deleted: rows.length };
    }

    default:
      throw new HttpError(400, 'Azione sconosciuta.');
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'Metodo non ammesso' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    return json(await handle(req, body));
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Errore' }, status);
  }
}

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
if (g.Deno && typeof g.Deno.serve === 'function') g.Deno.serve(handler);
