begin;

-- Extend the existing server-only entry point. Every action, including this
-- read-only snapshot, still requires the configured workspace and membership.
create or replace function public.club_slack_command(p_team_id text, p_user_id text, p_action text, p_data jsonb, p_request_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  if not exists (select 1 from club_private.challenge where slack_team_id = p_team_id) then raise exception 'Wrong Slack workspace.' using errcode = '42501'; end if;
  select id into mid from club_private.members where slack_user_id = p_user_id;
  if mid is null then raise exception 'Ask your organizer to run /spend invite @you before joining.' using errcode = '42501'; end if;
  if p_action = 'standings' then
    return (
      select jsonb_build_object(
        'today', club_private.today(), 'ends_on', c.ends_on,
        'members', coalesce((
          select jsonb_agg(to_jsonb(t) order by t.total_cents, t.display_name, t.id)
          from (
            select m.id, m.display_name, m.reviewed_through,
              coalesce(sum(e.amount_cents), 0) as total_cents, count(e.id) as entry_count
            from club_private.members m
            left join club_private.entries e on e.member_id = m.id
              and e.voided_at is null and e.category_id = 'coffee'
              and e.spent_on between c.starts_on and least(club_private.today(), c.ends_on)
            group by m.id
          ) t
        ), '[]'::jsonb)
      ) from club_private.challenge c where c.slack_team_id = p_team_id
    );
  end if;
  return club_private.mutate(mid, p_action, p_data, 'slack:' || p_request_id, 'slack');
end $$;

revoke all on function public.club_slack_command(text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.club_slack_command(text, text, text, jsonb, text) to service_role;

commit;
