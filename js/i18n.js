// @ts-check
import { GABINETE_CONFIG } from './config.js';
import { EVENTS } from './events.js';

/**
 * Sistema de Internacionalização (i18n).
 * Gerencia o dicionário de idiomas e injeção de strings.
 */

class I18nHandler {
  constructor() {
    /** @type {any} */
    this.dictionary = null;
    this.currentLang = localStorage.getItem('gabinete_lang') || GABINETE_CONFIG.UI.DEFAULT_LANG;
  }

  async init() {
    try {
      const response = await fetch('assets/langs.json');
      this.dictionary = await response.json();
      this.applyTranslations();
      window.dispatchEvent(new CustomEvent(EVENTS.I18N_READY));
    } catch (error) {
      console.error('❌ Erro ao carregar i18n:', error);
    }
  }

  /**
   * Retorna a tradução para uma chave específica.
   * @param {string} key
   * @returns {string}
   */
  t(key) {
    if (!this.dictionary || !this.dictionary[this.currentLang]) return key;
    return this.dictionary[this.currentLang][key] || key;
  }

  /**
   * Altera o idioma globalmente e recarrega.
   * @param {string} lang
   */
  setLanguage(lang) {
    if (this.dictionary[lang]) {
      this.currentLang = lang;
      localStorage.setItem('gabinete_lang', lang);
      this.applyTranslations();
      window.dispatchEvent(new CustomEvent(EVENTS.I18N_CHANGED, { detail: lang }));
    }
  }

  /**
   * Percorre todos os elementos com o atributo 'data-i18n' e aplica a tradução.
   */
  applyTranslations() {
    // Para elementos DOM comuns
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const htmlEl = /** @type {HTMLElement} */ (el);
      if (key) htmlEl.innerText = this.t(key);
    });

    // Para elementos A-Frame (Textos)
    document.querySelectorAll('[data-i18n-aframe]').forEach(el => {
      const key = el.getAttribute('data-i18n-aframe');
      // @ts-ignore — setAttribute de 3 args é API do A-Frame, não do DOM padrão
      if (key) el.setAttribute('text', 'value', this.t(key));
    });
  }
}

/** Singleton exportável limpo (mata window.i18n base) */
export const i18n = new I18nHandler();
