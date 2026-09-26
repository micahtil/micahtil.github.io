// Workspace hint only; membership and workspace access are enforced by the database.
export function slackLoginOptions(href) {
  return { provider: 'slack_oidc', options: {
    redirectTo: new URL('./', href).href,
    queryParams: { team: 'T05TWBA93LL' },
  } };
}

const retryMessage = 'Slack sign-in did not finish. Return to the browser where you started and try Sign in with Slack again. If Slack opened its app, switch back to your original browser tab first.';
const callbackKeys = ['code', 'error', 'error_code', 'error_description', 'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'expires_in', 'expires_at', 'token_type'];

export function cleanAuthReturn(href) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const hasAuthHash = callbackKeys.some(key => hash.has(key));
  callbackKeys.forEach(key => url.searchParams.delete(key));
  if (hasAuthHash) {
    callbackKeys.forEach(key => hash.delete(key));
    url.hash = hash.toString();
  }
  return url.href;
}

export async function readAuthSession(auth, href) {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const returnedError = url.searchParams.get('error') || fragment.get('error');
  // Supabase handles the PKCE exchange once. Inspect its result instead of
  // exchanging the same one-time code again in a second callback handler.
  const initialized = await auth.initialize();
  if (returnedError === 'access_denied') throw new Error('Slack sign-in was cancelled or denied. Try again and allow October Club to verify your identity.');
  if (initialized.error || returnedError || url.searchParams.has('error_code') || fragment.has('error_code')) throw new Error(retryMessage);
  const { data, error } = await auth.getSession();
  if (error) throw new Error('Could not restore your sign-in. Check your connection and try again.');
  // With no verifier in this browser, the SDK intentionally ignores the code.
  // Make that incomplete return visible instead of silently showing the homepage.
  if (url.searchParams.has('code') && !data.session) throw new Error(retryMessage);
  return data.session;
}
