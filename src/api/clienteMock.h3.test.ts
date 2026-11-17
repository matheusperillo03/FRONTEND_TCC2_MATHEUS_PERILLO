import { describe, expect, it } from 'vitest';
import { bytesDoBlob, sha256Hex } from '../hash';
import { indiceUtf16 } from '../ia/localizarTrecho';
import { ClienteMock } from './clienteMock';
import { CODIGO_MFA_DEMO, CONTAS_DEMO, TEXTOS_CAPTURA_DEMO, TOKENS_DEMO } from './dadosSinteticos';
import { ErroApi } from './erros';
import { crc32 } from './zipSimulado';

function criar(token = 'dev-analista', opcoes: { iaAtiva?: boolean } = {}) {
  let atual = token;
  const cliente = new ClienteMock({ obterToken: () => atual, obterJustificativa: () => 'teste', latenciaMs: 0, ...opcoes });
  return { cliente, usar: (t: string) => void (atual = t) };
}

const erro = (status: number, detalhe?: RegExp) => expect.objectContaining({ status, ...(detalhe ? { detalhe: expect.stringMatching(detalhe) } : {}) });

describe('ClienteMock — login com senha e segundo fator (H23)', () => {
  it('senha certa abre a etapa do código; o token pendente não serve para a API; o código certo devolve outro token, que vale', async () => {
    const { cliente, usar } = criar('');
    const pendente = await cliente.login(' Analista.Demo ', CONTAS_DEMO['analista.demo'].senha);
    expect(pendente).toMatchObject({ etapa: 'mfa', usuario: 'analista.demo', perfil: 'analista', segredo: null, otpauth_uri: null });
    usar(pendente.token);
    await expect(cliente.me()).rejects.toEqual(erro(401));

    const ativa = await cliente.confirmarMfa(pendente.token, CODIGO_MFA_DEMO);
    expect(ativa.etapa).toBe('ativa');
    expect(ativa.token).not.toBe(pendente.token);
    usar(ativa.token);
    await expect(cliente.me()).resolves.toEqual({ usuario: 'analista.demo', perfil: 'analista' });
    await expect(cliente.obterSessao()).resolves.toMatchObject({ autenticacao: 'sessao', mfa_ativo: true, inatividade_minutos: 30 });
    // O token pendente foi consumido.
    await expect(cliente.confirmarMfa(pendente.token, CODIGO_MFA_DEMO)).rejects.toEqual(erro(401, /inválida ou expirada/));
  });

  it('usuário desconhecido e senha errada dão a mesma mensagem; código errado dá 401 e mantém a etapa', async () => {
    const { cliente } = criar('');
    await expect(cliente.login('ninguem.sintetico', 'x')).rejects.toEqual(erro(401, /^Usuário ou senha inválidos\.$/));
    await expect(cliente.login('analista.demo', 'errada')).rejects.toEqual(erro(401, /^Usuário ou senha inválidos\.$/));
    const pendente = await cliente.login('analista.demo', CONTAS_DEMO['analista.demo'].senha);
    await expect(cliente.confirmarMfa(pendente.token, '000000')).rejects.toEqual(erro(401, /Código de verificação inválido/));
    await expect(cliente.confirmarMfa(pendente.token, CODIGO_MFA_DEMO)).resolves.toMatchObject({ etapa: 'ativa' });
  });

  it('conta sem segundo fator passa pelo cadastro: recebe o segredo e a URI otpauth, e fica com MFA ativo', async () => {
    const { cliente } = criar('');
    const cadastro = await cliente.login('novato.demo', CONTAS_DEMO['novato.demo'].senha);
    expect(cadastro.etapa).toBe('cadastro_mfa');
    expect(cadastro.segredo).toMatch(/^[A-Z2-7]{16,}$/);
    expect(cadastro.otpauth_uri).toMatch(/^otpauth:\/\/totp\/.+secret=[A-Z2-7]+/);
    await cliente.confirmarMfa(cadastro.token, CODIGO_MFA_DEMO);
    await expect(cliente.login('novato.demo', CONTAS_DEMO['novato.demo'].senha)).resolves.toMatchObject({ etapa: 'mfa', segredo: null });
  });

  it('cinco falhas seguidas bloqueiam a conta (429), mesmo com a senha certa depois', async () => {
    const { cliente } = criar('');
    for (let i = 0; i < 5; i++) await expect(cliente.login('delegado.demo', 'errada')).rejects.toEqual(erro(401));
    await expect(cliente.login('delegado.demo', CONTAS_DEMO['delegado.demo'].senha)).rejects.toEqual(erro(429, /bloqueada/));
  });

  it('logout encerra a sessão (o token deixa de valer); token de desenvolvimento não tem sessão (400)', async () => {
    const { cliente, usar } = criar('');
    const p = await cliente.login('analista.demo', CONTAS_DEMO['analista.demo'].senha);
    const { token } = await cliente.confirmarMfa(p.token, CODIGO_MFA_DEMO);
    usar(token);
    await cliente.logout();
    await expect(cliente.me()).rejects.toEqual(erro(401, /sessão expirada/));
    usar('dev-analista');
    await expect(cliente.logout()).rejects.toEqual(erro(400));
    await expect(cliente.obterSessao()).resolves.toMatchObject({ autenticacao: 'token_dev', expira_em: null });
  });

  it('troca de senha: exige a atual (403), recusa senha curta (422) e passa a valer no próximo login', async () => {
    const { cliente, usar } = criar('');
    const p = await cliente.login('analista.demo', CONTAS_DEMO['analista.demo'].senha);
    usar((await cliente.confirmarMfa(p.token, CODIGO_MFA_DEMO)).token);
    await expect(cliente.trocarSenha({ senha_atual: 'errada', senha_nova: 'Outra-Senha-Sintetica-1' })).rejects.toEqual(erro(403));
    await expect(cliente.trocarSenha({ senha_atual: CONTAS_DEMO['analista.demo'].senha, senha_nova: 'curta' })).rejects.toEqual(erro(422));
    await cliente.trocarSenha({ senha_atual: CONTAS_DEMO['analista.demo'].senha, senha_nova: 'Outra-Senha-Sintetica-1' });
    await expect(cliente.login('analista.demo', 'Outra-Senha-Sintetica-1')).resolves.toMatchObject({ etapa: 'mfa' });
  });

  it('administração de contas: só o perfil admin; criar, desativar e redefinir o segundo fator', async () => {
    await expect(criar('dev-analista').cliente.listarUsuarios()).rejects.toEqual(erro(403, /admin/));
    const { cliente } = criar('dev-admin');
    expect((await cliente.listarUsuarios()).map((u) => u.usuario)).toEqual(['admin.demo', 'analista.demo', 'delegado.demo', 'novato.demo']);
    const nova = await cliente.criarUsuario({ usuario: 'Perita.Sintetica', nome: 'Perita Sintética', perfil: 'analista', senha: 'Senha-Inicial-Sintetica' });
    expect(nova).toMatchObject({ usuario: 'perita.sintetica', ativo: true, mfa_ativo: false, criado_por: 'admin.demo' });
    await expect(cliente.criarUsuario({ usuario: 'perita.sintetica', nome: '', perfil: 'analista', senha: 'Senha-Inicial-Sintetica' })).rejects.toEqual(erro(409));
    await expect(cliente.alterarUsuario('admin.demo', { ativo: false })).rejects.toEqual(erro(422, /própria conta/));
    await expect(cliente.alterarUsuario('analista.demo', { redefinir_mfa: true })).resolves.toMatchObject({ mfa_ativo: false });
    await expect(cliente.alterarUsuario('delegado.demo', { ativo: false })).resolves.toMatchObject({ ativo: false });
    await expect(cliente.login('delegado.demo', CONTAS_DEMO['delegado.demo'].senha)).rejects.toEqual(erro(401));
    await expect(cliente.alterarUsuario('ninguem', { ativo: true })).rejects.toEqual(erro(404));
  });

  it('as contas e os tokens do simulado são fictícios e os perfis são os do back-end', () => {
    expect(Object.keys(CONTAS_DEMO).every((u) => u.endsWith('.demo'))).toBe(true);
    expect(TOKENS_DEMO['dev-admin']).toEqual({ usuario: 'admin.demo', perfil: 'admin' });
  });
});

