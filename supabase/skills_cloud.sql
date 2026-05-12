-- 在 Supabase：SQL Editor 中整段执行一次，启用「技能」云端共享。
-- 公开读：任何人（含未登录）可用 anon key 拉取列表；写：仅本人。

create table if not exists public.skills (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  url text not null default '',
  detail_intro text,
  featured_cases text,
  featured_cases_images jsonb not null default '[]'::jsonb,
  skill_category text,
  open_source_mode text,
  author_display text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists skills_user_id_idx on public.skills (user_id);
create index if not exists skills_created_at_idx on public.skills (created_at desc);

alter table public.skills enable row level security;

drop policy if exists "skills_select_public" on public.skills;
create policy "skills_select_public" on public.skills for select using (true);

drop policy if exists "skills_insert_own" on public.skills;
create policy "skills_insert_own" on public.skills for insert with check (auth.uid() = user_id);

drop policy if exists "skills_update_own" on public.skills;
create policy "skills_update_own" on public.skills for update using (auth.uid() = user_id);

drop policy if exists "skills_delete_own" on public.skills;
create policy "skills_delete_own" on public.skills for delete using (auth.uid() = user_id);
