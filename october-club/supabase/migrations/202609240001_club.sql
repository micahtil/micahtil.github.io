begin;

create schema if not exists club_private;
revoke all on schema club_private from public, anon, authenticated;

create table club_private.challenge (
  id boolean primary key default true check (id),
  title text not null default 'October Club',
  starts_on date not null default '2026-10-01',
  ends_on date not null default '2026-10-31',
  closes_on date not null default '2026-11-03',
  timezone text not null default 'America/New_York',
  currency text not null default 'USD' check (currency = 'USD'),
  slack_team_id text not null check (slack_team_id ~ '^T[A-Z0-9]+$'),
  check (starts_on <= ends_on and closes_on > ends_on)
);
create table club_private.categories (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{0,29}$'),
  name text not null, description text not null default '', position integer not null
);
create table club_private.members (
  id uuid primary key default gen_random_uuid(),
  slack_user_id text not null unique check (slack_user_id ~ '^[UW][A-Z0-9]+$'),
  display_name text not null check (length(display_name) between 1 and 40),
  role text not null default 'member' check (role in ('owner', 'member')),
  reviewed_through date,
  created_at timestamptz not null default now()
);
create table club_private.entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references club_private.members on delete cascade,
  category_id text not null references club_private.categories,
  amount_cents integer not null check (amount_cents <> 0 and abs(amount_cents::bigint) <= 100000000),
  spent_on date not null,
  source text not null check (source in ('web', 'slack')),
  created_at timestamptz not null default clock_timestamp(),
  voided_at timestamptz
);
create index entries_member_date on club_private.entries(member_id, spent_on);
create table club_private.budgets (
  member_id uuid not null references club_private.members on delete cascade,
  category_id text not null references club_private.categories,
  amount_cents integer not null check (amount_cents >= 0 and amount_cents <= 100000000),
  primary key(member_id, category_id)
);
create table club_private.requests (
  member_id uuid not null references club_private.members on delete cascade,
  request_id text not null,
  action text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(member_id, request_id)
);

alter table club_private.challenge enable row level security;
alter table club_private.categories enable row level security;
alter table club_private.members enable row level security;
alter table club_private.entries enable row level security;
alter table club_private.budgets enable row level security;
alter table club_private.requests enable row level security;
revoke all on all tables in schema club_private from public, anon, authenticated;

-- Membership is matched against provider-owned auth.identities, never editable user_metadata.
create function club_private.current_member() returns uuid
language plpgsql security definer set search_path = '' as $$
declare member_uuid uuid;
begin
  select m.id into member_uuid
  from auth.identities i
  join club_private.challenge c on true
  join club_private.members m on m.slack_user_id = i.identity_data->>'sub'
  where i.user_id = auth.uid() and i.provider = 'slack_oidc'
    and i.identity_data->'custom_claims'->>'https://slack.com/team_id' = c.slack_team_id
  limit 1;
  if member_uuid is null then
    raise exception 'You are not a member of this challenge. Ask the organizer to run /spend invite @you, then sign in with that Slack workspace.' using errcode = '42501';
  end if;
  return member_uuid;
end $$;

create function club_private.today() returns date
language sql stable security definer set search_path = '' as $$
  select (current_timestamp at time zone c.timezone)::date from club_private.challenge c;
$$;

create function public.club_dashboard() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare mid uuid := club_private.current_member();
begin
  return jsonb_build_object(
    'today', club_private.today(),
    'challenge', (select to_jsonb(c) - 'slack_team_id' - 'id' from club_private.challenge c),
    'me', (select to_jsonb(m) from club_private.members m where m.id = mid),
    'members', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at, m.id) from club_private.members m), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.position) from club_private.categories c), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg((to_jsonb(e) - 'voided_at') || jsonb_build_object('voided', e.voided_at is not null) order by e.created_at, e.id) from club_private.entries e), '[]'::jsonb),
    'budgets', coalesce((select jsonb_agg(to_jsonb(b)) from club_private.budgets b where b.member_id = mid), '[]'::jsonb)
  );
