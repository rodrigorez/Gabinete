// @ts-check

/**
 * Dicionário Imutável de Eventos do Gabinete Virtual
 * REGRA PÉTREA 12: Todas as mensagens e eventos inter-sistemas DEVEM usar estas constantes.
 * Proibido emitir ou escutar strings vazias soltas.
 */
export const EVENTS = Object.freeze({
  /** Disparado pelo Kiosk-Mode para reiniciar a sessão */
  KIOSK_RESET: 'gabinete:kiosk-reset',
  
  /** Disparadores de Pilha de UI Modal */
  UI_PUSH: 'gabinete:ui-push',
  UI_POP: 'gabinete:ui-pop',
  
  /** Eventos específicos do ambiente 3D */
  OBJ_CLICKED: 'gabinete:obj-clicked',
  HOTSPOT_CLICKED: 'gabinete:hotspot-clicked',

  /** Estado da Scene A-Frame */
  SCENE_LOADED: 'gabinete:scene-loaded',
  HARDWARE_PROFILE_CHANGED: 'gabinete:hardware-profile-changed',

  /** Transição de view na pilha de navegação */
  VIEW_CHANGED: 'view-changed',

  /** Alerta de LocalStorage próximo do limite (80%) */
  STORAGE_WARNING: 'gabinete:storage-warning',

  /** Internacionalização: dicionário carregado */
  I18N_READY: 'i18n-ready',

  /** Internacionalização: idioma alterado */
  I18N_CHANGED: 'i18n-changed',

  /** Erro de carregamento de asset 3D (GLB/GLTF) — detail: { id, src } */
  ASSET_ERROR: 'gabinete:asset-error'
});
