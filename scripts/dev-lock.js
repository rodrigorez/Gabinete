#!/usr/bin/env node
/**
 * Dev Lock — Pausa o push de sync dos totens durante desenvolvimento.
 *
 * Mecanismo: cria/deleta o ref git `refs/heads/__dev-lock__` no GitHub.
 * O sync-engine verifica este ref antes de cada githubPut.
 * Os totens continuam PUXANDO (pull) normalmente — só o push é pausado.
 *
 * Uso:
 *   npm run dev:lock    → ativa o lock
 *   npm run dev:unlock  → desativa o lock
 */

import { execSync } from 'node:child_process';

const DEV_LOCK_REF = 'refs/heads/__dev-lock__';
const action = process.argv[2];

/**
 * @param {string} cmd
 * @returns {string}
 */
function run(cmd) {
  return execSync(cmd, { stdio: 'pipe' }).toString().trim();
}

if (action === 'lock') {
  console.log('\n🔒 Ativando Dev Lock...');
  try {
    run(`git push origin HEAD:${DEV_LOCK_REF} --force`);
    console.log('✅ Dev Lock ativado!\n');
    console.log('   • Os totens pausarão o push de sync automaticamente.');
    console.log('   • Pull (leitura) continua funcionando normalmente.');
    console.log('   • Para retomar: npm run dev:unlock\n');
  } catch (/** @type {any} */ e) {
    console.error('❌ Falha ao ativar lock:', e.stderr?.toString() || e.message);
    process.exit(1);
  }

} else if (action === 'unlock') {
  console.log('\n🔓 Removendo Dev Lock...');
  try {
    run(`git push origin --delete ${DEV_LOCK_REF}`);
    console.log('✅ Dev Lock removido! Sync dos totens retomado normalmente.\n');
  } catch (/** @type {any} */ e) {
    const msg = e.stderr?.toString() || e.message || '';
    if (
      msg.includes('remote ref does not exist') ||
      msg.includes("couldn't find remote ref") ||
      msg.includes('does not match')
    ) {
      console.log('ℹ️  Dev Lock já estava inativo.\n');
    } else {
      console.error('❌ Falha ao remover lock:', msg);
      process.exit(1);
    }
  }

} else {
  console.log(`
Gabinete Dev Lock
─────────────────────────────────────────────────────
Pausa o push de sync dos totens enquanto você trabalha.

  npm run dev:lock    → Ativa o lock (totens param de fazer push)
  npm run dev:unlock  → Remove o lock (sync retoma normalmente)

Enquanto bloqueado:
  ✓ Totens continuam LENDO (pull) atualizações
  ✓ Totens mostram badge "🔒 Modo Dev" no painel admin
  ✗ Totens NÃO fazem push de alterações de config

Sem configuração extra — usa suas credenciais git locais.
─────────────────────────────────────────────────────
`);
}