end $$;

-- All mutations serialize on the actor's membership row. A retried request returns
-- its previous result, including undo, so retries cannot add or remove extra entries.
create function club_private.mutate(mid uuid, action_name text, body jsonb, request_key text, origin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  member_record club_private.members;
  challenge_record club_private.challenge;
  prior club_private.requests;
  entry_record club_private.entries;
  result jsonb;
  entry_date date;
  amount integer;
  category_code text;
  date_today date := club_private.today();
  new_name text;
  row_data jsonb;
  entry_uuid uuid;
  total_cents bigint;
begin
  if request_key is null or length(request_key) not between 1 and 200 or body is null or jsonb_typeof(body) <> 'object' then raise exception 'Invalid request.'; end if;
  select * into member_record from club_private.members where id = mid for update;
  if not found then raise exception 'Challenge membership required.' using errcode = '42501'; end if;
  select * into challenge_record from club_private.challenge;
  if not found then raise exception 'The challenge is not configured yet.'; end if;
  select * into prior from club_private.requests where member_id = mid and request_id = request_key;
  if found then
    if prior.action <> action_name or prior.payload <> body then raise exception 'This request ID was already used for a different operation.'; end if;
    return prior.result;
  end if;

  if action_name in ('add', 'undo', 'done') and (date_today < challenge_record.starts_on or date_today >= challenge_record.closes_on) then
    raise exception 'Entries open October 1 and close after November 2 in the challenge timezone.';
  end if;

  if action_name = 'add' then
    if body->>'amount_cents' is null or (body->>'amount_cents') !~ '^-?[0-9]+$' then raise exception 'Invalid dollar amount.'; end if;
    amount := (body->>'amount_cents')::integer;
    if amount = 0 or abs(amount::bigint) > 100000000 then raise exception 'Use a nonzero amount up to $1,000,000.'; end if;
    category_code := body->>'category_id';
    if not exists (select 1 from club_private.categories where id = category_code) then raise exception 'Unknown category. This challenge tracks Coffee shop.'; end if;
    entry_date := coalesce((body->>'date')::date, least(date_today, challenge_record.ends_on));
    if entry_date < challenge_record.starts_on or entry_date > least(date_today, challenge_record.ends_on) then raise exception 'Use a date within October, no later than today.'; end if;
    insert into club_private.entries(member_id, category_id, amount_cents, spent_on, source)
    values(mid, category_code, amount, entry_date, origin) returning id into entry_uuid;
    update club_private.members set reviewed_through = null where id = mid and reviewed_through >= entry_date;
    select coalesce(sum(amount_cents), 0) into total_cents from club_private.entries where member_id = mid and voided_at is null;
    result := jsonb_build_object('message', case when amount > 0 then 'Added $' else 'Refunded $' end || to_char(abs(amount::numeric) / 100, 'FM999999990.00') || ' in ' || category_code || ' on ' || entry_date || '. October total: $' || to_char(total_cents::numeric / 100, 'FM999999999990.00') || '. Undo with /spend undo ' || entry_uuid, 'entry_id', entry_uuid, 'total_cents', total_cents);
  elsif action_name = 'undo' then
    if nullif(body->>'entry_id', '') is not null then
      select * into entry_record from club_private.entries where id = (body->>'entry_id')::uuid and member_id = mid and voided_at is null;
    else
      select * into entry_record from club_private.entries where member_id = mid and voided_at is null order by created_at desc, id desc limit 1;
    end if;
    if not found then raise exception 'No matching active entry of yours to undo.'; end if;
    update club_private.entries set voided_at = now() where id = entry_record.id;
    update club_private.members set reviewed_through = null where id = mid and reviewed_through >= entry_record.spent_on;
    result := jsonb_build_object('message', 'Entry undone. Review your spending again when ready.', 'entry_id', entry_record.id);
  elsif action_name = 'done' then
    entry_date := coalesce((body->>'date')::date, least(date_today, challenge_record.ends_on));
    if entry_date < challenge_record.starts_on or entry_date > least(date_today, challenge_record.ends_on) then raise exception 'Use a review date within October, no later than today.'; end if;
    update club_private.members set reviewed_through = entry_date where id = mid;
    result := jsonb_build_object('message', 'All spending confirmed through ' || entry_date || '.');
  elsif action_name = 'total' then
    select coalesce(sum(amount_cents), 0) into total_cents from club_private.entries where member_id = mid and voided_at is null;
    result := jsonb_build_object('message', 'Your October total is $' || to_char(total_cents::numeric / 100, 'FM999999999990.00') || '. Reviewed through: ' || coalesce(member_record.reviewed_through::text, 'not yet reviewed') || '.', 'total_cents', total_cents);
  elsif action_name = 'name' then
    new_name := btrim(body->>'name');
    if new_name is null or length(new_name) not between 1 and 40 then raise exception 'Use a name from 1 to 40 characters.'; end if;
    update club_private.members set display_name = new_name where id = mid;
    result := jsonb_build_object('message', 'Your name is updated.');
  elsif action_name = 'budgets' then
    if jsonb_typeof(body->'rows') is distinct from 'array' then raise exception 'Invalid budget rows.'; end if;
    delete from club_private.budgets where member_id = mid;
    for row_data in select value from jsonb_array_elements(body->'rows') loop
      if row_data->>'amount_cents' is null or (row_data->>'amount_cents') !~ '^[0-9]+$' then raise exception 'Invalid budget amount.'; end if;
      insert into club_private.budgets values(mid, row_data->>'category_id', (row_data->>'amount_cents')::integer);
    end loop;
    result := jsonb_build_object('message', 'Your optional budgets are saved.');
  elsif action_name = 'invite' then
    if member_record.role <> 'owner' then raise exception 'Only the organizer can invite people.' using errcode = '42501'; end if;
    new_name := body->>'slack_user_id';
    if new_name is null or new_name !~ '^[UW][A-Z0-9]{2,}$' or length(new_name) > 40 then raise exception 'Select a Slack member to invite.'; end if;
    insert into club_private.members(slack_user_id, display_name) values(new_name, new_name) on conflict(slack_user_id) do nothing;
    result := jsonb_build_object('message', 'Member allowed. Share the site link with them; no invitation message has been sent.');
  else raise exception 'Unknown action.';
  end if;
  insert into club_private.requests(member_id, request_id, action, payload, result) values(mid, request_key, action_name, body, result);
  return result;
end $$;

create function public.club_mutate(p_action text, p_data jsonb, p_request_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return club_private.mutate(club_private.current_member(), p_action, p_data, 'web:' || p_request_id, 'web');
end $$;

-- Called only by the Edge Function with the server-side service_role key, after
-- Slack signature, timestamp, app and workspace verification.
create function public.club_slack_command(p_team_id text, p_user_id text, p_action text, p_data jsonb, p_request_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  if not exists (select 1 from club_private.challenge where slack_team_id = p_team_id) then raise exception 'Wrong Slack workspace.' using errcode = '42501'; end if;
  select id into mid from club_private.members where slack_user_id = p_user_id;
  if mid is null then raise exception 'Ask your organizer to run /spend invite @you before joining.' using errcode = '42501'; end if;
  return club_private.mutate(mid, p_action, p_data, 'slack:' || p_request_id, 'slack');
end $$;

revoke all on all functions in schema club_private from public, anon, authenticated;
revoke all on function public.club_dashboard() from public, anon;
revoke all on function public.club_mutate(text, jsonb, text) from public, anon;
revoke all on function public.club_slack_command(text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.club_dashboard() to authenticated;
grant execute on function public.club_mutate(text, jsonb, text) to authenticated;
grant execute on function public.club_slack_command(text, text, text, jsonb, text) to service_role;

insert into club_private.categories(id, name, description, position) values
('coffee', 'Coffee shop', 'Purchases at coffee shops, including tax and tips.', 1);

commit;
