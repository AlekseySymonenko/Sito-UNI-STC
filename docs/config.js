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
  platformName: 'e-Learning',
  disclaimer: 'Progetto studentesco non ufficiale',

  // Limite per singolo file (il piano gratuito di Supabase arriva a 50 MB)
  maxUploadMb: 50,
};
