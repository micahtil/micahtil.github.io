import { createClient } from 'npm:@supabase/supabase-js@2.117.1';
import { HELP, parseCommand, verifySlack, safeResponseUrl } from '../_shared/command.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const reply = (text: string) => ({ response_type: 'ephemeral', text, mrkdwn: false, replace_original: false });

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return new Response('Unsupported content type', { status: 415 });
  const signingSecret = Deno.env.get('SLACK_SIGNING_SECRET');
  const teamId = Deno.env.get('SLACK_TEAM_ID');
  const appId = Deno.env.get('SLACK_APP_ID');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!signingSecret || !teamId || !appId || !serviceKey || !supabaseUrl) return json({ error: 'App configuration is incomplete.' }, 503);
  if (Number(request.headers.get('content-length') || 0) > 16000) return new Response('Request too large', { status: 413 });
  const body = await request.text();
  if (body.length > 16000) return new Response('Request too large', { status: 413 });
  if (!await verifySlack(body, request.headers.get('x-slack-request-timestamp'), request.headers.get('x-slack-signature'), signingSecret)) return new Response('Invalid Slack signature', { status: 401 });
  const params = new URLSearchParams(body);
  if (params.get('team_id') !== teamId || params.get('api_app_id') !== appId || params.get('command') !== '/spend') return new Response('Wrong workspace or app', { status: 403 });
  const responseUrl = params.get('response_url') || '';
  const triggerId = params.get('trigger_id');
  const userId = params.get('user_id');
  if (!safeResponseUrl(responseUrl) || !triggerId || triggerId.length > 160 || !/^[UW][A-Z0-9]+$/.test(userId || '')) return json(reply('Slack did not supply a valid request. Please try again.'));
  let command;
  try { command = parseCommand(params.get('text') || ''); } catch (error) { return json(reply(error instanceof Error ? error.message : HELP)); }
  if (command.action === 'help') return json(reply(HELP));
  const { action, ...payload } = command;

  // Acknowledge immediately; Slack allows only 3 seconds. Send the actual outcome
  // to its signed, validated private response URL after the database commits.
  const task = (async () => {
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let text: string;
    try {
      const { data, error } = await supabase.rpc('club_slack_command', { p_team_id: teamId, p_user_id: userId, p_action: action, p_data: payload, p_request_id: triggerId });
      text = error ? error.message : data.message;
    } catch { text = 'I could not confirm the result. Check /spend total or the website before resubmitting, to avoid a duplicate.'; }
    try {
      const response = await fetch(responseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reply(text)), signal: AbortSignal.timeout(10000) });
      if (!response.ok) console.error('Slack confirmation could not be delivered:', response.status);
    } catch { console.error('Slack confirmation delivery failed; spending may already be recorded.'); }
  })();
  EdgeRuntime.waitUntil(task);
  return json(reply('Processing your command… Your confirmation will appear here shortly.'));
});
