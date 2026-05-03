import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

/**
 * Edge Function: github-sync
 * Faz push de um arquivo para o GitHub usando o GITHUB_TOKEN server-side.
 *
 * Body: { path: string, content: string, message?: string, sha?: string }
 * Auth: Bearer <anon_key> no header Authorization
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST')    return json({ error: 'Método não permitido.' }, 405);

  const githubToken = Deno.env.get('GITHUB_TOKEN') ?? '';
  const githubRepo  = Deno.env.get('GITHUB_REPO')  ?? '';

  if (!githubToken || !githubRepo) return json({ error: 'GitHub não configurado no servidor.' }, 500);

  const { path, content, message, sha } = await req.json() as {
    path: string; content: string; message?: string; sha?: string;
  };

  if (!path || !content) return json({ error: 'path e content são obrigatórios.' }, 400);

  const body: Record<string, string> = {
    message: message ?? 'chore: sync config',
    content: btoa(unescape(encodeURIComponent(content))),
  };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) return json({ error: data.message ?? `GitHub error ${res.status}` }, res.status);

  return json({ ok: true, sha: (data.content as Record<string, string>)?.sha });
});
