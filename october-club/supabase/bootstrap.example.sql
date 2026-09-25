-- Run privately in the Supabase SQL editor AFTER the migration.
-- Replace these placeholders with your Slack workspace and member IDs.
-- Find your member ID in Slack: profile > More > Copy member ID.
-- Do not commit the personalized copy to GitHub.
insert into club_private.challenge(slack_team_id) values ('T_REPLACE_ME');
insert into club_private.members(slack_user_id, display_name, role)
values ('U_REPLACE_ME', 'Organizer', 'owner');
