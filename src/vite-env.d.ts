/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Constante de build definida em vite.config.ts: `true` só quando
 * VITE_MOCK=1. Com `false`, o cliente simulado fica fora do bundle.
 */
declare const __MODO_MOCK__: boolean;
