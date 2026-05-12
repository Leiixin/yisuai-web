-- 在 Supabase：SQL Editor 中整段执行一次，启用「个人信息」云端同步（与 app profile-cloud.js 一致）。
-- 每用户一行：昵称、签名、头像 data URL；读写仅本人。

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default '',
  bio text not null default '',
  avatar_data_url text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own" on public.user_profiles for select using (auth.uid() = user_id);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own" on public.user_profiles for insert with check (auth.uid() = user_id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own" on public.user_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_profiles_delete_own" on public.user_profiles;
create policy "user_profiles_delete_own" on public.user_profiles for delete using (auth.uid() = user_id);

-- 若表为手工创建，请确保 authenticated 角色可访问该表（否则 PostgREST 返回 401/403）
grant select, insert, update, delete on table public.user_profiles to authenticated;
