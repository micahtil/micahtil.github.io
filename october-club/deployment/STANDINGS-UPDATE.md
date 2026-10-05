# Enable /spend standings

This update extends the existing `/spend` command. No new Slack command, OAuth scopes, tokens or secrets are needed. Successful standings replies are shared with the channel where the command was run. Other commands, errors and processing notices remain private.

## Apply to the existing Supabase project

If `/spend standings` already works and you are updating it from private to channel-visible replies, only repeat step 2 with the latest function file. No additional SQL or Slack configuration is required.

1. Open https://supabase.com/dashboard/project/emgbizytsfoqicopvxfg/sql/new . Paste and run the entire contents of `supabase/migrations/202610050001_standings.sql`. This replaces one function; it does not recreate tables or change spending. Do not rerun the original schema or bootstrap.
2. Open **Edge Functions → slack-spend → Code** in the same project. Replace the existing dashboard function with the entire contents of `deployment/slack-spend.dashboard.ts` and deploy. Keep its existing secrets and JWT verification setting (off, because the handler verifies Slack's signature). The bundled file contains all imports and helpers needed by the dashboard editor.
3. In Slack, run `/spend standings`. Confirm the group total and member amounts match the website's coffee shop standings. `/spend total` should still return your own total and review date. `/spend help` should list the new command.

Apply the SQL before deploying the handler. If the handler is updated first, the new command reports “Unknown action” until the SQL is applied; existing commands still work.

## Output

The snapshot shows group total, each member's net spending (refunds subtracted, undone entries excluded), entry count, reviewed-through date, and rank. It includes only Coffee shop entries within the challenge dates up to today in New York. Unreviewed members remain visible but unranked. After October 31, ranking requires review through October 31. Equal totals share a rank. Large groups show the first 20 members, an explicit count of omitted members, and a link to the full website.

This reads spending without recording a review or adding purchases. It posts the overview to the whole channel where it was requested. Every request verifies the Slack signature, workspace and challenge membership using the existing checks.

## Maintaining the bundle

The editable sources are in `supabase/functions/`. After changes run `node scripts/build-slack-dashboard.mjs` to regenerate the single-file dashboard version. GitHub Pages publishing does not deploy Supabase functions or database migrations.
