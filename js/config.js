// @ts-check

/**
 * Configurações globais do sistema Gabinete Virtual.
 * Segue a Regra Pétrea 1: Zero Magic Numbers.
 */
export const GABINETE_CONFIG = {
  // Configurações do Quiosque
  KIOSK: {
    TIMEOUT_MS: 300000,                          // 5 minutos de inatividade
    ADMIN_GESTO_DIM: { width: '15vw', height: '15vh' },
    LOG_KEY: 'gabinete_interacoes_v1',
    ADMIN_PARAM: 'admin',
    ADMIN_PIN: '',                                // Carregado via secrets-loader.js (secrets.json)
    ADMIN_PIN_ATTEMPTS: 3,                        // Tentativas antes de bloquear
    ADMIN_PIN_LOCKOUT_MS: 30000,                  // 30s de bloqueio após tentativas esgotadas

    // ── Segurança de credenciais ──────────────────────────────
    // Tempo até limpar credenciais da memória por inatividade.
    // Altere aqui para ajustar. Não está exposto na interface.
    SECRETS_TIMEOUT_MS: 30 * 60 * 1000           // 30 minutos (padrão)
  },

  // Configurações de Hardware / Adaptive Quality
  HARDWARE: {
    LOW_PRECISION_FPS: 30,                       // FPS mínimo antes de reduzir DPR
    ADAPTIVE_QUALITY_MIN_DPI: 0.75,              // DPR mínimo permitido
    FPS_SAMPLE_INTERVAL_MS: 5000,                // Janela de amostragem do FPS monitor
    FPS_STRIKE_LIMIT: 2                          // Amostras ruins consecutivas antes de agir
  },

  // UI e i18n
  UI: {
    DEFAULT_LANG: 'pt-br'
  }
};

/**
 * Injeta `_lastModified` no config com o timestamp atual.
 * Centraliza todos os pontos de escrita — evita duplicação entre
 * curadoria-app.js, dev-editor.js e sync-engine.js.
 *
 * @template {object} T
 * @param {T} cfg - O objeto de configuração a ser marcado.
 * @returns {T} O mesmo objeto (mutado), com _lastModified atualizado.
 */
export function stampConfig(cfg) {
  /** @type {any} */ (cfg)._lastModified = new Date().toISOString();
  return cfg;
}
