// @ts-check
/// <reference path="./types.d.ts" />

/**
 * Store privado e centralizado da configuração do Gabinete Virtual.
 * Substitui window.__GABINETE_SECURE_CONFIG, eliminando exposição global.
 * Regra Pétrea 2: Módulos se comunicam via API pública, nunca por globais mutáveis.
 */

/** @type {GabineteConfig|null} */
let _config = null;

export const appState = {
    /** @param {GabineteConfig} cfg */
    setConfig: (cfg) => { _config = cfg; },

    /** @returns {GabineteConfig|null} */
    getConfig: () => _config,

    /** @returns {GabineteObject[]} */
    getObjects: () => _config?.objects ?? [],

    /**
     * @param {string} id
     * @returns {GabineteObject|null}
     */
    findObject: (id) => {
        if (!_config?.objects) return null;
        /** @param {GabineteObject[]} list @returns {GabineteObject|null} */
        const search = (list) => {
            for (const obj of list) {
                if (obj.id === id) return obj;
                if (obj.children) {
                    const found = search(obj.children);
                    if (found) return found;
                }
            }
            return null;
        };
        return search(_config.objects);
    },
};