describe('ClienteMock — acesso por caso e membros (H23)', () => {
  it('GET /casos só lista os casos de que o usuário é membro, com o papel dele', async () => {
    await expect(criar('dev-analista').cliente.listarCasos()).resolves.toEqual([expect.objectContaining({ id: 'caso-1', meu_papel: 'responsavel' })]);
    await expect(criar('dev-delegado').cliente.listarCasos()).resolves.toEqual([expect.objectContaining({ meu_papel: 'investigador' })]);
    await expect(criar('dev-agente').cliente.listarCasos()).resolves.toEqual([expect.objectContaining({ meu_papel: 'leitor' })]);
    await expect(criar('dev-admin').cliente.listarCasos()).resolves.toEqual([]);
  });

  it('quem não é membro recebe 403 e a negação fica na auditoria; quem cria o caso é o responsável', async () => {
    const { cliente, usar } = criar('dev-admin');
    await expect(cliente.obterCaso('caso-1')).rejects.toEqual(erro(403, /^Você não é membro deste caso\.$/));
    const novo = await cliente.criarCaso({ titulo: 'Caso sintético', descricao: '', numero_procedimento: '', finalidade: 'teste', retencao_ate: '2099-12-31' });
    expect(novo.meu_papel).toBe('responsavel');
    await expect(cliente.listarMembros(novo.id)).resolves.toEqual([expect.objectContaining({ usuario: 'admin.demo', papel: 'responsavel' })]);
    usar('dev-delegado');
    const negadas = (await cliente.listarAuditoria()).filter((e) => e.acao === 'caso.acesso_negado');
    expect(negadas).toHaveLength(1);
    expect(negadas[0]).toMatchObject({ usuario: 'admin.demo', caso_id: 'caso-1', detalhes: expect.objectContaining({ papel_atual: null, papel_exigido: 'leitor' }) });
  });

  it('o leitor consulta, mas não altera: 403 com o papel na mensagem', async () => {
    const { cliente } = criar('dev-agente');
    await expect(cliente.obterCaso('caso-1')).resolves.toMatchObject({ meu_papel: 'leitor' });
    await expect(cliente.buscarEntidades('caso-1', '')).resolves.not.toHaveLength(0);
    const recusa = erro(403, /Seu papel neste caso \(leitor\) não permite esta ação \(exige investigador\)/);
    await expect(cliente.criarAnotacao('caso-1', { alvo_tipo: 'entidade', alvo_id: 'emp-5', texto: 'nota' })).rejects.toEqual(recusa);
    await expect(cliente.criarTarefa('caso-1', { titulo: 'tarefa' })).rejects.toEqual(recusa);
    await expect(cliente.iniciarColeta('caso-1', { fonte: 'cnpj_arquivo', parametros: { diretorio: 'x' } })).rejects.toEqual(recusa);
    await expect(cliente.executarAlertas('caso-1')).rejects.toEqual(recusa);
    await expect(cliente.extrairComIa('caso-1', 'cap-10')).rejects.toEqual(recusa);
    await expect(cliente.definirMembro('caso-1', { usuario: 'admin.demo', papel: 'leitor' })).rejects.toEqual(erro(403, /exige responsavel/));
  });

  it('só o responsável gerencia a equipe: acrescenta, muda o papel e remove; login desconhecido dá 422', async () => {
    const { cliente, usar } = criar('dev-analista');
    usar('dev-delegado');
    await expect(cliente.definirMembro('caso-1', { usuario: 'admin.demo', papel: 'leitor' })).rejects.toEqual(erro(403));
    usar('dev-analista');
    await expect(cliente.definirMembro('caso-1', { usuario: 'ninguem.sintetico', papel: 'leitor' })).rejects.toEqual(erro(422, /Não há usuário ativo com o login 'ninguem.sintetico'/));
    const com = await cliente.definirMembro('caso-1', { usuario: ' Admin.Demo ', papel: 'leitor' });
    expect(com.map((m) => `${m.usuario}:${m.papel}`)).toEqual(['analista.demo:responsavel', 'delegado.demo:investigador', 'agente.demo:leitor', 'admin.demo:leitor']);
    expect(com.at(-1)).toMatchObject({ adicionado_por: 'analista.demo' });
    const promovido = await cliente.definirMembro('caso-1', { usuario: 'agente.demo', papel: 'investigador' });
    expect(promovido.find((m) => m.usuario === 'agente.demo')?.papel).toBe('investigador');
    const sem = await cliente.removerMembro('caso-1', 'admin.demo');
    expect(sem.map((m) => m.usuario)).not.toContain('admin.demo');
    await expect(cliente.removerMembro('caso-1', 'admin.demo')).rejects.toEqual(erro(404));
    // Quem foi removido deixa de ver o caso na hora.
    usar('dev-admin');
    await expect(cliente.obterCaso('caso-1')).rejects.toEqual(erro(403));
  });

  it('o caso não fica sem responsável: 422 ao rebaixar ou remover o único', async () => {
    const { cliente } = criar('dev-analista');
    await expect(cliente.definirMembro('caso-1', { usuario: 'analista.demo', papel: 'leitor' })).rejects.toEqual(erro(422, /ao menos um responsável/));
    await expect(cliente.removerMembro('caso-1', 'analista.demo')).rejects.toEqual(erro(422, /ao menos um responsável/));
    await cliente.definirMembro('caso-1', { usuario: 'delegado.demo', papel: 'responsavel' });
    await expect(cliente.definirMembro('caso-1', { usuario: 'analista.demo', papel: 'leitor' })).resolves.toHaveLength(3);
  });

  it('GET /casos/{id} traz as contagens do horizonte 3', async () => {
    const { cliente } = criar();
    expect((await cliente.obterCaso('caso-1')).contagens).toMatchObject({ membros: 3, anotacoes: 2, tarefas_abertas: 2, sugestoes_ia_pendentes: 6 });
  });
});

