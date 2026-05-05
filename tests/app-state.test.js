import { describe, it, expect, beforeEach } from 'vitest';
import { appState } from '../js/app-state.js';

describe('App State', () => {
  beforeEach(() => {
    appState.setConfig(null);
  });

  it('deve armazenar e recuperar a configuração corretamente', () => {
    const mockConfig = { settings: { kioskTimeoutMs: 1000 }, objects: [] };
    appState.setConfig(mockConfig);
    expect(appState.getConfig()).toEqual(mockConfig);
  });

  it('deve retornar a lista de objetos', () => {
    const mockConfig = { objects: [{ id: 'obj1' }, { id: 'obj2' }] };
    appState.setConfig(mockConfig);
    expect(appState.getObjects().length).toBe(2);
  });

  it('deve retornar array vazio se não houver objetos na config', () => {
    appState.setConfig({});
    expect(appState.getObjects()).toEqual([]);
  });

  it('deve encontrar um objeto pelo id no nível raiz', () => {
    const mockConfig = { objects: [{ id: 'obj1' }, { id: 'obj2' }] };
    appState.setConfig(mockConfig);
    const obj = appState.findObject('obj2');
    expect(obj).not.toBeNull();
    expect(obj.id).toBe('obj2');
  });

  it('deve encontrar um objeto aninhado em children', () => {
    const mockConfig = {
      objects: [
        { id: 'obj1', children: [{ id: 'child1' }] }
      ]
    };
    appState.setConfig(mockConfig);
    const obj = appState.findObject('child1');
    expect(obj).not.toBeNull();
    expect(obj.id).toBe('child1');
  });

  it('deve retornar null ao buscar objeto inexistente', () => {
    appState.setConfig({ objects: [{ id: 'obj1' }] });
    expect(appState.findObject('inexistente')).toBeNull();
  });

  it('deve retornar null se buscar sem configuração setada', () => {
    expect(appState.findObject('obj1')).toBeNull();
  });
});
