import { describe, expect, it, vi } from 'vitest';
import { ClienteHttp, sanitizarCabecalho } from './clienteHttp';
import { ErroApi, ErroAutenticacao, ErroJustificativa } from './erros';

function fetchFalso(corpo: unknown = {}, status = 200) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
    const texto = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
    return new Response(texto, { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

function criar(opcoes: { token?: string; justificativa?: string; corpo?: unknown; status?: number } = {}) {
  const fetchImpl = fetchFalso(opcoes.corpo ?? {}, opcoes.status ?? 200);
  const cliente = new ClienteHttp({
    baseUrl: 'http://api.teste:8000/',
    obterToken: () => opcoes.token ?? 'tok-123',
    obterJustificativa: () => opcoes.justificativa ?? 'IP 0001/2026 — análise de vínculos',
    fetchImpl,
  });
  return { cliente, fetchImpl };
}

function cabecalhos(fetchImpl: ReturnType<typeof vi.fn>, chamada = 0): Record<string, string> {
  const init = fetchImpl.mock.calls[chamada][1] as RequestInit;
  return init.headers as Record<string, string>;
}

function url(fetchImpl: ReturnType<typeof vi.fn>, chamada = 0): string {
  return String(fetchImpl.mock.calls[chamada][0]);
}

describe('ClienteHttp — cabeçalhos do contrato v0', () => {
  it('envia Authorization Bearer e X-Justificativa nas consultas ao caso', async () => {
    const { cliente, fetchImpl } = criar({ corpo: [] });
    await cliente.buscarEntidades('caso-1', 'alfa');
    const h = cabecalhos(fetchImpl);
    expect(h['Authorization']).toBe('Bearer tok-123');
    expect(decodeURIComponent(h['X-Justificativa'])).toBe('IP 0001/2026 — análise de vínculos');
    expect(h['X-Justificativa']).not.toMatch(/[^\x20-\x7e]/);
    expect(url(fetchImpl)).toBe('http://api.teste:8000/casos/caso-1/entidades?q=alfa');
  });

  it('mantém acentos do português no cabeçalho e substitui só caracteres fora do Latin-1', () => {
    expect(sanitizarCabecalho('Investigação de vínculos — órgão')).toBe('Investigação de vínculos ? órgão');
    expect(sanitizarCabecalho(' com\nquebra ')).toBe('com quebra');
  });

  it('não envia a requisição sem justificativa (ErroJustificativa) e não chama o fetch', async () => {
    const { cliente, fetchImpl } = criar({ justificativa: '   ' });
    await expect(cliente.obterCaso('caso-1')).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(cliente.verificarCaptura('cap-1')).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(cliente.listarAuditoria()).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(cliente.obterRelatorio('caso-1', 'md')).rejects.toBeInstanceOf(ErroJustificativa);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('/me não exige justificativa; /casos exige, como o back-end', async () => {
    const semJ = criar({ justificativa: '', corpo: { usuario: 'a', perfil: 'analista' } });
    await semJ.cliente.me();
    expect(cabecalhos(semJ.fetchImpl)['X-Justificativa']).toBeUndefined();
    expect(cabecalhos(semJ.fetchImpl)['Authorization']).toBe('Bearer tok-123');
    await expect(semJ.cliente.listarCasos()).rejects.toBeInstanceOf(ErroJustificativa);

    const comJ = criar({ corpo: [] });
    await comJ.cliente.listarCasos();
    expect(cabecalhos(comJ.fetchImpl)['X-Justificativa']).toBeDefined();
  });

  it('aceita base relativa (/api, atrás do nginx) e resolve contra a origem da página', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    const cliente = new ClienteHttp({ baseUrl: '/api', obterToken: () => '', obterJustificativa: () => '', fetchImpl });
    await cliente.health();
    expect(url(fetchImpl)).toBe(`${window.location.origin}/api/health`);
  });

  it('/health é pública: sem Authorization nem justificativa', async () => {
    const { cliente, fetchImpl } = criar({ token: '', justificativa: '', corpo: { status: 'ok' } });
    await expect(cliente.health()).resolves.toEqual({ status: 'ok' });
    const h = cabecalhos(fetchImpl);
    expect(h['Authorization']).toBeUndefined();
    expect(h['X-Justificativa']).toBeUndefined();
  });

  it('sem token lança ErroAutenticacao antes de chamar a rede', async () => {
    const { cliente, fetchImpl } = criar({ token: '' });
    await expect(cliente.me()).rejects.toBeInstanceOf(ErroAutenticacao);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('POST /casos/{id}/coletas envia corpo JSON com fonte e parâmetros', async () => {
    const { cliente, fetchImpl } = criar({ corpo: { captura_ids: ['cap-9'], entidades_novas: 3 } });
    const r = await cliente.iniciarColeta(7, { fonte: 'pncp', parametros: { dataInicial: '20260101', dataFinal: '20260131', max_paginas: 2 } });
    expect(r.captura_ids).toEqual(['cap-9']);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(cabecalhos(fetchImpl)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({ fonte: 'pncp', parametros: { dataInicial: '20260101', dataFinal: '20260131', max_paginas: 2 } });
    expect(url(fetchImpl)).toBe('http://api.teste:8000/casos/7/coletas');
  });

  it('monta as consultas de grafo, caminho, auditoria e relatório conforme o contrato', async () => {
    const { cliente, fetchImpl } = criar({ corpo: { nos: [], arestas: [] } });
    await cliente.obterGrafo('c1', 'e1', 3);
    expect(url(fetchImpl, 0)).toBe('http://api.teste:8000/casos/c1/grafo?centro=e1&profundidade=3');
    await cliente.obterCaminho('c1', 'e1', 'e2');
    expect(url(fetchImpl, 1)).toBe('http://api.teste:8000/casos/c1/caminho?de=e1&para=e2');
    await cliente.listarAuditoria('c1');
    expect(url(fetchImpl, 2)).toBe('http://api.teste:8000/auditoria?caso_id=c1');
    await cliente.verificarAuditoria();
    expect(url(fetchImpl, 3)).toBe('http://api.teste:8000/auditoria/verificar');
    await cliente.executarAlertas('c1');
    expect(url(fetchImpl, 4)).toBe('http://api.teste:8000/casos/c1/alertas/executar');
    expect((fetchImpl.mock.calls[4][1] as RequestInit).method).toBe('POST');
  });

  it('relatório devolve o texto bruto', async () => {
    const { cliente, fetchImpl } = criar({ corpo: '# Relatório\n\ntexto' });
    await expect(cliente.obterRelatorio('c1', 'md')).resolves.toBe('# Relatório\n\ntexto');
    expect(url(fetchImpl)).toBe('http://api.teste:8000/casos/c1/relatorio?formato=md');
  });

  it('converte respostas de erro em ErroApi com o detail do FastAPI', async () => {
    const { cliente } = criar({ corpo: { detail: 'Justificativa obrigatória' }, status: 400 });
    const erro = await cliente.listarAlertas('c1').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect((erro as ErroApi).status).toBe(400);
    expect((erro as ErroApi).detalhe).toBe('Justificativa obrigatória');
  });
});

describe('ClienteHttp — rotas do horizonte 1 do backlog', () => {
  it('decidirAlerta envia a decisão e a justificativa no corpo, com a justificativa do acesso no cabeçalho', async () => {
    const { cliente, fetchImpl } = criar({ corpo: { id: 'a1', situacao: 'descartado' } });
    await cliente.decidirAlerta('caso 1', 'a/1', { decisao: 'descartado', justificativa: 'Empresa regular' });
    expect(url(fetchImpl)).toBe('http://api.teste:8000/casos/caso%201/alertas/a%2F1/decisao');
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ decisao: 'descartado', justificativa: 'Empresa regular' });
    expect(cabecalhos(fetchImpl)['X-Justificativa']).toBeTruthy();
  });

  it('listarColetas e recoletar usam as rotas de coletas do caso', async () => {
    const { cliente, fetchImpl } = criar({ corpo: [] });
    await cliente.listarColetas('caso-1');
    await cliente.recoletar('caso-1', 'col-1');
    expect(url(fetchImpl, 0)).toBe('http://api.teste:8000/casos/caso-1/coletas');
    expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe('GET');
    expect(url(fetchImpl, 1)).toBe('http://api.teste:8000/casos/caso-1/coletas/col-1/recoletar');
    expect((fetchImpl.mock.calls[1][1] as RequestInit).method).toBe('POST');
  });

  it('as rotas novas também não saem sem justificativa, e a recusa por retenção (403) vira ErroApi com o motivo', async () => {
    const semJ = criar({ justificativa: ' ' });
    await expect(semJ.cliente.decidirAlerta('c', 'a', { decisao: 'confirmado', justificativa: 'x' })).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(semJ.cliente.listarColetas('c')).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(semJ.cliente.recoletar('c', 'k')).rejects.toBeInstanceOf(ErroJustificativa);
    expect(semJ.fetchImpl).not.toHaveBeenCalled();

    const vencido = criar({ status: 403, corpo: { detail: 'O prazo de retenção deste caso terminou em 2026-06-30' } });
    const erro = await vencido.cliente.iniciarColeta('c', { fonte: 'cnpj_arquivo', parametros: { diretorio: 'cnpj' } }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect((erro as ErroApi).status).toBe(403);
    expect(String((erro as ErroApi).message)).toContain('prazo de retenção');
  });
});

describe('ClienteHttp — rotas do horizonte 2 do backlog', () => {
  it('GET /tipologias leva só o token: nunca manda X-Justificativa, mesmo com justificativa na sessão', async () => {
    const comJ = criar({ corpo: [] });
    await comJ.cliente.listarTipologias();
    expect(url(comJ.fetchImpl)).toBe('http://api.teste:8000/tipologias');
    expect((comJ.fetchImpl.mock.calls[0][1] as RequestInit).method).toBe('GET');
    expect(cabecalhos(comJ.fetchImpl)['Authorization']).toBe('Bearer tok-123');
    expect(cabecalhos(comJ.fetchImpl)['X-Justificativa']).toBeUndefined();

    // Sem justificativa a rota também funciona; sem token, não.
    const semJ = criar({ justificativa: '', corpo: [] });
    await expect(semJ.cliente.listarTipologias()).resolves.toEqual([]);
    const semToken = criar({ token: '' });
    await expect(semToken.cliente.listarTipologias()).rejects.toBeInstanceOf(ErroAutenticacao);
    expect(semToken.fetchImpl).not.toHaveBeenCalled();
  });

  it('coleta das fontes novas envia os parâmetros como foram montados (do_caso, recurso, servidores)', async () => {
    const { cliente, fetchImpl } = criar({ corpo: { captura_ids: [], entidades_novas: 0, situacao: 'nao_configurado', motivo: 'sem chave' } });
    const r = await cliente.iniciarColeta('c1', { fonte: 'portal_transparencia', parametros: { recurso: 'ceis', do_caso: true } });
    expect(r.situacao).toBe('nao_configurado');
    await cliente.iniciarColeta('c1', { fonte: 'pncp_termos', parametros: { do_caso: true } });
    await cliente.iniciarColeta('c1', { fonte: 'portal_transparencia', parametros: { recurso: 'servidores', orgaoServidorLotacao: '90001', cnpjOrgao: '90100001000100' } });
    const corpo = (i: number) => JSON.parse(String((fetchImpl.mock.calls[i][1] as RequestInit).body));
    expect(corpo(0)).toEqual({ fonte: 'portal_transparencia', parametros: { recurso: 'ceis', do_caso: true } });
    expect(corpo(1)).toEqual({ fonte: 'pncp_termos', parametros: { do_caso: true } });
    expect(corpo(2)).toEqual({ fonte: 'portal_transparencia', parametros: { recurso: 'servidores', orgaoServidorLotacao: '90001', cnpjOrgao: '90100001000100' } });
    expect(url(fetchImpl, 2)).toBe('http://api.teste:8000/casos/c1/coletas');
  });

  it('executarAlertas manda tipologias e limiares no corpo; sem argumentos, não manda corpo', async () => {
    const { cliente, fetchImpl } = criar({ corpo: [] });
    await cliente.executarAlertas('c1', { tipologias: ['T5', 'T8', 'T10'], parametros: { t5_minimo_contratacoes: 3, t8_percentual_limite: 20, t8_percentual_limite_reforma: 40 } });
    await cliente.executarAlertas('c1');
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      tipologias: ['T5', 'T8', 'T10'],
      parametros: { t5_minimo_contratacoes: 3, t8_percentual_limite: 20, t8_percentual_limite_reforma: 40 },
    });
    expect((fetchImpl.mock.calls[1][1] as RequestInit).body).toBeUndefined();
  });

  it('monitoramentos: listar, criar, mudar a situação e executar', async () => {
    const { cliente, fetchImpl } = criar({ corpo: [] });
    const init = (i: number) => fetchImpl.mock.calls[i][1] as RequestInit;
    await cliente.listarMonitoramentos('caso 1');
    expect(url(fetchImpl, 0)).toBe('http://api.teste:8000/casos/caso%201/monitoramentos');
    expect(init(0).method).toBe('GET');

    await cliente.criarMonitoramento('c1', { entidade_id: 42, periodicidade_horas: 168 });
    expect(url(fetchImpl, 1)).toBe('http://api.teste:8000/casos/c1/monitoramentos');
    expect(init(1).method).toBe('POST');
    // O back-end espera o id da entidade como texto.
    expect(JSON.parse(String(init(1).body))).toEqual({ entidade_id: '42', periodicidade_horas: 168 });

    await cliente.alterarMonitoramento('c1', 'm/1', { ativo: false });
    expect(url(fetchImpl, 2)).toBe('http://api.teste:8000/casos/c1/monitoramentos/m%2F1/situacao');
    expect(JSON.parse(String(init(2).body))).toEqual({ ativo: false });
    await cliente.alterarMonitoramento('c1', 'm1', { ativo: true, periodicidade_horas: 720 });
    expect(JSON.parse(String(init(3).body))).toEqual({ ativo: true, periodicidade_horas: 720 });

    await cliente.executarMonitoramento('c1', 'm1');
    expect(url(fetchImpl, 4)).toBe('http://api.teste:8000/casos/c1/monitoramentos/m1/executar');
    expect(init(4).method).toBe('POST');
    expect(init(4).body).toBeUndefined();
    for (let i = 0; i < 5; i++) expect(cabecalhos(fetchImpl, i)['X-Justificativa']).toBeTruthy();
  });

  it('avisos: listar (com e sem nao_lidos) e marcar como lido', async () => {
    const { cliente, fetchImpl } = criar({ corpo: [] });
    await cliente.listarAvisos('c1');
    await cliente.listarAvisos('c1', true);
    await cliente.marcarAvisoLido('c1', 'a1');
    expect(url(fetchImpl, 0)).toBe('http://api.teste:8000/casos/c1/avisos');
    expect(url(fetchImpl, 1)).toBe('http://api.teste:8000/casos/c1/avisos?nao_lidos=true');
    expect(url(fetchImpl, 2)).toBe('http://api.teste:8000/casos/c1/avisos/a1/lido');
    expect((fetchImpl.mock.calls[2][1] as RequestInit).method).toBe('POST');
  });

  it('monitoramento e avisos são dados de caso: sem justificativa, nada sai; 409 e 403 viram ErroApi', async () => {
    const semJ = criar({ justificativa: ' ' });
    await expect(semJ.cliente.listarMonitoramentos('c')).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(semJ.cliente.criarMonitoramento('c', { entidade_id: 'e', periodicidade_horas: 24 })).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(semJ.cliente.alterarMonitoramento('c', 'm', { ativo: false })).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(semJ.cliente.executarMonitoramento('c', 'm')).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(semJ.cliente.listarAvisos('c')).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(semJ.cliente.marcarAvisoLido('c', 'a')).rejects.toBeInstanceOf(ErroJustificativa);
    expect(semJ.fetchImpl).not.toHaveBeenCalled();

    const desativado = criar({ status: 409, corpo: { detail: 'O monitoramento está desativado.' } });
    await expect(desativado.cliente.executarMonitoramento('c', 'm')).rejects.toMatchObject({ status: 409, detalhe: 'O monitoramento está desativado.' });
  });
});