describe('ClienteMock — anotações e tarefas (H37)', () => {
  it('anotações: da mais recente para a mais antiga, com filtro por alvo e rótulo do alvo', async () => {
    const { cliente } = criar();
    const todas = await cliente.listarAnotacoes('caso-1');
    expect(todas.map((a) => a.id)).toEqual(['ano-2', 'ano-1']);
    expect(todas[1]).toMatchObject({ alvo_tipo: 'entidade', alvo_id: 'emp-5', alvo_rotulo: 'TETA SERVICOS SINTETICA LTDA', autor: 'analista.demo' });
    await expect(cliente.listarAnotacoes('caso-1', { alvo_tipo: 'entidade', alvo_id: 'edi-1' })).resolves.toHaveLength(1);
    await expect(cliente.listarAnotacoes('caso-1', { alvo_tipo: 'alerta' })).resolves.toEqual([]);
  });

  it('anotar é só de acréscimo: exige texto, alvo do caso e fica na auditoria; não há como editar nem apagar', async () => {
    const { cliente } = criar();
    await expect(cliente.criarAnotacao('caso-1', { alvo_tipo: 'entidade', alvo_id: 'emp-5', texto: '   ' })).rejects.toEqual(erro(422));
    await expect(cliente.criarAnotacao('caso-1', { alvo_tipo: 'entidade', alvo_id: 'nao-existe', texto: 'nota' })).rejects.toEqual(erro(404));
    await expect(cliente.criarAnotacao('caso-1', { alvo_tipo: 'alerta', alvo_id: 'alr-11', texto: 'nota' })).rejects.toEqual(erro(404)); // tipologias ainda não executadas
    await cliente.executarAlertas('caso-1');
    const nova = await cliente.criarAnotacao('caso-1', { alvo_tipo: 'alerta', alvo_id: 'alr-11', texto: '  Cláusula conferida no edital.  ' });
    expect(nova).toMatchObject({ alvo_tipo: 'alerta', alvo_id: 'alr-11', autor: 'analista.demo', texto: 'Cláusula conferida no edital.' });
    expect(nova.alvo_rotulo).toMatch(/^\[T10\] /);
    expect((await cliente.listarAnotacoes('caso-1'))[0].id).toBe(nova.id);
    expect((await cliente.listarAuditoria('caso-1')).some((e) => e.acao === 'anotacao.criar')).toBe(true);
    expect(Object.getOwnPropertyNames(ClienteMock.prototype).filter((m) => /anotac/i.test(m) && /(alterar|editar|remover|apagar|excluir)/i.test(m))).toEqual([]);
  });

  it('tarefas: abertas primeiro, pelo prazo; a atrasada vem marcada; o filtro de situação funciona', async () => {
    const { cliente } = criar();
    const tarefas = await cliente.listarTarefas('caso-1');
    expect(tarefas.map((t) => [t.id, t.situacao, t.atrasada])).toEqual([
      ['tar-1', 'aberta', true],
      ['tar-2', 'em_andamento', false],
      ['tar-3', 'concluida', false],
    ]);
    await expect(cliente.listarTarefas('caso-1', 'concluida')).resolves.toHaveLength(1);
  });

  it('criar tarefa: o responsável precisa ser membro; a criação abre o histórico', async () => {
    const { cliente } = criar();
    await expect(cliente.criarTarefa('caso-1', { titulo: 'Tarefa', responsavel: 'admin.demo' })).rejects.toEqual(erro(422, /precisa ser membro do caso/));
    await expect(cliente.criarTarefa('caso-1', { titulo: '   ' })).rejects.toEqual(erro(422));
    const t = await cliente.criarTarefa('caso-1', { titulo: 'Ouvir o pregoeiro', responsavel: 'delegado.demo', prazo: '2099-01-31' });
    expect(t).toMatchObject({ situacao: 'aberta', responsavel: 'delegado.demo', prazo: '2099-01-31', atrasada: false, criado_por: 'analista.demo' });
    expect(t.historico).toHaveLength(1);
    expect(t.historico[0].alteracoes).toEqual({
      titulo: { de: null, para: 'Ouvir o pregoeiro' },
      responsavel: { de: null, para: 'delegado.demo' },
      situacao: { de: null, para: 'aberta' },
      prazo: { de: null, para: '2099-01-31' },
    });
  });

  it('alterar tarefa: só os campos enviados mudam, null limpa, e cada alteração entra no histórico com o valor anterior e o novo', async () => {
    const { cliente, usar } = criar();
    usar('dev-delegado');
    const t = await cliente.alterarTarefa('caso-1', 'tar-1', { situacao: 'em_andamento', prazo: null, descricao: 'Ofício enviado.' });
    expect(t).toMatchObject({ situacao: 'em_andamento', prazo: null, atrasada: false, responsavel: 'delegado.demo', descricao: 'Ofício enviado.' });
    expect(t.historico).toHaveLength(2);
    expect(t.historico[1]).toMatchObject({ usuario: 'delegado.demo' });
    expect(t.historico[1].alteracoes.situacao).toEqual({ de: 'aberta', para: 'em_andamento' });
    expect(t.historico[1].alteracoes.prazo).toEqual({ de: '2026-11-10', para: null });
    // A descrição entra no histórico pelo tamanho, sem repetir o texto.
    expect(t.historico[1].alteracoes.descricao).toEqual({ de: expect.stringMatching(/^\(\d+ caracteres\)$/), para: '(15 caracteres)' });
    await expect(cliente.alterarTarefa('caso-1', 'tar-1', { situacao: 'em_andamento' })).rejects.toEqual(erro(422, /Nenhum campo foi alterado/));
    await expect(cliente.alterarTarefa('caso-1', 'tar-1', { responsavel: 'admin.demo' })).rejects.toEqual(erro(422));
    await expect(cliente.alterarTarefa('caso-1', 'tar-1', { responsavel: null })).resolves.toMatchObject({ responsavel: null });
    await expect(cliente.obterTarefa('caso-1', 'tar-1')).resolves.toMatchObject({ id: 'tar-1', historico: expect.arrayContaining([expect.anything()]) });
    await expect(cliente.obterTarefa('caso-1', 'nao-existe')).rejects.toEqual(erro(404));
  });
});

