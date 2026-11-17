import { describe, expect, it, vi } from 'vitest';
import { ClienteHttp } from './clienteHttp';
import { ErroApi, ErroJustificativa } from './erros';
import type { NovaDecisaoJudicial } from './tipos';

const DETALHE_DESLIGADO = 'O módulo de importação sob ordem judicial está desligado neste servidor.';

function criar(opcoes: { justificativa?: string; corpo?: unknown; status?: number } = {}) {
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(JSON.stringify(opcoes.corpo ?? {}), { status: opcoes.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  });
  const cliente = new ClienteHttp({
    baseUrl: 'http://api.teste:8000',
    obterToken: () => 'tok-123',
    obterJustificativa: () => opcoes.justificativa ?? 'IP 0001/2026 — afastamento de sigilo',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const chamada = (i = 0) => ({ url: String(fetchImpl.mock.calls[i][0]), init: fetchImpl.mock.calls[i][1] as RequestInit });
  const cabecalhos = (i = 0) => chamada(i).init.headers as Record<string, string>;
  return { cliente, fetchImpl, chamada, cabecalhos };
}

// Decisão fictícia, no formato do contrato da API.
const DECISAO: NovaDecisaoJudicial = {
  numero_processo: '0000000-00.2026.8.07.0001',
  numero_decisao: 'Decisão ID 123456',
  juizo: '1ª Vara Criminal de Exemplópolis',
  data_decisao: '2026-10-01',
  periodo_inicio: '2026-01-01',
  periodo_fim: '2026-06-30',
  contas: [{ banco: '999', agencia: '00001', conta: '123456' }],
  investigados: ['90000001000100'],
  descricao_escopo: 'Afastamento do sigilo bancário das contas da empresa sintética ALFA',
};

describe('RF10: ClienteHttp com o módulo de importação sob ordem judicial desligado (padrão do servidor)', () => {
  it('GET /importacao-judicial/estado leva só o token (sem X-Justificativa) e devolve ativa: false', async () => {
    const estado = { ativa: false, perfis_autorizados: ['delegado'], leiaute: 'Instrução Normativa BCB nº 636/2025, Anexo I', arquivos: ['AGENCIAS', 'CONTAS', 'TITULARES', 'EXTRATO', 'ORIGEM_DESTINO'], origens: ['simba', 'oficio', 'midia'], somente_sintetico: true };
    const { cliente, chamada, cabecalhos } = criar({ corpo: estado });
    await expect(cliente.estadoImportacaoJudicial()).resolves.toEqual(estado);
    expect(chamada().url).toBe('http://api.teste:8000/importacao-judicial/estado');
    expect(chamada().init.method).toBe('GET');
    expect(cabecalhos()['Authorization']).toBe('Bearer tok-123');
    expect(cabecalhos()['X-Justificativa']).toBeUndefined();
    // Não depende de justificativa: a tela do caso consulta o estado antes de qualquer outra coisa.
    await expect(criar({ corpo: estado, justificativa: '' }).cliente.estadoImportacaoJudicial()).resolves.toMatchObject({ ativa: false });
  });

  it('com o módulo desligado, as rotas do caso respondem 404 e o cliente devolve o motivo do servidor', async () => {
    const { cliente } = criar({ status: 404, corpo: { detail: DETALHE_DESLIGADO } });
    const chamadas = [
      () => cliente.listarDecisoesJudiciais('c1'),
      () => cliente.registrarDecisaoJudicial('c1', DECISAO),
      () => cliente.importarSobOrdemJudicial('c1', 'd1', { diretorio: 'caso-sintetico', origem: 'simba' }),
      () => cliente.listarImportacoesJudiciais('c1'),
      () => cliente.listarRegistrosJudiciais('c1'),
    ];
    for (const chamar of chamadas) {
      const erro = await chamar().catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(ErroApi);
      expect(erro).toMatchObject({ status: 404 });
      expect((erro as ErroApi).message).toContain(DETALHE_DESLIGADO);
    }
  });
});

describe('RF10 e RNF02: ClienteHttp — rotas, corpo e justificativa da importação sob ordem judicial', () => {
  it('RNF02: nenhuma rota do caso sai sem justificativa, nem as de leitura', async () => {
    const { cliente, fetchImpl } = criar({ justificativa: '  ' });
    await expect(cliente.listarDecisoesJudiciais('c1')).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(cliente.registrarDecisaoJudicial('c1', DECISAO)).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(cliente.importarSobOrdemJudicial('c1', 'd1', { diretorio: 'caso-sintetico', origem: 'simba' })).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(cliente.listarImportacoesJudiciais('c1')).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(cliente.listarRegistrosJudiciais('c1')).rejects.toBeInstanceOf(ErroJustificativa);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('decisões: POST com o corpo do contrato e GET da lista, ambos com Authorization e X-Justificativa', async () => {
    const { cliente, chamada, cabecalhos } = criar({ corpo: [] });
    await cliente.registrarDecisaoJudicial('caso 1', DECISAO);
    await cliente.listarDecisoesJudiciais('caso 1');
    expect(chamada(0).url).toBe('http://api.teste:8000/casos/caso%201/importacao-judicial/decisoes');
    expect(chamada(0).init.method).toBe('POST');
    expect(JSON.parse(String(chamada(0).init.body))).toEqual(DECISAO);
    expect(chamada(1).url).toBe('http://api.teste:8000/casos/caso%201/importacao-judicial/decisoes');
    expect(chamada(1).init.method).toBe('GET');
    expect(chamada(1).init.body).toBeUndefined();
    for (const i of [0, 1]) {
      expect(cabecalhos(i)['Authorization']).toBe('Bearer tok-123');
      expect(decodeURIComponent(cabecalhos(i)['X-Justificativa'])).toBe('IP 0001/2026 — afastamento de sigilo');
    }
  });

  it('importação: POST sob a decisão escolhida, com diretório, origem e descrição; GET das importações', async () => {
    const { cliente, chamada, cabecalhos } = criar({ corpo: [] });
    await cliente.importarSobOrdemJudicial('c1', 'dj/7', { diretorio: 'caso-sintetico', origem: 'midia', descricao_origem: 'Mídia entregue pelo banco sintético' });
    await cliente.importarSobOrdemJudicial('c1', 'dj-8', { diretorio: 'caso-sintetico', origem: 'simba' });
    await cliente.listarImportacoesJudiciais('c1');
    expect(chamada(0).url).toBe('http://api.teste:8000/casos/c1/importacao-judicial/decisoes/dj%2F7/importacoes');
    expect(chamada(0).init.method).toBe('POST');
    expect(JSON.parse(String(chamada(0).init.body))).toEqual({ diretorio: 'caso-sintetico', origem: 'midia', descricao_origem: 'Mídia entregue pelo banco sintético' });
    expect(JSON.parse(String(chamada(1).init.body))).toEqual({ diretorio: 'caso-sintetico', origem: 'simba' });
    expect(chamada(2).url).toBe('http://api.teste:8000/casos/c1/importacao-judicial/importacoes');
    expect(chamada(2).init.method).toBe('GET');
    for (const i of [0, 1, 2]) expect(cabecalhos(i)['X-Justificativa']).toBeDefined();
  });

  it('registros: a query leva decisao_id, tipo, quarentena (true ou false), limite e deslocamento; sem filtro, nada', async () => {
    const pagina = { total: 0, itens: [] };
    const { cliente, chamada, cabecalhos } = criar({ corpo: pagina });
    await expect(cliente.listarRegistrosJudiciais('c1')).resolves.toEqual(pagina);
    await cliente.listarRegistrosJudiciais('c1', { decisao_id: 'dj-1', tipo: 'ORIGEM_DESTINO', quarentena: true, limite: 200, deslocamento: 50 });
    await cliente.listarRegistrosJudiciais('c1', { quarentena: false, deslocamento: 0 });
    expect(chamada(0).url).toBe('http://api.teste:8000/casos/c1/importacao-judicial/registros');
    expect(chamada(1).url).toBe('http://api.teste:8000/casos/c1/importacao-judicial/registros?decisao_id=dj-1&tipo=ORIGEM_DESTINO&quarentena=true&limite=200&deslocamento=50');
    expect(chamada(2).url).toBe('http://api.teste:8000/casos/c1/importacao-judicial/registros?quarentena=false&deslocamento=0');
    expect(cabecalhos(2)['X-Justificativa']).toBeDefined();
  });

  it('403 (perfil não autorizado) e 422 (pasta sem o marcador SINTETICO) viram ErroApi com o motivo', async () => {
    const proibido = criar({ status: 403, corpo: { detail: 'Só o perfil delegado registra decisão judicial.' } });
    await expect(proibido.cliente.registrarDecisaoJudicial('c1', DECISAO)).rejects.toMatchObject({ status: 403 });
    const semMarcador = criar({ status: 422, corpo: { detail: 'Pasta sem o marcador SINTETICO.' } });
    const erro = await semMarcador.cliente.importarSobOrdemJudicial('c1', 'd1', { diretorio: 'x', origem: 'oficio' }).catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 422 });
    expect((erro as ErroApi).message).toContain('Pasta sem o marcador SINTETICO.');
  });
});
