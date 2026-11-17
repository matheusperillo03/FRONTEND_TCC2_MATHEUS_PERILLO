/**
 * Ponto único de entrada do modo simulado. Este módulo só é carregado por
 * import dinâmico, e só quando o build foi feito com VITE_MOCK=1
 * (ver `importarSimulado` em ./index.ts). Nada aqui pode ser importado de
 * forma estática pelo código da aplicação, para que o bundle de produção não
 * leve as fixtures nem os tokens de demonstração.
 */
export { ClienteMock } from './clienteMock';
export { CODIGO_MFA_DEMO, CONTAS_DEMO, TOKENS_DEMO } from './dadosSinteticos';
