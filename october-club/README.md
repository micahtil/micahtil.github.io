# October Club

A private group spending race: cumulative dollars per member over time, with purchases entered through `/spend` in Slack or a phone-friendly website. Lowest reported spending leads. The single category is Coffee shop: purchases at coffee shops, including tax and tips. Entries automatically use this category; personal budgets are optional and never affect ranking.

## Current status

The frontend, database migration, Slack command handler, deployment workflow and local automated tests are implemented. With no environment configuration, the site offers an explicitly labeled, in-memory preview with fictional people and amounts. Preview changes reset on reload. It does **not** accept or persist real group data.

The organizer has configured Supabase and installed the Slack app; a live `/spend total` command succeeded. The Slack sign-in provider is enabled. Browser sign-in and full spending-entry tests remain part of the launch checks. See `DEPLOYMENT.md` for this repository’s hosting configuration; the setup sections below also document a fresh installation.

## Architecture

- **GitHub Pages:** static HTML/CSS/JavaScript; no member financial data is included in the repository or build.
- **Supabase Auth:** Sign in with Slack (OIDC). No separate email-delivery service is needed.
- **Supabase PostgreSQL:** member list, dated entries, optional budgets, review dates and request deduplication.
- **Supabase Edge Function:** verifies Slack HMAC signatures, timestamps, app ID and workspace ID; acknowledges commands promptly, then processes the result and responds privately.

The site shell is publicly accessible. Challenge data requires an authenticated, explicitly invited member from the configured Slack workspace. A private GitHub repository does not make the Pages site private. GitHub Free supports Pages from public repositories; private-repository Pages requires an eligible paid GitHub plan. The same static build can move to a different host without changing the backend.

## Commands

| Command | Effect |
|---|---|
| `/spend 12.50` | Add $12.50 for today in the challenge timezone |
| `/spend 5.50 2026-10-05` | Add a backdated purchase |
| `/spend refund 5` | Subtract a refund |
| `/spend undo` | Undo the most recently added active entry of your own |
| `/spend undo ENTRY_UUID` | Undo one specific entry of your own |
| `/spend total` | Show your October total |
| `/spend done 2026-10-14` | Confirm all spending through that date is logged |
| `/spend invite @person` | Organizer only: allow a Slack member into the challenge |
| `/spend help` | Show command help |

Amounts are increments, not cumulative balances. Use the purchase date, not the date you remembered to enter it. Default date after October is October 31 during reconciliation. Commands return private confirmations; the app displays member totals and dated entries to the whole challenge. No Slack channel-history or financial-account permissions are requested. Invitation commands add an allowlist entry and do not send a message to the person.

Refunds should refer to purchases counted in the challenge. They are negative ledger entries and can produce a negative category/day balance when backdated; the chart handles negative values. This is an honor-system competition, not bank reconciliation.

## Run locally

Requires Node 24 and pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

The preview listens on `http://127.0.0.1:5178/`. A phone on another network cannot open this local URL. For local testing against a real backend, copy `.env.example` to `.env` and set the project URL and **publishable** key. Never use a secret/service-role key in a variable beginning with `VITE_`.

## Connect the real club

### 1. Create the backend

Create a Supabase project in your own account. Keep its database password private. Run `supabase/migrations/202609240001_club.sql` in the SQL editor (or apply it with the Supabase CLI).

Run a personalized copy of `supabase/bootstrap.example.sql` privately with your Slack workspace ID and your Slack member ID. The placeholders intentionally fail validation until replaced. Your member ID is available in Slack under profile → More → Copy member ID. The workspace ID appears in Slack URLs such as `app.slack.com/client/T…`.

The supplied settings use October 1–31, 2026, USD and America/New_York. Edits close at midnight at the beginning of November 3 in that timezone. The only category is Coffee shop; no category argument is needed in Slack. If changing dates or currency, update the UI wording as well; this first version is specifically for October 2026 and USD.

### 2. Create your Slack app

