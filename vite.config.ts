/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // VITE_MOCK é lido em tempo de build (arquivo .env ou variável de ambiente).
  // A constante __MODO_MOCK__ vira literal no código: com `false`, o import
  // dinâmico do cliente simulado é código morto e o bundle de produção não
  // carrega as fixtures nem os tokens de demonstração (ver src/api/index.ts).
  const env = loadEnv(mode, '.', 'VITE_');
  const modoMock = (env.VITE_MOCK ?? '').trim() === '1';

  return {
    plugins: [react()],
    define: { __MODO_MOCK__: JSON.stringify(modoMock) },
    server: { port: 5190, strictPort: true },
    build: {
      rollupOptions: {
        output: {
          manualChunks: { cytoscape: ['cytoscape'], react: ['react', 'react-dom'] },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      // Os testes de tela que digitam em formulários grandes (abas Alertas e Coleta) levam cerca
      // de 2 s cada no pipeline; com a máquina ocupada passam dos 5 s padrão, e o teste que
      // estoura o tempo ainda derruba o seguinte do mesmo arquivo. 20 s dá folga sem esconder
      // teste travado.
      testTimeout: 20_000,
    },
  };
});
