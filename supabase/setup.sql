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
create or replace function public.is_campus()
returns boolean language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@' || public.allowed_domain(), false)
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
      insert into audit_log (user_id, action, details)
      values (auth.uid(), 'file_eliminato', old.original_name);
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
    'bytes',   (select coalesce(sum(size), 0) from files)
  ) end
$$;

-- Permessi (Row Level Security) ----------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.courses   enable row level security;
alter table public.files     enable row level security;
alter table public.audit_log enable row level security;

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

drop policy if exists "registro: solo admin" on public.audit_log;
create policy "registro: solo admin" on public.audit_log
  for select to authenticated using (public.is_admin());

revoke all on public.profiles, public.courses, public.files, public.audit_log from anon, authenticated;
grant select on public.profiles, public.audit_log to authenticated;
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
