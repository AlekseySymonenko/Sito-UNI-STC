-- Test delle regole di sicurezza. Eseguito da supabase/tests/run.sh
\set ON_ERROR_STOP on
\set QUIET on

create function pg_temp.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FALLITO: % — avrebbe dovuto essere rifiutato', label;
exception when others then
  if sqlerrm like 'FALLITO:%' then raise; end if;
  raise notice 'ok  %  (%)', label, sqlerrm;
end $$;
create function pg_temp.expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FALLITO: %', label; end if;
  raise notice 'ok  %', label;
end $$;
grant execute on function pg_temp.expect_error(text, text), pg_temp.expect(boolean, text) to public;

-- Utenti: il primo diventa admin
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'Admin.Uno@campus.unimib.it', '{"full_name":"Anna Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'n.cognome@campus.unimib.it', '{"full_name":"Nome Cognome"}'),
  ('00000000-0000-0000-0000-00000000000c', 'intruso@gmail.com', '{"full_name":"Intruso"}');

select pg_temp.expect((select role from profiles where email = 'admin.uno@campus.unimib.it') = 'admin', 'il primo utente è admin');
select pg_temp.expect((select role from profiles where email = 'n.cognome@campus.unimib.it') = 'student', 'il secondo è studente');
select pg_temp.expect(not exists (select 1 from profiles where email = 'intruso@gmail.com'), 'nessun profilo per account esterni');

-- ===== Anonimo =====
set role anon;
select pg_temp.expect_error('select * from courses', 'anonimo non legge i corsi');
reset role;

-- ===== Studente =====
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","email":"n.cognome@campus.unimib.it"}', false);

insert into courses (name, code) values ('Chimica Organica I', 'CHI-101');
select pg_temp.expect((select count(*) from courses) = 1, 'studente crea e vede un corso');
select pg_temp.expect((select created_by from courses limit 1) = auth.uid(), 'created_by impostato dal server');
insert into courses (name, degree, study_year) values ('Chimica Inorganica 1', 'triennale', 1);
select pg_temp.expect_error($q$insert into courses (name, degree, study_year) values ('X', 'magistrale', 3)$q$, 'magistrale ha solo 2 anni');
select pg_temp.expect_error($q$insert into courses (name, degree, study_year) values ('X', 'triennale', null)$q$, 'laurea senza anno rifiutata');
update courses set study_year = 2 where name = 'Chimica Inorganica 1';
select pg_temp.expect((select study_year from courses where name = 'Chimica Inorganica 1') = 1, 'studente NON sposta i corsi');
reset role;
delete from courses where name = 'Chimica Inorganica 1';
set role authenticated;

insert into files (course_id, title, original_name, storage_path, mime, kind, size)
values ((select id from courses limit 1), 'Lezione 1', 'lezione1.pdf', '00000000-0000-0000-0000-00000000000b/a.pdf', 'application/pdf', 'pdf', 1000);
select pg_temp.expect((select count(*) from files) = 1, 'studente carica un file');
select pg_temp.expect_error($q$insert into files (course_id, title, original_name, storage_path, mime, kind, size)
  values ((select id from courses limit 1), 'X', 'x.pdf', '00000000-0000-0000-0000-00000000000a/x.pdf', 'application/pdf', 'pdf', 1)$q$,
  'studente non scrive nella cartella altrui');
select pg_temp.expect_error($q$insert into files (course_id, title, original_name, storage_path, mime, kind, size, uploaded_by)
  values ((select id from courses limit 1), 'X', 'x.pdf', '00000000-0000-0000-0000-00000000000b/y.pdf', 'application/pdf', 'nonvalido', 1, null)$q$,
  'tipo file non valido rifiutato');

