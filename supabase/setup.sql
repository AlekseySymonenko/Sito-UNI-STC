-- =============================================================================
--  e-Learning Bicocca — configurazione del database Supabase
--
--  COME USARLO: Supabase → SQL Editor → New query → incolla TUTTO questo file
--  → premi "Run". Si può rieseguire senza problemi.
--
--  Regole applicate dal database (non aggirabili dal browser):
--   • solo gli account @campus.unimib.it vedono e caricano materiali;
--   • tutti gli studenti possono creare corsi e caricare file;
--   • solo gli amministratori possono modificare/eliminare corsi ed eliminare file;
--   • il PRIMO utente che accede diventa automaticamente amministratore.
-- =============================================================================

-- Dominio ammesso -------------------------------------------------------------
create or replace function public.allowed_domain()
returns text language sql immutable as $$ select 'campus.unimib.it' $$;

-- Tabelle -------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  name        text not null,
  role        text not null default 'student' check (role in ('student', 'admin')),
  created_at  timestamptz not null default now()
);

create table if not exists public.courses (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 1 and 140),
  code        text check (char_length(code) <= 30),
  teacher     text check (char_length(teacher) <= 120),
  year        text check (char_length(year) <= 30),
  description text check (char_length(description) <= 2000),
  color       int  not null default 0,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.files (
  id            bigint generated always as identity primary key,
  course_id     bigint not null references public.courses(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  description   text check (char_length(description) <= 2000),
  original_name text not null check (char_length(original_name) <= 255),
  storage_path  text not null unique,
  mime          text not null,
  kind          text not null check (kind in ('pdf', 'image', 'audio', 'video', 'document', 'other')),
  size          bigint not null check (size >= 0),
  uploaded_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists files_course_idx on public.files(course_id);
create index if not exists files_uploader_idx on public.files(uploaded_by);

-- Dove si trova il file: archivio Supabase oppure Backblaze B2 (aggiunto in seguito)
alter table public.files add column if not exists storage text not null default 'supabase';
do $$ begin
  alter table public.files add constraint files_storage_check check (storage in ('supabase', 'b2'));
exception when duplicate_object then null;
end $$;

-- Statistiche di utilizzo per la pulizia automatica dell'archivio B2
alter table public.files add column if not exists storage_version text;
alter table public.files add column if not exists open_count integer not null default 0;
alter table public.files add column if not exists last_opened_at timestamptz;
alter table public.files add column if not exists pinned boolean not null default false;

-- Aperture: ogni studente conta al massimo una volta al giorno per file
create table if not exists public.file_opens (
  file_id bigint not null references public.files(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null default current_date,
  primary key (file_id, user_id, day)
);
create index if not exists file_opens_day_idx on public.file_opens(file_id, day);

-- Impostazioni modificabili dagli amministratori (via SQL Editor)
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
insert into public.app_settings (key, value) values
  ('b2_quota_bytes', '10200547328'),   -- 9,5 GB: sotto i 10 GB gratuiti di Backblaze
  ('evict_grace_days', '14'),          -- i file più recenti di così non vengono mai eliminati
  ('evict_window_days', '365')         -- periodo in cui si contano le aperture (un anno: copre entrambi i semestri)
on conflict (key) do nothing;
-- Aggiornamento: il vecchio valore predefinito era 6 mesi
update public.app_settings set value = '365' where key = 'evict_window_days' and value = '180';

-- Classifica (punti) e moderazione (sospensioni, segnalazioni)
alter table public.profiles add column if not exists points integer not null default 0;
alter table public.profiles add column if not exists upload_count integer not null default 0;
alter table public.profiles add column if not exists banned_at timestamptz;
alter table public.profiles add column if not exists banned_reason text;
alter table public.profiles add column if not exists banned_by uuid references public.profiles(id) on delete set null;

create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  file_id    bigint not null references public.files(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  reason     text not null check (char_length(reason) between 1 and 300),
  created_at timestamptz not null default now(),
  unique (file_id, user_id)
);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles(id) on delete set null,
  action     text not null,
  details    text,
  created_at timestamptz not null default now()
);

-- Funzioni di controllo -----------------------------------------------------------
-- L'email arriva dal token firmato di Supabase Auth: l'utente non può modificarla
-- senza confermare il nuovo indirizzo.
-- Account campus e non sospeso
create or replace function public.is_campus()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@' || public.allowed_domain(), false)
     and not exists (select 1 from profiles where id = auth.uid() and banned_at is not null)
$$;

-- Stato del proprio account (per mostrare la pagina "Account sospeso")
create or replace function public.my_status()
returns json language sql stable security definer set search_path = public as $$
  select case when lower(auth.jwt() ->> 'email') like '%@' || public.allowed_domain() then (
    select json_build_object('exists', true, 'banned', banned_at is not null, 'reason', banned_reason, 'banned_at', banned_at)
    from profiles where id = auth.uid()
  ) end
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_campus() and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
$$;

-- Profilo creato automaticamente al primo accesso -----------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(new.email);
  v_name  text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(v_email, '@', 1));
begin
  if v_email like '%@' || public.allowed_domain() then
    insert into public.profiles (id, email, name, role)
    values (
      new.id, v_email, left(v_name, 120),
      case when exists (select 1 from public.profiles where role = 'admin') then 'student' else 'admin' end
    )
    on conflict (id) do nothing;
    insert into public.audit_log (user_id, action) values (new.id, 'primo_accesso');
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Colore del corso assegnato in automatico ------------------------------------------
create or replace function public.course_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.color := (select count(*) from public.courses) % 8;
  new.created_by := auth.uid();
  return new;
end $$;
drop trigger if exists course_defaults on public.courses;
create trigger course_defaults before insert on public.courses
  for each row execute function public.course_defaults();

create or replace function public.file_defaults()
returns trigger language plpgsql as $$
begin
  new.uploaded_by := auth.uid();
  new.created_at := now();
  return new;
end $$;
drop trigger if exists file_defaults on public.files;
create trigger file_defaults before insert on public.files
  for each row execute function public.file_defaults();

-- Registro attività automatico -----------------------------------------------------------
create or replace function public.log_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'files' then
    if tg_op = 'INSERT' then
      insert into audit_log (user_id, action, details)
      values (auth.uid(), 'file_caricato', new.original_name || ' → ' || (select name from courses where id = new.course_id));
    elsif tg_op = 'DELETE' then
      if current_setting('app.auto_evict', true) = '1' then
        insert into audit_log (user_id, action, details)
        values (null, 'file_eliminato_auto', old.original_name || ' (' || old.open_count || ' aperture)');
      else
        insert into audit_log (user_id, action, details)
        values (auth.uid(), 'file_eliminato', old.original_name);
      end if;
    end if;
  elsif tg_table_name = 'courses' then
    if tg_op = 'INSERT' then
      insert into audit_log (user_id, action, details) values (auth.uid(), 'corso_creato', new.name);
    elsif tg_op = 'UPDATE' then
      insert into audit_log (user_id, action, details) values (auth.uid(), 'corso_modificato', new.name);
    elsif tg_op = 'DELETE' then
      insert into audit_log (user_id, action, details) values (auth.uid(), 'corso_eliminato', old.name);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists log_files on public.files;
create trigger log_files after insert or delete on public.files
  for each row execute function public.log_change();
drop trigger if exists log_courses on public.courses;
create trigger log_courses after insert or update or delete on public.courses
  for each row execute function public.log_change();

-- Assegnare / revocare il ruolo di amministratore ---------------------------------------
create or replace function public.set_role(target uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata agli amministratori';
  end if;
  if new_role not in ('student', 'admin') then
    raise exception 'Ruolo non valido';
  end if;
  if new_role = 'student'
     and (select role from profiles where id = target) = 'admin'
     and (select count(*) from profiles where role = 'admin') <= 1 then
    raise exception 'Deve rimanere almeno un amministratore';
  end if;
  update profiles set role = new_role where id = target returning email into v_email;
  if v_email is null then raise exception 'Utente non trovato'; end if;
  insert into audit_log (user_id, action, details)
  values (auth.uid(), case when new_role = 'admin' then 'ruolo_admin_assegnato' else 'ruolo_admin_revocato' end, v_email);
end $$;

-- Statistiche (conteggi e spazio occupato) ------------------------------------------
create or replace function public.stats()
returns json language sql stable security definer set search_path = public as $$
  select case when public.is_campus() then json_build_object(
    'courses', (select count(*) from courses),
    'files',   (select count(*) from files),
    'users',   (select count(*) from profiles),
    'bytes',   (select coalesce(sum(size), 0) from files),
    'b2_bytes', (select coalesce(sum(size), 0) from files where storage = 'b2')
  ) end
$$;

-- Spazio usato su Backblaze B2 (per non superare il limite gratuito)
create or replace function public.b2_used_bytes()
returns bigint language sql stable security definer set search_path = public as $$
  select case when public.is_campus() then (select coalesce(sum(size), 0) from files where storage = 'b2') end
$$;

create or replace function public.setting_int(k text, fallback bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select value::bigint from app_settings where key = k), fallback)
$$;

create or replace function public.b2_quota_bytes()
returns bigint language sql stable security definer set search_path = public as $$
  select case when public.is_campus() then public.setting_int('b2_quota_bytes', 10200547328) end
$$;

-- Registra un'apertura (vista o download) di un file
create or replace function public.record_file_open(fid bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_campus() or not exists (select 1 from files where id = fid) then return; end if;
  insert into file_opens (file_id, user_id, day) values (fid, auth.uid(), current_date)
  on conflict do nothing;
  if found then
    update files set open_count = open_count + 1, last_opened_at = now() where id = fid;
    -- +1 punto a chi ha caricato il file, se lo apre qualcun altro
    update profiles set points = points + 1
    where id = (select uploaded_by from files where id = fid) and id <> auth.uid();
  else
    update files set last_opened_at = now() where id = fid;
  end if;
end $$;

-- File eliminabili automaticamente, dal meno utile al più utile
create or replace function public.b2_eviction_order()
returns table(file_id bigint, file_title text, bytes bigint, opens bigint, last_activity timestamptz, path text, version text)
language sql stable security definer set search_path = public as $$
  select f.id, f.title, f.size,
         (select count(*) from file_opens o
           where o.file_id = f.id and o.day > current_date - public.setting_int('evict_window_days', 365)::int),
         coalesce(f.last_opened_at, f.created_at),
         f.storage_path, f.storage_version
  from files f
  where f.storage = 'b2' and not f.pinned
    and f.created_at < now() - make_interval(days => public.setting_int('evict_grace_days', 14)::int)
  order by 4 asc, 5 asc, f.id asc
$$;
revoke execute on function public.b2_eviction_order() from public, anon, authenticated;

-- Anteprima per gli amministratori: i prossimi file che verrebbero eliminati
create or replace function public.b2_eviction_preview(lim integer default 5)
returns table(file_id bigint, file_title text, bytes bigint, opens bigint, last_activity timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Operazione riservata agli amministratori'; end if;
  return query select e.file_id, e.file_title, e.bytes, e.opens, e.last_activity
    from public.b2_eviction_order() e limit greatest(1, least(lim, 50));
end $$;

-- Fa spazio per un nuovo caricamento eliminando SOLO il necessario.
-- Restituisce i file eliminati (la funzione "B2" li cancella poi da Backblaze).
create or replace function public.b2_make_room(needed bigint)
returns table(file_id bigint, path text, version text, bytes bigint, file_title text)
language plpgsql security definer set search_path = public as $$
declare
  v_needed  bigint := greatest(0, least(coalesce(needed, 0), 524288000));  -- max 500 MB
  v_deficit bigint;
  v_avail   bigint;
begin
  if not public.is_campus() then raise exception 'Accesso negato'; end if;
  v_deficit := (select coalesce(sum(size), 0) from files where storage = 'b2') + v_needed
               - public.setting_int('b2_quota_bytes', 10200547328);
  if v_deficit <= 0 then return; end if;
  select coalesce(sum(e.bytes), 0) into v_avail from public.b2_eviction_order() e;
  if v_avail < v_deficit then
    raise exception 'Spazio dell''archivio esaurito: non ci sono abbastanza file vecchi o poco usati da eliminare.';
  end if;
  perform set_config('app.auto_evict', '1', true);
  return query
    with ranked as (
      select e.file_id, e.bytes,
             sum(e.bytes) over (order by e.opens, e.last_activity, e.file_id) as running
      from public.b2_eviction_order() e
    ), deleted as (
      delete from files f using ranked r
      where f.id = r.file_id and r.running - r.bytes < v_deficit
      returning f.id, f.storage_path, f.storage_version, f.size, f.title
    )
    select * from deleted;
  perform set_config('app.auto_evict', '', true);
end $$;

-- Protegge un file dall'eliminazione automatica (solo amministratori)
create or replace function public.set_pinned(fid bigint, value boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if not public.is_admin() then raise exception 'Operazione riservata agli amministratori'; end if;
  update files set pinned = value where id = fid returning title into v_title;
  if v_title is null then raise exception 'File non trovato'; end if;
  insert into audit_log (user_id, action, details)
  values (auth.uid(), case when value then 'file_protetto' else 'file_non_protetto' end, v_title);
end $$;

-- Punti della classifica: +10 per file (max 10 file al giorno), -10 se un admin
-- elimina il file. Né la pulizia automatica né l'eliminazione di un corso tolgono punti.
create or replace function public.award_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.uploaded_by is not null then
    update profiles set upload_count = upload_count + 1,
      points = points + case when (select count(*) from files
        where uploaded_by = new.uploaded_by and created_at >= date_trunc('day', now()) and id <= new.id) <= 10 then 10 else 0 end
    where id = new.uploaded_by;
  elsif tg_op = 'DELETE' and old.uploaded_by is not null
        and coalesce(current_setting('app.auto_evict', true), '') <> '1'
        and exists (select 1 from courses where id = old.course_id) then  -- se il corso è stato eliminato, niente penalità
    update profiles set points = greatest(0, points - 10), upload_count = greatest(0, upload_count - 1)
    where id = old.uploaded_by;
  end if;
  return null;
end $$;
drop trigger if exists award_points on public.files;
create trigger award_points after insert or delete on public.files
  for each row execute function public.award_points();

-- Calcolo iniziale dei punti per i file caricati prima della classifica (una sola volta)
do $$ begin
  if not exists (select 1 from app_settings where key = 'points_initialized') then
    update profiles p set
      upload_count = (select count(*) from files f where f.uploaded_by = p.id),
      points = 10 * (select count(*) from files f where f.uploaded_by = p.id)
             + (select count(*) from file_opens o join files f on f.id = o.file_id
                where f.uploaded_by = p.id and o.user_id <> p.id);
    insert into app_settings (key, value) values ('points_initialized', 'true');
  end if;
end $$;

-- Classifica: solo utenti attivi, senza dati riservati
create or replace function public.leaderboard()
returns table(user_id uuid, name text, points integer, upload_count integer, role text, rank_pos bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.points, p.upload_count, p.role,
         rank() over (order by p.points desc, p.upload_count desc)
  from profiles p
  where public.is_campus() and p.banned_at is null
  order by p.points desc, p.upload_count desc, p.name
$$;

-- Elenco completo degli utenti per gli amministratori (con lo stato di sospensione)
create or replace function public.admin_users()
returns table(id uuid, email text, name text, role text, points integer, upload_count integer,
              banned_at timestamptz, banned_reason text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Operazione riservata agli amministratori'; end if;
  return query select p.id, p.email, p.name, p.role, p.points, p.upload_count, p.banned_at, p.banned_reason, p.created_at
    from profiles p order by p.role = 'admin' desc, p.banned_at is not null, p.name;
end $$;

-- Sospendere / riattivare un utente
create or replace function public.ban_user(target uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text; v_role text;
begin
  if not public.is_admin() then raise exception 'Operazione riservata agli amministratori'; end if;
  select email, role into v_email, v_role from profiles where id = target;
  if v_email is null then raise exception 'Utente non trovato'; end if;
  if target = auth.uid() then raise exception 'Non puoi sospendere te stesso'; end if;
  if v_role = 'admin' then raise exception 'Prima revoca il ruolo di amministratore'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Indica il motivo della sospensione'; end if;
  update profiles set banned_at = now(), banned_reason = left(trim(reason), 300), banned_by = auth.uid() where id = target;
  insert into audit_log (user_id, action, details) values (auth.uid(), 'utente_sospeso', v_email || ': ' || left(trim(reason), 300));
end $$;

create or replace function public.unban_user(target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not public.is_admin() then raise exception 'Operazione riservata agli amministratori'; end if;
  update profiles set banned_at = null, banned_reason = null, banned_by = null where id = target returning email into v_email;
  if v_email is null then raise exception 'Utente non trovato'; end if;
  insert into audit_log (user_id, action, details) values (auth.uid(), 'utente_riattivato', v_email);
end $$;

-- Permessi (Row Level Security) ----------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.courses   enable row level security;
alter table public.files     enable row level security;
alter table public.audit_log enable row level security;
alter table public.file_opens enable row level security;
alter table public.app_settings enable row level security;
alter table public.reports enable row level security;
revoke all on public.file_opens, public.app_settings from anon, authenticated;

drop policy if exists "profili visibili agli studenti" on public.profiles;
create policy "profili visibili agli studenti" on public.profiles
  for select to authenticated using (public.is_campus());

drop policy if exists "corsi visibili" on public.courses;
create policy "corsi visibili" on public.courses
  for select to authenticated using (public.is_campus());
drop policy if exists "corsi: tutti possono creare" on public.courses;
create policy "corsi: tutti possono creare" on public.courses
  for insert to authenticated with check (public.is_campus());
drop policy if exists "corsi: solo admin modificano" on public.courses;
create policy "corsi: solo admin modificano" on public.courses
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "corsi: solo admin eliminano" on public.courses;
create policy "corsi: solo admin eliminano" on public.courses
  for delete to authenticated using (public.is_admin());

drop policy if exists "file visibili" on public.files;
create policy "file visibili" on public.files
  for select to authenticated using (public.is_campus());
drop policy if exists "file: tutti possono caricare" on public.files;
create policy "file: tutti possono caricare" on public.files
  for insert to authenticated
  with check (public.is_campus() and split_part(storage_path, '/', 1) = auth.uid()::text);
drop policy if exists "file: solo admin eliminano" on public.files;
create policy "file: solo admin eliminano" on public.files
  for delete to authenticated using (public.is_admin());

drop policy if exists "segnalazioni: studenti segnalano" on public.reports;
create policy "segnalazioni: studenti segnalano" on public.reports
  for insert to authenticated with check (public.is_campus() and user_id = auth.uid());
drop policy if exists "segnalazioni: admin leggono" on public.reports;
create policy "segnalazioni: admin leggono" on public.reports
  for select to authenticated using (public.is_admin());
drop policy if exists "segnalazioni: admin archiviano" on public.reports;
create policy "segnalazioni: admin archiviano" on public.reports
  for delete to authenticated using (public.is_admin());

drop policy if exists "registro: solo admin" on public.audit_log;
create policy "registro: solo admin" on public.audit_log
  for select to authenticated using (public.is_admin());

revoke all on public.profiles, public.courses, public.files, public.audit_log, public.reports from anon, authenticated;
-- Dei profili gli studenti vedono solo i dati pubblici (non lo stato di sospensione)
grant select (id, email, name, role, created_at, points, upload_count) on public.profiles to authenticated;
grant select on public.audit_log to authenticated;
grant select, insert, delete on public.reports to authenticated;
grant select, insert, update, delete on public.courses, public.files to authenticated;
revoke execute on function public.set_role(uuid, text) from public, anon;
grant execute on function public.set_role(uuid, text) to authenticated;

-- Archivio file (Storage) -----------------------------------------------------------
-- Cartella privata "materiali", max 50 MB per file (limite del piano gratuito),
-- solo i formati ammessi (niente HTML/SVG/eseguibili).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materiali', 'materiali', false, 52428800, array[
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg', 'audio/opus', 'audio/flac',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/plain', 'application/zip'
])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "materiali: lettura studenti" on storage.objects;
create policy "materiali: lettura studenti" on storage.objects
  for select to authenticated
  using (bucket_id = 'materiali' and public.is_campus());

drop policy if exists "materiali: caricamento studenti" on storage.objects;
create policy "materiali: caricamento studenti" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'materiali' and public.is_campus()
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "materiali: eliminazione admin" on storage.objects;
create policy "materiali: eliminazione admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'materiali' and public.is_admin());
