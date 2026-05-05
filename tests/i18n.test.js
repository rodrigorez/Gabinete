import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { i18n } from '../js/i18n.js';
import { EVENTS } from '../js/events.js';

describe('I18nHandler', () => {
  beforeEach(() => {
    // Reset state before each test
    i18n.dictionary = null;
    i18n.currentLang = 'pt-br';
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deve inicializar carregando langs.json e disparando evento', async () => {
    const mockDict = { 'pt-br': { 'TEST_KEY': 'Teste' } };
    fetch.mockResolvedValueOnce({
      json: async () => mockDict
    });

    const spyDispatch = vi.spyOn(window, 'dispatchEvent');
    
    await i18n.init();

    expect(fetch).toHaveBeenCalledWith('assets/langs.json');
    expect(i18n.dictionary).toEqual(mockDict);
    expect(spyDispatch).toHaveBeenCalled();
    const eventArg = spyDispatch.mock.calls[0][0];
    expect(eventArg.type).toBe(EVENTS.I18N_READY);
  });

  it('deve falhar de forma gracefully se fetch falhar', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    await i18n.init();
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Erro'), expect.any(Error));
    expect(i18n.dictionary).toBeNull();
  });

  it('deve traduzir chave corretamente', () => {
    i18n.dictionary = { 'pt-br': { 'HELLO': 'Olá' } };
    i18n.currentLang = 'pt-br';
    
    expect(i18n.t('HELLO')).toBe('Olá');
  });

  it('deve retornar a chave se não houver tradução', () => {
    i18n.dictionary = { 'pt-br': { 'HELLO': 'Olá' } };
    i18n.currentLang = 'pt-br';
    
    expect(i18n.t('UNKNOWN')).toBe('UNKNOWN');
  });

  it('deve retornar a chave se dicionário for nulo', () => {
    i18n.dictionary = null;
    expect(i18n.t('HELLO')).toBe('HELLO');
  });

  it('deve alterar o idioma', () => {
    i18n.dictionary = { 
      'pt-br': { 'HELLO': 'Olá' },
      'en': { 'HELLO': 'Hello' }
    };
    
    const spyDispatch = vi.spyOn(window, 'dispatchEvent');
    
    i18n.setLanguage('en');
    
    expect(i18n.currentLang).toBe('en');
    expect(localStorage.setItem).toHaveBeenCalledWith('gabinete_lang', 'en');
    expect(spyDispatch).toHaveBeenCalled();
    expect(spyDispatch.mock.calls[0][0].type).toBe(EVENTS.I18N_CHANGED);
  });

  it('não deve alterar o idioma se ele não existir no dicionário', () => {
    i18n.dictionary = { 'pt-br': { 'HELLO': 'Olá' } };
    i18n.currentLang = 'pt-br';
    
    i18n.setLanguage('es'); // Não existe
    
    expect(i18n.currentLang).toBe('pt-br');
  });
});