In [Slack's app dashboard](https://api.slack.com/apps), choose **Create New App → From a manifest**. Use `slack/app-manifest.json`, replacing both project-ref placeholders with your Supabase project reference. Install the app in your workspace. If `/spend` already exists in your workspace, choose another command and update the manifest, handler command check, help and interface examples consistently.

The manifest installs only the bot `commands` scope. After installing the command app, configure `openid`, `profile` and `email` under User Token Scopes for Sign in with Slack. Supabase requests those through a **separate OIDC authorization flow**. Slack does not permit mixing OIDC and ordinary installation scopes in one OAuth request. If a subsequent bot reinstall reports a scope conflict, temporarily remove the three OIDC User Token Scopes, reinstall the bot with `commands` only, then restore the sign-in configuration. Do not add channel or message history access.

In Supabase Authentication → Sign In / Providers, enable **Slack (OIDC)** with the Slack app's Client ID and Client Secret. Enter the secret directly into Supabase; do not commit it. The Slack app's redirect URI must be `https://PROJECT_REF.supabase.co/auth/v1/callback`.

Disable unneeded Auth providers, including email/password and anonymous sign-in. Leave account creation enabled for Slack sign-ins; the database independently denies access to nonmembers and other workspaces.

### 3. Deploy the command handler

Use the Supabase CLI for your project:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy slack-spend --no-verify-jwt
```

If you applied the migration in the SQL editor, do not run `db push` until you have aligned the migration history; alternatively use only the SQL editor for the migration and deploy the function separately.

Configure these **Edge Function secrets** directly in Supabase:

- `SLACK_SIGNING_SECRET`: Slack app → Basic Information → App Credentials.
- `SLACK_TEAM_ID`: the same workspace ID used in the bootstrap SQL.
- `SLACK_APP_ID`: Slack app → Basic Information → App ID.

Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions. The latter must remain server-side. `verify_jwt = false` is necessary because Slack sends its own signed request, not a Supabase JWT; the handler rejects requests with missing or invalid Slack HMACs, timestamps outside five minutes, or mismatched app/workspace/command IDs.

Point `/spend` at `https://PROJECT_REF.supabase.co/functions/v1/slack-spend` (already present in the manifest after replacement). The function uses `EdgeRuntime.waitUntil` and the signed Slack response URL to avoid the three-second acknowledgment timeout. A delivery failure can occur after an entry commits: the user should inspect `/spend total` or the site before issuing a new command. Replays of the same Slack trigger ID are deduplicated transactionally; a deliberately reissued command is a new purchase.

### 4. Publish the website

Create a GitHub repository containing **only this `october-club` directory** as its root. Do not publish the parent Coffee folder or any transaction exports.

In repository Settings → Secrets and variables → Actions → Variables, set:

- `VITE_SUPABASE_URL`: `https://PROJECT_REF.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the `sb_publishable_…` key from Supabase's API key settings.

Both values are intentionally public configuration. The workflow rejects secret/service-role keys. In Settings → Pages choose **GitHub Actions**, then push to `main` or run the included deployment workflow.

Set the Supabase Auth Site URL to the final HTTPS Pages URL, including the repository subpath and trailing slash: `https://OWNER.github.io/REPO/`. Add that exact URL to allowed Auth redirect URLs. For development, also allow `http://127.0.0.1:5178/`. Remove development callbacks when no longer needed. Enable HTTPS for any custom domain.

Vite uses relative asset paths, so repository subpaths work. There are no client-side pathname routes requiring a Pages fallback. Sign-in uses PKCE and returns to the root page.

### 5. Launch check

Before collecting real spending, test with two invited members and a third uninvited account:

1. Sign in with Slack on desktop and phone. Only invited members from your workspace can read data.
2. Add a dated purchase in the website and via Slack. Confirm exact dollars and dates on both clients.
3. Verify automatic Coffee shop categorization, refunds, a backdated purchase, undo, and a review confirmation. A correction to a reviewed period must invalidate the review.
4. Confirm members cannot undo other people's entries or invite anyone unless they are the organizer.
5. Reload and sign out/in; the real ledger must persist. The race refreshes every 30 seconds while visible, with a manual refresh control.
6. Confirm the browser network responses contain no auth secrets or service-role key. Group spending is intentionally shared; Slack and auth metadata must not be exposed beyond the selected profile fields.
7. Keep test purchases in a separate test project or clear named test records privately before the challenge starts. The production date gate intentionally rejects spending before October 1.

## Privacy, retention and limits

All browser-accessible tables are isolated in a private schema with Row Level Security enabled and no direct client table privileges. Public RPC functions identify the caller using provider-owned Slack identities and enforce membership/ownership. The Slack-only RPC is callable only by the backend service role. The service operator and hosting provider can access data; this is not end-to-end encryption.

The app records amounts, categories, dates, member names/Slack IDs, and request IDs used for deduplication. It does not read Slack history or connect to banks. Supabase Auth holds the Slack profile/email needed for sign-in. Entries can be voided (undo) but remain in the ledger audit trail. Members can export their own records. The organizer can remove a member and their associated records using the Supabase SQL editor; account deletion also requires deleting the Supabase Auth user. There is no automatic retention schedule yet. Agree on a deletion date after the challenge and delete data and backups according to your provider's retention settings.

Free Supabase projects can pause after inactivity; review current pricing/limits before launch. GitHub Pages has no backend, so it cannot run the Slack handler itself. No real credentials, account configuration, remote installation, or production deployment is included in the local implementation.

## Verification performed locally

`pnpm test` runs arithmetic/command/HMAC tests and executes the actual database migration/functions in an embedded PostgreSQL engine (PGlite), including database role permissions, wrong-workspace rejection, ownership, idempotency, refunds and deadlines. It does not simulate Supabase Auth's hosted OIDC exchange or Slack's network delivery. Those require the launch check above.

Official references: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Supabase Slack sign-in](https://supabase.com/docs/guides/auth/social-login/auth-slack), [Slack request verification](https://docs.slack.dev/authentication/verifying-requests-from-slack/), [Slack command acknowledgments](https://docs.slack.dev/interactivity/implementing-slash-commands/), [Supabase background tasks](https://supabase.com/docs/guides/functions/background-tasks).
