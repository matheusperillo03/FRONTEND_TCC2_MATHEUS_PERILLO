import { describe, expect, it, vi } from 'vitest';
import { ClienteHttp, nomeDoAnexo } from './clienteHttp';
import { ErroApi, ErroJustificativa } from './erros';

function criar(opcoes: { token?: string; justificativa?: string; resposta?: () => Response } = {}) {
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => (opcoes.resposta ? opcoes.resposta() : new Response('{}', { status: 200 })));
  const cliente = new ClienteHttp({
    baseUrl: 'http://api.teste:8000',
    obterToken: () => opcoes.token ?? 'tok-sessao',
    obterJustificativa: () => opcoes.justificativa ?? 'IP 0001/2026',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const chamada = (i = 0) => {
    const [url, init] = fetchImpl.mock.calls[i];
    return { url: String(url), init: init as RequestInit, cabecalhos: (init as RequestInit).headers as Record<string, string> };
  };
  return { cliente, fetchImpl, chamada };
}

const json = (corpo: unknown, status = 200) => () => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

describe('ClienteHttp — autenticação (H23)', () => {
  it('POST /auth/login é público: não leva Authorization nem X-Justificativa, e funciona sem token', async () => {
    const { cliente, chamada } = criar({ token: '', resposta: json({ etapa: 'mfa', token: 'pendente', expira_em: 'x', usuario: 'ana.sintetica', perfil: 'analista' }) });
    const r = await cliente.login('ana.sintetica', 'senha-sintetica');
    expect(r.etapa).toBe('mfa');
    const { url, init, cabecalhos } = chamada();
    expect(url).toBe('http://api.teste:8000/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ usuario: 'ana.sintetica', senha: 'senha-sintetica' });
    expect(cabecalhos['Authorization']).toBeUndefined();
    expect(cabecalhos['X-Justificativa']).toBeUndefined();
  });

  it('POST /auth/mfa leva o token PENDENTE (não o da sessão) e nunca a justificativa', async () => {
    const { cliente, chamada } = criar({ token: 'tok-antigo', resposta: json({ etapa: 'ativa', token: 'novo', expira_em: 'x', usuario: 'ana.sintetica', perfil: 'analista' }) });
    const r = await cliente.confirmarMfa('tok-pendente', '123456');
    expect(r.token).toBe('novo');
    const { url, init, cabecalhos } = chamada();
    expect(url).toBe('http://api.teste:8000/auth/mfa');
    expect(JSON.parse(String(init.body))).toEqual({ codigo: '123456' });
    expect(cabecalhos['Authorization']).toBe('Bearer tok-pendente');
    expect(cabecalhos['X-Justificativa']).toBeUndefined();
  });

  it('código errado (401) e conta bloqueada (429) chegam como ErroApi com o detalhe do servidor', async () => {
    const errado = criar({ resposta: json({ detail: 'Código de verificação inválido.' }, 401) });
    await expect(errado.cliente.confirmarMfa('p', '000000')).rejects.toMatchObject({ status: 401, detalhe: 'Código de verificação inválido.' });
    const bloqueada = criar({ resposta: json({ detail: 'Conta bloqueada.' }, 429) });
    await expect(bloqueada.cliente.login('a', 'b')).rejects.toMatchObject({ status: 429, detalhe: 'Conta bloqueada.' });
  });

  it('sessão, logout e troca de senha levam só o token; o logout aceita 204 sem corpo', async () => {
    const { cliente, chamada } = criar({ justificativa: '', resposta: () => new Response(null, { status: 204 }) });
    await expect(cliente.logout()).resolves.toBeUndefined();
    await cliente.trocarSenha({ senha_atual: 'a', senha_nova: 'b' });
    await cliente.obterSessao().catch(() => undefined);
    expect(chamada(0).url).toBe('http://api.teste:8000/auth/logout');
    expect(chamada(0).init.method).toBe('POST');
    expect(chamada(1).url).toBe('http://api.teste:8000/auth/senha');
    expect(JSON.parse(String(chamada(1).init.body))).toEqual({ senha_atual: 'a', senha_nova: 'b' });
    expect(chamada(2).url).toBe('http://api.teste:8000/auth/sessao');
    for (const i of [0, 1, 2]) {
      expect(chamada(i).cabecalhos['Authorization']).toBe('Bearer tok-sessao');
      expect(chamada(i).cabecalhos['X-Justificativa']).toBeUndefined();
    }
  });

  it('administração de usuários exige justificativa e codifica o login na URL', async () => {
    const sem = criar({ justificativa: ' ' });
    await expect(sem.cliente.listarUsuarios()).rejects.toBeInstanceOf(ErroJustificativa);
    expect(sem.fetchImpl).not.toHaveBeenCalled();

    const { cliente, chamada } = criar({ resposta: json([]) });
    await cliente.listarUsuarios();
    await cliente.criarUsuario({ usuario: 'novo.sintetico', nome: 'Novo', perfil: 'analista', senha: 'senha-inicial-sintetica' });
    await cliente.alterarUsuario('novo.sintetico', { redefinir_mfa: true });
    expect(chamada(0).url).toBe('http://api.teste:8000/usuarios');
    expect(chamada(0).cabecalhos['X-Justificativa']).toBeDefined();
    expect(chamada(1).init.method).toBe('POST');
    expect(chamada(2).url).toBe('http://api.teste:8000/usuarios/novo.sintetico');
    expect(JSON.parse(String(chamada(2).init.body))).toEqual({ redefinir_mfa: true });
  });
});

describe('ClienteHttp — equipe, anotações e tarefas (H23 e H37)', () => {
  it('monta as rotas de membros', async () => {
    const { cliente, chamada } = criar({ resposta: json([]) });
    await cliente.listarMembros('caso-1');
    await cliente.definirMembro('caso-1', { usuario: 'ana.sintetica', papel: 'leitor' });
    await cliente.removerMembro('caso-1', 'ana.sintetica');
    expect(chamada(0).url).toBe('http://api.teste:8000/casos/caso-1/membros');
    expect(chamada(1).init.method).toBe('POST');
    expect(JSON.parse(String(chamada(1).init.body))).toEqual({ usuario: 'ana.sintetica', papel: 'leitor' });
    expect(chamada(2).url).toBe('http://api.teste:8000/casos/caso-1/membros/ana.sintetica/remover');
    expect(chamada(2).init.method).toBe('POST');
    expect(chamada(2).cabecalhos['X-Justificativa']).toBeDefined();
  });

  it('anotações: filtro por alvo na query e corpo do acréscimo', async () => {
    const { cliente, chamada } = criar({ resposta: json([]) });
    await cliente.listarAnotacoes('caso-1');
    await cliente.listarAnotacoes('caso-1', { alvo_tipo: 'alerta', alvo_id: 'alr-1' });
    await cliente.criarAnotacao('caso-1', { alvo_tipo: 'entidade', alvo_id: 'emp-1', texto: 'nota sintética' });
    expect(chamada(0).url).toBe('http://api.teste:8000/casos/caso-1/anotacoes');
    expect(chamada(1).url).toBe('http://api.teste:8000/casos/caso-1/anotacoes?alvo_tipo=alerta&alvo_id=alr-1');
    expect(JSON.parse(String(chamada(2).init.body))).toEqual({ alvo_tipo: 'entidade', alvo_id: 'emp-1', texto: 'nota sintética' });
  });

  it('tarefas: filtro de situação, criação e alteração só com os campos enviados (null limpa)', async () => {
    const { cliente, chamada } = criar({ resposta: json([]) });
    await cliente.listarTarefas('caso-1', 'em_andamento');
    await cliente.criarTarefa('caso-1', { titulo: 'Tarefa sintética', prazo: '2099-01-31' });
    await cliente.obterTarefa('caso-1', 'tar-1');
    await cliente.alterarTarefa('caso-1', 'tar-1', { situacao: 'concluida', responsavel: null, prazo: null });
    expect(chamada(0).url).toBe('http://api.teste:8000/casos/caso-1/tarefas?situacao=em_andamento');
    expect(JSON.parse(String(chamada(1).init.body))).toEqual({ titulo: 'Tarefa sintética', prazo: '2099-01-31' });
    expect(chamada(2).url).toBe('http://api.teste:8000/casos/caso-1/tarefas/tar-1');
    expect(chamada(2).init.method).toBe('GET');
    expect(chamada(3).init.method).toBe('POST');
    expect(JSON.parse(String(chamada(3).init.body))).toEqual({ situacao: 'concluida', responsavel: null, prazo: null });
  });

  it('403 de papel insuficiente vira ErroApi com o detalhe do servidor', async () => {
    const { cliente } = criar({ resposta: json({ detail: 'Seu papel neste caso (leitor) não permite esta ação (exige investigador).' }, 403) });
    await expect(cliente.criarTarefa('caso-1', { titulo: 'x' })).rejects.toMatchObject({ status: 403, detalhe: expect.stringContaining('leitor') });
  });
});

describe('ClienteHttp — exportação do grafo (H38)', () => {
  it('baixa com Authorization e X-Justificativa e devolve o Blob, o nome do anexo e o SHA-256 do cabeçalho', async () => {
    const { cliente, chamada } = criar({
      resposta: () =>
        new Response('<graphml/>', {
          status: 200,
          headers: {
            'Content-Type': 'application/graphml+xml; charset=utf-8',
            'Content-Disposition': 'attachment; filename="caso-caso-1-grafo.graphml"',
            'X-Conteudo-SHA256': 'ABCDEF0123',
          },
        }),
    });
    const arquivo = await cliente.exportarGrafo('caso-1', 'graphml');
    expect(chamada().url).toBe('http://api.teste:8000/casos/caso-1/exportacao?formato=graphml');
    expect(chamada().cabecalhos['Authorization']).toBe('Bearer tok-sessao');
    expect(chamada().cabecalhos['X-Justificativa']).toBeDefined();
    expect(arquivo.nome).toBe('caso-caso-1-grafo.graphml');
    expect(arquivo.tipo).toBe('application/graphml+xml');
    expect(arquivo.sha256).toBe('abcdef0123');
    expect(arquivo.conteudo.size).toBe(10);
  });

  it('sem os cabeçalhos expostos, usa um nome padrão e SHA-256 nulo; sem justificativa, nem envia', async () => {
    const { cliente } = criar({ resposta: () => new Response('a,b\r\n', { status: 200 }) });
    const arquivo = await cliente.exportarGrafo('caso-1', 'csv_vinculos');
    expect(arquivo.nome).toBe('caso-caso-1-vinculos.csv');
    expect(arquivo.sha256).toBeNull();

    const sem = criar({ justificativa: '' });
    await expect(sem.cliente.exportarGrafo('caso-1', 'zip')).rejects.toBeInstanceOf(ErroJustificativa);
    expect(sem.fetchImpl).not.toHaveBeenCalled();
  });

  it('erro do servidor na exportação (403 de retenção) vira ErroApi', async () => {
    const { cliente } = criar({ resposta: json({ detail: 'O prazo de retenção deste caso terminou' }, 403) });
    await expect(cliente.exportarGrafo('caso-1', 'zip')).rejects.toBeInstanceOf(ErroApi);
  });

  it('nomeDoAnexo lê o filename e não aceita caminho', () => {
    expect(nomeDoAnexo('attachment; filename="caso-1-grafo.zip"')).toBe('caso-1-grafo.zip');
    expect(nomeDoAnexo('attachment; filename=entidades.csv')).toBe('entidades.csv');
    expect(nomeDoAnexo('attachment; filename="../../etc/passwd"')).toBe('.._.._etc_passwd');
    expect(nomeDoAnexo(null)).toBeNull();
    expect(nomeDoAnexo('inline')).toBeNull();
  });
});

describe('ClienteHttp — extração por IA local (H22)', () => {
  it('GET /ia leva só o token, nunca a justificativa', async () => {
    const { cliente, chamada } = criar({ resposta: json({ ativa: false, provedor: null, modelo: null, local: true, tipos: [] }) });
    await expect(cliente.estadoIa()).resolves.toMatchObject({ ativa: false });
    expect(chamada().url).toBe('http://api.teste:8000/ia');
    expect(chamada().cabecalhos['Authorization']).toBe('Bearer tok-sessao');
    expect(chamada().cabecalhos['X-Justificativa']).toBeUndefined();
  });

  it('monta as rotas de extração, execuções, sugestões, decisão e texto da captura', async () => {
    const { cliente, chamada } = criar({ resposta: json([]) });
    await cliente.extrairComIa('caso-1', 'cap-10');
    await cliente.listarExtracoesIa('caso-1');
    await cliente.listarSugestoesIa('caso-1', { situacao: 'pendente', captura_id: 'cap-10' });
    await cliente.decidirSugestaoIa('caso-1', 'sug-1', { decisao: 'recusada', justificativa: 'trecho não ampara o valor' });
    await cliente.obterTextoCaptura('caso-1', 'cap-10');
    expect(chamada(0).url).toBe('http://api.teste:8000/casos/caso-1/capturas/cap-10/extracao-ia');
    expect(chamada(0).init.method).toBe('POST');
    expect(chamada(0).init.body).toBeUndefined();
    expect(chamada(1).url).toBe('http://api.teste:8000/casos/caso-1/extracoes-ia');
    expect(chamada(2).url).toBe('http://api.teste:8000/casos/caso-1/sugestoes-ia?situacao=pendente&captura_id=cap-10');
    expect(chamada(3).url).toBe('http://api.teste:8000/casos/caso-1/sugestoes-ia/sug-1/decisao');
    expect(JSON.parse(String(chamada(3).init.body))).toEqual({ decisao: 'recusada', justificativa: 'trecho não ampara o valor' });
    expect(chamada(4).url).toBe('http://api.teste:8000/casos/caso-1/capturas/cap-10/texto');
    for (const i of [0, 1, 2, 3, 4]) expect(chamada(i).cabecalhos['X-Justificativa']).toBeDefined();
  });

  it('IA desligada (409) e extração que falhou (502) chegam com o detalhe', async () => {
    const desligada = criar({ resposta: json({ detail: 'A extração assistida por IA está desligada neste servidor (IA_EXTRACAO_ATIVA=0).' }, 409) });
    await expect(desligada.cliente.extrairComIa('caso-1', 'cap-10')).rejects.toMatchObject({ status: 409 });
    const falhou = criar({ resposta: json({ detail: 'A extração falhou e foi registrada (ext-9): tempo esgotado' }, 502) });
    await expect(falhou.cliente.extrairComIa('caso-1', 'cap-10')).rejects.toMatchObject({ status: 502, detalhe: expect.stringContaining('ext-9') });
  });
});
