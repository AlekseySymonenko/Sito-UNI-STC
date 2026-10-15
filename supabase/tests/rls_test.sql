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

insert into storage.objects (bucket_id, name) values ('materiali', '00000000-0000-0000-0000-00000000000b/a.pdf');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('materiali', '00000000-0000-0000-0000-00000000000a/z.pdf')$q$,
  'storage: niente upload in cartelle altrui');
delete from storage.objects;
select pg_temp.expect((select count(*) from storage.objects) = 1, 'storage: studente NON elimina');

-- ===== Account esterno (gmail) =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","email":"intruso@gmail.com"}', false);
select pg_temp.expect((select count(*) from courses) = 0, 'esterno non vede i corsi');
select pg_temp.expect((select count(*) from files) = 0, 'esterno non vede i file');
select pg_temp.expect((select count(*) from storage.objects) = 0, 'esterno non vede l''archivio');
select pg_temp.expect(stats() is null, 'esterno non vede le statistiche');
select pg_temp.expect_error($q$insert into courses (name) values ('Spam')$q$, 'esterno non crea corsi');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id, name) values ('materiali', '00000000-0000-0000-0000-00000000000c/s.pdf')$q$,
  'esterno non carica file');

-- ===== Amministratore =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"admin.uno@campus.unimib.it"}', false);
select set_role('00000000-0000-0000-0000-00000000000b', 'admin');
select pg_temp.expect((select role from profiles where email = 'n.cognome@campus.unimib.it') = 'admin', 'admin assegna il ruolo');
select set_role('00000000-0000-0000-0000-00000000000b', 'student');
select pg_temp.expect_error($q$select set_role('00000000-0000-0000-0000-00000000000a', 'student')$q$, 'non si rimuove l''ultimo admin');
update courses set description = 'Aggiornato';
select pg_temp.expect((select description from courses limit 1) = 'Aggiornato', 'admin modifica il corso');
delete from storage.objects;
delete from files;
select pg_temp.expect((select count(*) from files) = 0 and (select count(*) from storage.objects) = 0, 'admin elimina file e archivio');
delete from courses;
select pg_temp.expect((select count(*) from courses) = 0, 'admin elimina il corso');
select pg_temp.expect((select count(*) from audit_log where action in ('file_caricato','file_eliminato','corso_eliminato','ruolo_admin_assegnato')) = 4, 'registro attività completo');
reset role;


\warn 'TUTTI I TEST SUPERATI'
