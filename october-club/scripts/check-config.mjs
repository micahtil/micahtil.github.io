const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) throw new Error('Set VITE_SUPABASE_URL to the hosted Supabase project URL.');
if (!key?.startsWith('sb_publishable_')) throw new Error('Use a Supabase publishable key. Never put a secret or service-role key in the frontend.');
console.log('Public app configuration is present.');
