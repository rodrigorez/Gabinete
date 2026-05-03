import js from "@eslint/js";

export default [
    js.configs.recommended,
    {
        ignores: ["node_modules/**", "dist/**", "assets/**", "js/vendor/**", "sw.js", "vite.config.js", "vitest.config.js"]
    },
    {
        files: ["js/**/*.js", "tests/**/*.js", "scripts/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                // Browser globals
                window: "readonly",
                document: "readonly",
                navigator: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                requestAnimationFrame: "readonly",
                cancelAnimationFrame: "readonly",
                fetch: "readonly",
                performance: "readonly",
                localStorage: "readonly",
                sessionStorage: "readonly",
                CustomEvent: "readonly",
                Event: "readonly",
                KeyboardEvent: "readonly",
                TouchEvent: "readonly",
                URLSearchParams: "readonly",
                FormData: "readonly",
                Blob: "readonly",
                File: "readonly",
                FileReader: "readonly",
                crypto: "readonly",
                
                // Browser globals missing in previous config
                TextEncoder: "readonly",
                TextDecoder: "readonly",
                URL: "readonly",
                Image: "readonly",
                location: "readonly",
                btoa: "readonly",
                atob: "readonly",
                AbortController: "readonly",
                caches: "readonly",
                Response: "readonly",
                Request: "readonly",
                confirm: "readonly",

                // NodeJS / Build tools globals
                process: "readonly",
                __dirname: "readonly",
                
                // Test globals
                describe: "readonly",
                it: "readonly",
                expect: "readonly",
                vi: "readonly",
                beforeEach: "readonly",
                global: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
            "no-undef": "error",
            "no-constant-condition": "warn"
        }
    }
];
