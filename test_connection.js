const fs = require('fs');

async function testConnections() {
  console.log('Testando conexões...');

  const SUPABASE_URL = "https://eipcmlmlnbdzhlvtxmza.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpcGNtbG1sbmJkemhsdnR4bXphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTU3NTYsImV4cCI6MjA5MzEzMTc1Nn0.WJzCFd4kdPMnRF93-DzZVEagMZuhFQllQ6updf1xbx4";

  // Teste 1: Supabase Health
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'GET',
      headers: { 'apikey': SUPABASE_KEY }
    });
    console.log(`Supabase REST Base: HTTP ${res.status}`);
  } catch (e) {
    console.log('Supabase REST Erro:', e.message);
  }

  // Teste 2: Supabase Edge Function (asset-manager)
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/asset-manager?path=test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY
      }
    });
    console.log(`Supabase Edge Function (asset-manager): HTTP ${res.status}`);
    const body = await res.text();
    console.log(`Resposta: ${body}`);
  } catch (e) {
    console.log('Supabase Edge Function Erro:', e.message);
  }
}

testConnections();
