-- Kitchen Notebook database setup.
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run. Run it once.

-- Each person's recipes
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sort double precision not null default extract(epoch from now()),
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists recipes_user_idx on public.recipes(user_id);

-- Each person's shopping list and cooking progress (one row per person)
create table if not exists public.kitchens (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  shopping jsonb not null default '{"sections":[],"items":[]}'::jsonb,
  progress jsonb not null default '{"shop":{},"active":{},"cook":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Privacy: people can only see and change their own rows
alter table public.recipes enable row level security;
alter table public.kitchens enable row level security;

drop policy if exists "own recipes" on public.recipes;
create policy "own recipes" on public.recipes
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own kitchen" on public.kitchens;
create policy "own kitchen" on public.kitchens
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Recipe photos: anyone with a photo's link can view it; people can only upload or delete in their own folder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "photos: upload own" on storage.objects;
create policy "photos: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "photos: read own" on storage.objects;
create policy "photos: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "photos: delete own" on storage.objects;
create policy "photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Live updates between your phone and laptop
do $$ begin
  begin alter publication supabase_realtime add table public.recipes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.kitchens; exception when duplicate_object then null; end;
end $$;