delete from files;
select pg_temp.expect((select count(*) from files) = 1, 'studente NON elimina file');
update courses set name = 'Hack';
delete from courses;
select pg_temp.expect((select name from courses limit 1) = 'Chimica Organica I', 'studente NON modifica/elimina corsi');
select pg_temp.expect_error($q$select set_role('00000000-0000-0000-0000-00000000000b', 'admin')$q$, 'studente non si promuove admin');
select pg_temp.expect_error($q$update profiles set role = 'admin'$q$, 'studente non modifica i profili');
select pg_temp.expect((select count(*) from audit_log) = 0, 'studente non legge il registro');
select pg_temp.expect((stats() ->> 'files')::int = 1, 'statistiche visibili');
insert into files (course_id, title, original_name, storage_path, storage, mime, kind, size)
values ((select id from courses limit 1), 'Audio', 'a.mp3', '00000000-0000-0000-0000-00000000000b/b.mp3', 'b2', 'audio/mpeg', 'audio', 5000);
select pg_temp.expect(b2_used_bytes() = 5000, 'spazio B2 conteggiato');
select pg_temp.expect((stats() ->> 'b2_bytes')::int = 5000, 'statistiche B2');
select pg_temp.expect_error($q$insert into files (course_id, title, original_name, storage_path, storage, mime, kind, size)
  values ((select id from courses limit 1), 'X', 'x.pdf', '00000000-0000-0000-0000-00000000000b/z.pdf', 'dropbox', 'application/pdf', 'pdf', 1)$q$,
  'archivio sconosciuto rifiutato');

insert into storage.objects (bucket_id, name) values ('materiali', '00000000-0000-0000-0000-00000000000b/a.pdf');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('materiali', '00000000-0000-0000-0000-00000000000a/z.pdf')$q$,
  'storage: niente upload in cartelle altrui');
delete from storage.objects;
select pg_temp.expect((select count(*) from storage.objects) = 1, 'storage: studente NON elimina');

-- ===== Pulizia automatica dell'archivio B2 =====
reset role;
update app_settings set value = '10000' where key = 'b2_quota_bytes';   -- quota di prova: 10.000 byte
delete from files where storage = 'b2';
insert into files (course_id, title, original_name, storage_path, storage, mime, kind, size) values
  ((select id from courses limit 1), 'Vecchio mai aperto', 'a.pdf', '00000000-0000-0000-0000-00000000000b/ev-a.pdf', 'b2', 'application/pdf', 'pdf', 3000),
  ((select id from courses limit 1), 'Vecchio molto aperto', 'b.pdf', '00000000-0000-0000-0000-00000000000b/ev-b.pdf', 'b2', 'application/pdf', 'pdf', 3000),
  ((select id from courses limit 1), 'Vecchio protetto', 'c.pdf', '00000000-0000-0000-0000-00000000000b/ev-c.pdf', 'b2', 'application/pdf', 'pdf', 1000),
  ((select id from courses limit 1), 'Recente mai aperto', 'd.pdf', '00000000-0000-0000-0000-00000000000b/ev-d.pdf', 'b2', 'application/pdf', 'pdf', 2000),
  ((select id from courses limit 1), 'Vecchio aperto una volta', 'e.pdf', '00000000-0000-0000-0000-00000000000b/ev-e.pdf', 'b2', 'application/pdf', 'pdf', 500);
update files set created_at = now() - interval '60 days' where title like 'Vecchio%';
update files set pinned = true where title = 'Vecchio protetto';
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","email":"n.cognome@campus.unimib.it"}', false);
select record_file_open((select id from files where title = 'Vecchio molto aperto'));
select record_file_open((select id from files where title = 'Vecchio molto aperto'));   -- stesso giorno: non conta
select record_file_open((select id from files where title = 'Vecchio aperto una volta'));
select pg_temp.expect((select open_count from files where title = 'Vecchio molto aperto') = 1, 'aperture: max una al giorno per studente');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"admin.uno@campus.unimib.it"}', false);
select record_file_open((select id from files where title = 'Vecchio molto aperto'));
select pg_temp.expect((select open_count from files where title = 'Vecchio molto aperto') = 2, 'aperture di studenti diversi contano');
select pg_temp.expect((select file_title from b2_eviction_preview(1)) = 'Vecchio mai aperto', 'anteprima admin: primo candidato giusto');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","email":"n.cognome@campus.unimib.it"}', false);
select pg_temp.expect_error('select * from b2_eviction_preview(5)', 'anteprima riservata agli admin');
select pg_temp.expect_error('select * from b2_eviction_order()', 'ordine di eliminazione non chiamabile direttamente');
select pg_temp.expect_error($q$select set_pinned((select id from files limit 1), true)$q$, 'solo admin proteggono i file');
-- occupati 9.500 di 10.000: c'è spazio per 400 byte, nessuna eliminazione
select pg_temp.expect((select count(*) from b2_make_room(400)) = 0, 'spazio sufficiente: nessuna eliminazione');
-- servono 2.000 byte: deficit 1.500 → elimina solo "Vecchio mai aperto" (3.000)
select pg_temp.expect((select string_agg(file_title, ',') from b2_make_room(2000)) = 'Vecchio mai aperto', 'elimina solo il meno usato, quanto basta');
select pg_temp.expect(exists (select 1 from files where title = 'Recente mai aperto'), 'file recenti mai eliminati');
-- ora 6.500 usati; servono 8.000 → deficit 4.500: elimina "aperto una volta" (500) e "molto aperto" (3.000)? non basta: 3.500 < 4.500
select pg_temp.expect_error('select * from b2_make_room(8000)', 'spazio insufficiente: nessuna eliminazione parziale');
select pg_temp.expect((select count(*) from files where storage = 'b2') = 4, 'dopo il rifiuto i file sono ancora tutti lì');
-- servono 6.000 → deficit 2.500: elimina "aperto una volta" (500) poi "molto aperto" (3.000)
select pg_temp.expect((select string_agg(file_title, ',' order by bytes) from b2_make_room(6000)) = 'Vecchio aperto una volta,Vecchio molto aperto', 'ordine: meno aperture prima');
select pg_temp.expect(exists (select 1 from files where title = 'Vecchio protetto'), 'file protetti mai eliminati');
reset role;
select pg_temp.expect((select count(*) from audit_log where action = 'file_eliminato_auto') = 3, 'eliminazioni automatiche nel registro');
update app_settings set value = '10200547328' where key = 'b2_quota_bytes';
set role authenticated;

