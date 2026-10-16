/*
 * ===================== IMPOSTAZIONI DEL SITO =====================
 * Questo è l'unico file da modificare.
 *
 * supabaseUrl e supabaseAnonKey si trovano su Supabase in:
 *   Project Settings → API  (oppure il pulsante "Connect" in alto)
 * La chiave pubblica ("publishable" o "anon") è pensata per stare nel sito: è pubblica e sicura,
 * perché i permessi veri sono controllati dal database.
 * NON inserire mai qui la chiave "service_role" / "secret".
 *
 * Finché supabaseUrl è vuoto il sito funziona in "modalità anteprima":
 * dati di esempio salvati solo sul dispositivo di chi lo apre.
 */
window.APP_CONFIG = {
  supabaseUrl: 'https://bbyaljjyjfhufesjxycf.supabase.co',
  supabaseAnonKey: 'sb_publishable_i2fK_GSxrDxBBXTLZrnccQ_5Ct0ml8F',

  // Solo gli account con questo dominio possono entrare
  allowedDomain: 'campus.unimib.it',

  universityName: 'Università degli Studi di Milano-Bicocca',
  shortName: 'Bicocca',
  platformName: 'Appunti per STC',
  disclaimer: 'Progetto studentesco non ufficiale',

  // Dove salvare i nuovi file:
  //   'supabase' → archivio di Supabase (1 GB totale, max 50 MB per file)
  //   'b2'       → Backblaze B2 (richiede la funzione "b2" su Supabase; max 500 MB per file)
  storage: 'b2',
  // Nome della Edge Function su Supabase (maiuscole e minuscole contano)
  b2FunctionName: 'B2',

  // Limite per singolo file in MB (50 con 'supabase', fino a 500 con 'b2')
  maxUploadMb: 500,
};
