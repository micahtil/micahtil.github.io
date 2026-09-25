# Deployment for micahtil.github.io

October Club source lives in `october-club/`. The existing portfolio source stays in `docs/`.
The root `.github/workflows/pages.yml` builds the app, inserts its output into the temporary Jekyll source at `docs/october-club/`, and publishes both sites together.
Do not use the standalone app workflow to replace the root portfolio.

App URL: https://micahtil.github.io/october-club/
Supabase project: https://emgbizytsfoqicopvxfg.supabase.co

The root workflow includes only the supplied PUBLIC Supabase URL and publishable key. These are intended for the browser. No GitHub variables are required for this configured workflow. Never put a Slack secret or Supabase secret/service-role key there.

Setup reference (database setup is one-time; do not rerun on the existing project):
1. Apply `supabase/migrations/202609240001_club.sql` once to the new project.
2. Fill and run `supabase/bootstrap.example.sql` with the Slack workspace ID and the organizer's member ID.
3. Create/install the Slack app using `slack/app-manifest.json`; its Supabase URLs are already filled.
4. Enter the Slack Client ID and Client Secret in the Supabase Slack OIDC provider settings. Follow the separate bot install / OIDC instructions in README.md.
5. Set Supabase Auth Site URL and allowed redirect URL to https://micahtil.github.io/october-club/ . For local testing also allow http://127.0.0.1:5179/ .
6. Deploy the `slack-spend` Edge Function with JWT verification off, and set SLACK_SIGNING_SECRET, SLACK_TEAM_ID and SLACK_APP_ID in Supabase.
7. In the GitHub repository's Settings > Pages, select GitHub Actions as the build source. Then push the prepared changes and check that both the portfolio and October Club load.
8. Test real sign-in, invite restrictions and Slack logging before inviting friends. The production October date gate intentionally rejects spending before October 1.

Launch status: the organizer applied the database setup and deployed the command handler; `/spend total` returned successfully in Slack. Slack OIDC is enabled. Website publication and real browser sign-in are the next checks. The live handler was deployed from a combined dashboard copy of `supabase/functions/slack-spend/index.ts` and `supabase/functions/_shared/command.js`; redeploy both source files with the CLI for future changes.