describe('ClienteMock — exportação do grafo (H38)', () => {
  const texto = async (b: Blob) => new TextDecoder().decode(await bytesDoBlob(b));

  it('CSV de entidades e de vínculos: cabeçalho, CRLF e, em cada linha, o ID e o SHA-256 da captura de origem', async () => {
    const { cliente } = criar();
    const entidades = await cliente.exportarGrafo('caso-1', 'csv_entidades');
    expect(entidades).toMatchObject({ nome: 'caso-caso-1-entidades.csv', tipo: 'text/csv' });
    const linhas = (await texto(entidades.conteudo)).split('\r\n');
    expect(linhas[0]).toBe('id,tipo,rotulo,identificador,captura_id,captura_sha256,captura_fonte,captura_origem,captura_coletado_em,atributos_json');
    const teta = linhas.find((l) => l.startsWith('emp-5,'))!;
    expect(teta).toMatch(/^emp-5,empresa,TETA SERVICOS SINTETICA LTDA,90\.000\.004\/0001-62,cap-\d+,[0-9a-f]{64},/);

    const vinculos = await texto((await cliente.exportarGrafo('caso-1', 'csv_vinculos')).conteudo);
    expect(vinculos.split('\r\n')[0]).toContain('origem_id,origem_tipo,origem_rotulo,origem_identificador,destino_id');
    expect(vinculos).toMatch(/socio_de,pes-5,pessoa,[^\r]*,emp-5,empresa,TETA SERVICOS SINTETICA LTDA,[^\r]*,cap-2,[0-9a-f]{64},/);
    // Nenhum CPF completo sai na exportação do simulado.
    expect(vinculos + linhas.join('\n')).not.toMatch(/(?<![\d*])\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/);
  });

  it('GraphML bem formado, com nós e arestas; o SHA-256 informado é o dos bytes entregues', async () => {
    const { cliente } = criar();
    const arquivo = await cliente.exportarGrafo('caso-1', 'graphml');
    const bytes = await bytesDoBlob(arquivo.conteudo);
    const xml = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(xml.querySelectorAll('node').length).toBe((await cliente.buscarEntidades('caso-1', '')).length);
    expect(xml.querySelectorAll('edge').length).toBeGreaterThan(5);
    expect(arquivo.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(arquivo.sha256).toBe(await sha256Hex(bytes));
  });

  it('ZIP com os três arquivos, o manifesto e o LEIAME (UnB/FCTE)', async () => {
    const { cliente } = criar();
    const arquivo = await cliente.exportarGrafo('caso-1', 'zip');
    expect(arquivo).toMatchObject({ nome: 'caso-caso-1-grafo.zip', tipo: 'application/zip' });
    const bytes = new Uint8Array(await bytesDoBlob(arquivo.conteudo));
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const bruto = new TextDecoder('latin1').decode(bytes);
    for (const nome of ['entidades.csv', 'vinculos.csv', 'grafo.graphml', 'manifesto.json', 'LEIAME.txt']) expect(bruto).toContain(nome);
    expect(new TextDecoder().decode(bytes)).toContain('UnB/FCTE');
    expect(new TextDecoder().decode(bytes)).not.toContain('UnB/FGA');
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('formato desconhecido dá 422; a exportação fica na auditoria', async () => {
    const { cliente } = criar();
    await expect(cliente.exportarGrafo('caso-1', 'pdf' as never)).rejects.toEqual(erro(422));
    await cliente.exportarGrafo('caso-1', 'graphml');
    expect((await cliente.listarAuditoria('caso-1')).some((e) => e.acao === 'exportacao.gerar')).toBe(true);
  });
});

describe('ClienteMock — extração assistida por IA local (H22)', () => {
  it('estado da IA: ligada por padrão (sempre local) ou desligada, sem exigir justificativa', async () => {
    const semJ = new ClienteMock({ obterToken: () => 'dev-analista', obterJustificativa: () => '', latenciaMs: 0 });
    await expect(semJ.estadoIa()).resolves.toMatchObject({ ativa: true, local: true, provedor: 'simulado', tipos: expect.arrayContaining(['empresa', 'objeto']) });
    await expect(criar('dev-analista', { iaAtiva: false }).cliente.estadoIa()).resolves.toMatchObject({ ativa: false, provedor: null, modelo: null });
  });

  it('a demonstração traz sugestões pendentes; o trecho de cada uma está, literal, na posição informada (em pontos de código)', async () => {
    const { cliente } = criar();
    const sugestoes = await cliente.listarSugestoesIa('caso-1');
    expect(sugestoes.map((s) => s.tipo)).toEqual(['orgao', 'objeto', 'valor', 'data', 'empresa', 'pessoa']);
    expect(sugestoes.every((s) => s.situacao === 'pendente' && s.entidade_id === null && s.captura_id === 'cap-10')).toBe(true);
    const { texto, sha256 } = await cliente.obterTextoCaptura('caso-1', 'cap-10');
    expect(texto).toBe(TEXTOS_CAPTURA_DEMO['cap-10']);
    for (const s of sugestoes) {
      const inicio = indiceUtf16(texto, s.posicao_inicio);
      expect(texto.slice(inicio, inicio + s.trecho.length)).toBe(s.trecho);
      expect(s.posicao_fim - s.posicao_inicio).toBe(Array.from(s.trecho).length);
      expect(s.captura_sha256).toBe(sha256);
    }
    expect(sugestoes.find((s) => s.tipo === 'data')?.confianca).toBeNull();
    await expect(cliente.listarSugestoesIa('caso-1', { situacao: 'aceita' })).resolves.toEqual([]);
    await expect(cliente.listarSugestoesIa('caso-1', { captura_id: 'cap-1' })).resolves.toEqual([]);
  });

  it('as execuções guardam modelo, versão, parâmetros, prompt e os itens recusados automaticamente, com o motivo', async () => {
    const { cliente } = criar();
    const [extracao] = await cliente.listarExtracoesIa('caso-1');
    expect(extracao).toMatchObject({ id: 'ext-1', captura_id: 'cap-10', situacao: 'sucesso', itens_recebidos: 8, itens_aceitos: 6, itens_recusados: 2, usuario: 'delegado.demo', sugestoes: [] });
    expect(extracao.modelo_versao).not.toBe('');
    expect(extracao.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(extracao.recusas.map((r) => r.motivo)).toEqual(['trecho_nao_literal', 'valor_fora_do_trecho']);
    // O item recusado por trecho não literal de fato não está no documento.
    expect(TEXTOS_CAPTURA_DEMO['cap-10']).not.toContain(extracao.recusas[0].trecho);
  });

  it('extrair cria uma execução nova com sugestões pendentes e nenhuma entidade; desligada, responde 409', async () => {
    const { cliente } = criar();
    const antes = (await cliente.buscarEntidades('caso-1', '')).length;
    const extracao = await cliente.extrairComIa('caso-1', 'cap-10');
    expect(extracao.sugestoes).toHaveLength(6);
    expect(extracao.sugestoes.every((s) => s.situacao === 'pendente' && s.extracao_id === extracao.id)).toBe(true);
    expect(await cliente.buscarEntidades('caso-1', '')).toHaveLength(antes);
    await expect(cliente.listarExtracoesIa('caso-1')).resolves.toHaveLength(2);
    expect((await cliente.listarAuditoria('caso-1')).some((e) => e.acao === 'ia.extrair')).toBe(true);
    await expect(cliente.extrairComIa('caso-1', 'cap-1')).rejects.toEqual(erro(422));
    await expect(cliente.extrairComIa('caso-1', 'nao-existe')).rejects.toEqual(erro(404));
    await expect(criar('dev-analista', { iaAtiva: false }).cliente.extrairComIa('caso-1', 'cap-10')).rejects.toEqual(erro(409, /desligada neste servidor/));
  });

  it('a decisão exige justificativa, é única (409) e só a aceitação liga a sugestão a uma entidade', async () => {
    const { cliente } = criar();
    const sugestoes = await cliente.listarSugestoesIa('caso-1');
    const por = (tipo: string) => sugestoes.find((s) => s.tipo === tipo)!;
    await expect(cliente.decidirSugestaoIa('caso-1', por('empresa').id, { decisao: 'aceita', justificativa: '  ' })).rejects.toEqual(erro(422));

    // Empresa com CNPJ que já existe no caso: une à entidade existente, sem criar outra.
    const antes = (await cliente.buscarEntidades('caso-1', '')).length;
    const empresa = await cliente.decidirSugestaoIa('caso-1', por('empresa').id, { decisao: 'aceita', justificativa: 'Trecho confere com o edital.' });
    expect(empresa).toMatchObject({ situacao: 'aceita', entidade_id: 'emp-5', decidido_por: 'analista.demo', justificativa_decisao: 'Trecho confere com o edital.' });
    expect(await cliente.buscarEntidades('caso-1', '')).toHaveLength(antes);
    await expect(cliente.decidirSugestaoIa('caso-1', por('empresa').id, { decisao: 'recusada', justificativa: 'mudei de ideia' })).rejects.toEqual(erro(409, /já foi decidida \(aceita\)/));

    // Pessoa: entidade própria, restrita ao documento.
    const pessoa = await cliente.decidirSugestaoIa('caso-1', por('pessoa').id, { decisao: 'aceita', justificativa: 'Nome consta do edital.' });
    expect(pessoa.entidade_id).not.toBeNull();
    const criada = await cliente.obterEntidade('caso-1', pessoa.entidade_id!);
    expect(criada).toMatchObject({ tipo: 'pessoa', rotulo: 'FULANO FICTICIO DE TAL', atributos: expect.objectContaining({ origem: 'extracao_ia' }) });
    expect(criada.identificador).toMatch(/^extraida:/);

    // Valor: aceito como campo confirmado, sem entidade. Recusa: sem entidade.
    await expect(cliente.decidirSugestaoIa('caso-1', por('valor').id, { decisao: 'aceita', justificativa: 'Valor confere.' })).resolves.toMatchObject({ situacao: 'aceita', entidade_id: null });
    await expect(cliente.decidirSugestaoIa('caso-1', por('data').id, { decisao: 'recusada', justificativa: 'Data da sessão, não do contrato.' })).resolves.toMatchObject({ situacao: 'recusada', entidade_id: null });
    expect((await cliente.obterCaso('caso-1')).contagens?.sugestoes_ia_pendentes).toBe(2);
    const decisoes = (await cliente.listarAuditoria('caso-1')).filter((e) => e.acao === 'ia.sugestao_decidir');
    expect(decisoes).toHaveLength(4);
    await expect(cliente.decidirSugestaoIa('caso-1', 'nao-existe', { decisao: 'aceita', justificativa: 'x1' })).rejects.toBeInstanceOf(ErroApi);
  });
});
