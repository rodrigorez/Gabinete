import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

/**
 * Edge Function: asset-manager
 * Faz upload (POST) e delete (DELETE) de assets no Supabase Storage
 * usando a service_role key que fica SERVER-SIDE nesta função.
 *
 * Parâmetro: ?path=images/foto.webp
 * Auth: Bearer <anon_key> no header Authorization
 */

const BUCKET = 'gabinete-assets';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !serviceKey) return json({ error: 'Servidor não configurado.' }, 500);

  const url  = new URL(req.url);
  const path = url.searchParams.get('path');
  if (!path) return json({ error: 'Parâmetro ?path é obrigatório.' }, 400);

  // ── Upload ────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file') as File | null;
    if (!file) return json({ error: 'Campo "file" ausente no FormData.' }, 400);

    const res = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: await file.arrayBuffer(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, string>;
      return json({ error: err.message ?? `Storage error ${res.status}` }, res.status);
    }

    return json({ url: `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}` });
  }

  // ── Delete ────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
    });

    if (!res.ok) return json({ error: `Storage error ${res.status}` }, res.status);
    return json({ ok: true });
  }

  return json({ error: 'Método não permitido.' }, 405);
});
