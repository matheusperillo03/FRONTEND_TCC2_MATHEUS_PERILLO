import { describe, expect, it } from 'vitest';
import { extrairDetalhe } from './clienteHttp';
import { ErroApi, mensagemDeErro } from './erros';
import { criarCliente, lerConfiguracao, ClienteHttp } from './index';

describe('mensagens de erro do back-end', () => {
  it('justificativa recusada (caracteres de controle) vira mensagem clara, com o que fazer', () => {
    const m = mensagemDeErro(new ErroApi(422, '/casos', 'Justificativa contém caracteres de controle.'));
    expect(m).toContain('Requisição recusada pelo servidor (422)');
    expect(m).toContain('Justificativa contém caracteres de controle.');
    expect(m).toContain('Corrija a justificativa no topo da página');
  });

  it('corpo grande demais (413) explica o limite', () => {
    const m = mensagemDeErro(new ErroApi(413, '/casos/1/coletas', 'corpo da requisição grande demais'));
    expect(m).toContain('recusada por tamanho (413)');
    expect(m).toContain('Reduza o texto dos campos');
  });

  it('413 do nginx (página HTML) não despeja HTML na tela', async () => {
    const r = new Response('<html><head><title>413 Request Entity Too Large</title></head></html>', { status: 413 });
    await expect(extrairDetalhe(r)).resolves.toBe('corpo da requisição grande demais');
  });

  it('erros de validação do FastAPI viram "campo: mensagem"', async () => {
    const corpo = { detail: [{ loc: ['body', 'titulo'], msg: 'String should have at most 200 characters', type: 'string_too_long' }] };
    const r = new Response(JSON.stringify(corpo), { status: 422 });
    await expect(extrairDetalhe(r)).resolves.toBe('titulo: String should have at most 200 characters');
  });
});

describe('modo simulado fora do build', () => {
  it('sem VITE_MOCK=1 a configuração é de cliente HTTP real', () => {
    const config = lerConfiguracao({ VITE_MOCK: 'true', VITE_API_URL: '/api' } as unknown as ImportMetaEnv);
    expect(config).toEqual({ modoMock: false, baseUrl: '/api' });
    const cliente = criarCliente({ obterToken: () => '', obterJustificativa: () => '' }, config);
    expect(cliente).toBeInstanceOf(ClienteHttp);
  });

  it('pedir o simulado num build sem ele falha com mensagem clara, sem carregar fixtures', async () => {
    const cliente = criarCliente({ obterToken: () => 'x', obterJustificativa: () => 'y' }, { modoMock: true, baseUrl: '/api' });
    await expect(cliente.me()).rejects.toThrow(/modo simulado não faz parte deste build/);
  });
});