-- ===== Account esterno (gmail) =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","email":"intruso@gmail.com"}', false);
select pg_temp.expect((select count(*) from courses) = 0, 'esterno non vede i corsi');
select pg_temp.expect((select count(*) from files) = 0, 'esterno non vede i file');
select pg_temp.expect((select count(*) from storage.objects) = 0, 'esterno non vede l''archivio');
select pg_temp.expect(stats() is null, 'esterno non vede le statistiche');
select pg_temp.expect(b2_used_bytes() is null, 'esterno non vede lo spazio B2');
select pg_temp.expect_error('select * from b2_make_room(100)', 'esterno non può attivare la pulizia');
select pg_temp.expect_error($q$insert into courses (name) values ('Spam')$q$, 'esterno non crea corsi');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('materiali', '00000000-0000-0000-0000-00000000000c/s.pdf')$q$,
  'esterno non carica file');

-- ===== Amministratore =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"admin.uno@campus.unimib.it"}', false);
select set_role('00000000-0000-0000-0000-00000000000b', 'admin');
select pg_temp.expect((select role from profiles where email = 'n.cognome@campus.unimib.it') = 'admin', 'admin assegna il ruolo');
select set_role('00000000-0000-0000-0000-00000000000b', 'student');
select pg_temp.expect_error($q$select set_role('00000000-0000-0000-0000-00000000000a', 'student')$q$, 'non si rimuove l''ultimo admin');
update courses set degree = 'magistrale', study_year = 2;
select pg_temp.expect((select degree || study_year from courses limit 1) = 'magistrale2', 'admin sposta il corso');
update courses set description = 'Aggiornato';
select pg_temp.expect((select description from courses limit 1) = 'Aggiornato', 'admin modifica il corso');
delete from storage.objects;
delete from files;
select pg_temp.expect((select count(*) from files) = 0 and (select count(*) from storage.objects) = 0, 'admin elimina file e archivio');
delete from courses;
select pg_temp.expect((select count(*) from courses) = 0, 'admin elimina il corso');
select pg_temp.expect((select count(distinct action) from audit_log where action in ('file_caricato','file_eliminato','corso_eliminato','ruolo_admin_assegnato')) = 4, 'registro attività completo');
reset role;

-- ===== Classifica =====
insert into auth.users values ('00000000-0000-0000-0000-00000000000d', 'l.gatti@campus.unimib.it', '{"full_name":"Lucia Gatti"}');
update profiles set points = 0, upload_count = 0;
insert into courses (name) values ('Corso classifica');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","email":"n.cognome@campus.unimib.it"}', false);
insert into files (course_id, title, original_name, storage_path, mime, kind, size)
select (select id from courses where name = 'Corso classifica'), 'File ' || g, 'f' || g || '.pdf',
       '00000000-0000-0000-0000-00000000000b/cl-' || g || '.pdf', 'application/pdf', 'pdf', 10
from generate_series(1, 12) g;
select pg_temp.expect((select points from profiles where email = 'n.cognome@campus.unimib.it') = 100, 'punti: +10 a file, max 10 file al giorno');
select pg_temp.expect((select upload_count from profiles where email = 'n.cognome@campus.unimib.it') = 12, 'conteggio caricamenti completo');
select record_file_open((select id from files where title = 'File 1'));
select pg_temp.expect((select points from profiles where email = 'n.cognome@campus.unimib.it') = 100, 'aprire i propri file non dà punti');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","email":"l.gatti@campus.unimib.it"}', false);
select record_file_open((select id from files where title = 'File 1'));
select record_file_open((select id from files where title = 'File 1'));
select pg_temp.expect((select points from profiles where email = 'n.cognome@campus.unimib.it') = 101, '+1 punto se un altro apre il file (una volta al giorno)');
select pg_temp.expect((select user_id from leaderboard() limit 1) = '00000000-0000-0000-0000-00000000000b', 'classifica ordinata per punti');
select pg_temp.expect_error('select banned_reason from profiles', 'studenti non vedono i dati di sospensione');
select pg_temp.expect((select count(*) from profiles) >= 3, 'studenti vedono i profili pubblici');
-- segnalazioni
insert into reports (file_id, reason) values ((select id from files where title = 'File 2'), 'Contenuto inappropriato');
select pg_temp.expect_error($q$insert into reports (file_id, reason) values ((select id from files where title = 'File 2'), 'di nuovo')$q$, 'una sola segnalazione per file a persona');
select pg_temp.expect((select count(*) from reports) = 0, 'studenti non leggono le segnalazioni');
select pg_temp.expect_error($q$select ban_user('00000000-0000-0000-0000-00000000000b', 'x')$q$, 'studenti non sospendono');
select pg_temp.expect_error('select * from admin_users()', 'elenco admin riservato');
-- amministratore
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"admin.uno@campus.unimib.it"}', false);
select pg_temp.expect((select count(*) from reports) = 1, 'admin leggono le segnalazioni');
delete from files where title = 'File 3';
select pg_temp.expect((select points from profiles where email = 'n.cognome@campus.unimib.it') = 91, '-10 se un admin elimina un file');
select pg_temp.expect_error($q$select ban_user('00000000-0000-0000-0000-00000000000a', 'x')$q$, 'non ci si auto-sospende');
select pg_temp.expect_error($q$select ban_user('00000000-0000-0000-0000-00000000000b', '  ')$q$, 'serve un motivo');
select ban_user('00000000-0000-0000-0000-00000000000b', 'Materiale pornografico');
select pg_temp.expect((select banned_reason from admin_users() where email = 'n.cognome@campus.unimib.it') = 'Materiale pornografico', 'sospensione registrata');
select pg_temp.expect(not exists (select 1 from leaderboard() where user_id = '00000000-0000-0000-0000-00000000000b'), 'sospesi esclusi dalla classifica');
-- l'utente sospeso
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","email":"n.cognome@campus.unimib.it"}', false);
select pg_temp.expect((my_status() ->> 'banned')::boolean and my_status() ->> 'reason' = 'Materiale pornografico', 'il sospeso vede il motivo');
select pg_temp.expect((select count(*) from courses) = 0 and (select count(*) from files) = 0, 'il sospeso non vede più niente');
select pg_temp.expect_error($q$insert into courses (name) values ('Ritorno')$q$, 'il sospeso non crea corsi');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('materiali', '00000000-0000-0000-0000-00000000000b/z.pdf')$q$, 'il sospeso non carica file');
select pg_temp.expect(stats() is null, 'il sospeso non vede le statistiche');
-- riattivazione ed eliminazione corso (senza penalità)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"admin.uno@campus.unimib.it"}', false);
select unban_user('00000000-0000-0000-0000-00000000000b');
delete from courses where name = 'Corso classifica';
select pg_temp.expect((select points from profiles where email = 'n.cognome@campus.unimib.it') = 91, 'eliminare un corso non toglie punti');
select pg_temp.expect((select count(*) from reports) = 0, 'segnalazioni rimosse con il file');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","email":"n.cognome@campus.unimib.it"}', false);
select pg_temp.expect(not (my_status() ->> 'banned')::boolean and (select count(*) from profiles) >= 3, 'riattivato: accesso ripristinato');
reset role;

\warn 'TUTTI I TEST SUPERATI'
