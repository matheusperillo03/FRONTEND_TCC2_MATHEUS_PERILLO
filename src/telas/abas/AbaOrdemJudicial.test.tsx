import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErroApi, type ApiCliente, type EstadoImportacaoJudicial, type PaginaRegistrosJudiciais, type RegistroJudicial } from '../../api';
import { DECISAO_JUDICIAL_DEMO, IMPORTACAO_JUDICIAL_DEMO } from '../../api/dadosSinteticos';
import { PapelProvider, papelNoCaso } from '../../sessao/PapelContext';
import { SessaoProvider } from '../../sessao/SessaoContext';
import { clienteFalso } from '../../test/clienteFalso';
import { cpfSinteticoValido, mascarado, pontuado } from '../../test/cpfSintetico';
import { Caso } from '../Caso';
import { AbaOrdemJudicial, valorDoCampoJudicial } from './AbaOrdemJudicial';

const ESTADO: EstadoImportacaoJudicial = { ...IMPORTACAO_JUDICIAL_DEMO, ativa: true };
const DELEGADO = { usuario: 'delegado.demo', perfil: 'delegado' };
const ANALISTA = { usuario: 'analista.demo', perfil: 'analista' };

/** A aba sozinha, com o módulo ligado no simulado. Por padrão, quem usa é o delegado (investigador no caso sintético). */
function renderizarAba(opcoes: { me?: { usuario: string; perfil: string }; token?: string; sobrescritas?: Partial<ApiCliente>; papel?: 'leitor' | 'investigador' } = {}) {
  const usuario = userEvent.setup();
  const me = opcoes.me ?? DELEGADO;
  const token = opcoes.token ?? (me.perfil === 'delegado' ? 'dev-delegado' : 'dev-analista');
  const cliente = clienteFalso(opcoes.sobrescritas ?? {}, 'IP 0001/2026 — afastamento de sigilo', { token, importacaoJudicial: true });
  render(
    <SessaoProvider cliente={cliente} inicial={{ token, me, justificativa: 'IP 0001/2026 — afastamento de sigilo' }}>
      <PapelProvider value={papelNoCaso(opcoes.papel ?? 'investigador')}>
        <AbaOrdemJudicial casoId="caso-1" estado={ESTADO} />
      </PapelProvider>
    </SessaoProvider>,
  );
  return { usuario, cliente };
}

async function preencherDecisao(usuario: ReturnType<typeof userEvent.setup>) {
  const d = DECISAO_JUDICIAL_DEMO;
  await usuario.type(screen.getByLabelText('Número do processo'), d.numero_processo);
  await usuario.type(screen.getByLabelText('Número ou identificação da decisão'), d.numero_decisao);
  await usuario.type(screen.getByLabelText('Juízo'), d.juizo);
  await usuario.type(screen.getByLabelText('Data da decisão'), d.data_decisao);
  await usuario.type(screen.getByLabelText('Início do período autorizado'), d.periodo_inicio);
  await usuario.type(screen.getByLabelText('Fim do período autorizado'), d.periodo_fim);
  await usuario.type(screen.getByLabelText('Banco (conta 1)'), d.contas[0].banco);
  await usuario.type(screen.getByLabelText('Agência (conta 1)'), d.contas[0].agencia);
  await usuario.type(screen.getByLabelText('Número da conta (conta 1)'), d.contas[0].conta);
  await usuario.type(screen.getByLabelText('Escopo da decisão'), d.descricao_escopo);
}

/** Registra a decisão de exemplo, que já fica escolhida, e importa a pasta sintética. */
async function registrarEImportar(usuario: ReturnType<typeof userEvent.setup>) {
  await preencherDecisao(usuario);
  await usuario.click(screen.getByRole('button', { name: 'Registrar decisão' }));
  await usuario.type(await screen.findByLabelText('Diretório com os arquivos'), 'caso-sintetico');
  await usuario.click(screen.getByRole('button', { name: 'Importar arquivos' }));
  return screen.findByTestId('relatorio-importacao');
}

describe('RF10: aba Ordem judicial na tela do caso (módulo separado, desligado por padrão)', () => {
  function renderizarCaso(importacaoJudicial: boolean, sobrescritas: Partial<ApiCliente> = {}) {
    const usuario = userEvent.setup();
    const cliente = clienteFalso(sobrescritas, 'teste automatizado', { token: 'dev-delegado', importacaoJudicial });
    render(
      <SessaoProvider cliente={cliente} inicial={{ token: 'dev-delegado', me: DELEGADO, justificativa: 'teste automatizado' }}>
        <Caso casoId="caso-1" aoVoltar={() => undefined} />
      </SessaoProvider>,
    );
    return { usuario, cliente };
  }

  it('com o módulo desligado (ativa: false), a aba não aparece e nenhuma rota do módulo é chamada', async () => {
    const listarDecisoesJudiciais = vi.fn(async () => []);
    const estadoImportacaoJudicial = vi.fn(async (): Promise<EstadoImportacaoJudicial> => ({ ...IMPORTACAO_JUDICIAL_DEMO, ativa: false }));
    renderizarCaso(false, { estadoImportacaoJudicial, listarDecisoesJudiciais });
    await screen.findByTestId('papel-no-caso');
    await waitFor(() => expect(estadoImportacaoJudicial).toHaveBeenCalled());
    expect(screen.queryByRole('tab', { name: 'Ordem judicial' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(10);
    expect(screen.queryByText(/ordem judicial/i)).not.toBeInTheDocument();
    expect(listarDecisoesJudiciais).not.toHaveBeenCalled();
  });

  it('se a consulta do estado falhar, nada do módulo aparece (nem mensagem de erro do módulo)', async () => {
    const estadoImportacaoJudicial = vi.fn(async (): Promise<EstadoImportacaoJudicial> => {
      throw new ErroApi(404, '/importacao-judicial/estado', 'Not Found');
    });
    renderizarCaso(true, { estadoImportacaoJudicial });
    await screen.findByTestId('papel-no-caso');
    await waitFor(() => expect(estadoImportacaoJudicial).toHaveBeenCalled());
    expect(screen.queryByRole('tab', { name: 'Ordem judicial' })).not.toBeInTheDocument();
    expect(screen.queryByText(/ordem judicial/i)).not.toBeInTheDocument();
  });

  it('com o módulo ligado (ativa: true), a aba aparece entre Equipe e Auditoria e abre com a faixa de aviso', async () => {
    const { usuario } = renderizarCaso(true);
    const aba = await screen.findByRole('tab', { name: 'Ordem judicial' });
    expect(screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\d.*$/, ''))).toEqual([
      'Coleta', 'Entidades', 'Grafo', 'Alertas', 'Sugestões da IA', 'Tipologias', 'Monitoramento', 'Equipe', 'Ordem judicial', 'Auditoria', 'Relatório',
    ]);
    await usuario.click(aba);
    const faixa = await screen.findByTestId('faixa-sigilo');
    expect(faixa).toHaveTextContent('Dado sigiloso, obtido sob ordem judicial.');
    expect(faixa).toHaveTextContent('só dados sintéticos');
    expect(faixa).toHaveTextContent('separado do dado aberto');
    expect(faixa).toHaveTextContent('fora do relatório, do grafo e das exportações');
    expect(faixa).toHaveTextContent('Cada acesso fica na auditoria');
    expect(faixa).toHaveTextContent('Instrução Normativa BCB nº 636/2025, Anexo I');
    // O delegado é investigador no caso sintético: vê o formulário da decisão.
    expect(await screen.findByRole('form', { name: 'Registro da decisão judicial' })).toBeInTheDocument();
  });
});

describe('RF10: a decisão judicial vem antes de qualquer importação', () => {
  it('sem decisão registrada, a importação não abre: não há formulário nem botão de importar', async () => {
    renderizarAba();
    expect(await screen.findByText(/Nenhuma decisão judicial registrada neste caso/)).toBeInTheDocument();
    expect(screen.getByTestId('sem-decisao-escolhida')).toHaveTextContent('A importação só abre depois que uma decisão judicial for registrada.');
    expect(screen.queryByRole('form', { name: 'Importação sob ordem judicial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Importar arquivos' })).not.toBeInTheDocument();
  });

  it('perfil fora de perfis_autorizados vê a explicação, e não o formulário de registrar decisão', async () => {
    renderizarAba({ me: ANALISTA });
    const explicacao = await screen.findByTestId('sem-permissao-decisao');
    expect(explicacao).toHaveTextContent('Só o perfil delegado registra a decisão judicial');
    expect(explicacao).toHaveTextContent('seu perfil é analista');
    expect(screen.queryByRole('form', { name: 'Registro da decisão judicial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar decisão' })).not.toBeInTheDocument();
  });

  it('perfil autorizado que é só leitor no caso também não vê o formulário', async () => {
    renderizarAba({ papel: 'leitor' });
    expect(await screen.findByTestId('sem-permissao-decisao')).toHaveTextContent('exige o papel de investigador ou de responsável');
    expect(screen.queryByRole('form', { name: 'Registro da decisão judicial' })).not.toBeInTheDocument();
  });

  it('valida os campos obrigatórios da decisão antes de enviar, inclusive a conta e a ordem do período', async () => {
    const registrarDecisaoJudicial = vi.fn();
    const { usuario } = renderizarAba({ sobrescritas: { registrarDecisaoJudicial } });
    await usuario.click(await screen.findByRole('button', { name: 'Registrar decisão' }));
    const pendencias = screen.getByTestId('pendencias-decisao');
    for (const falta of ['número do processo', 'número ou identificação da decisão', 'juízo', 'data da decisão', 'início do período', 'fim do período', 'ao menos uma conta', 'escopo da decisão']) {
      expect(pendencias).toHaveTextContent(falta);
    }
    expect(screen.getByLabelText('Número do processo')).toHaveAttribute('aria-invalid', 'true');

    await preencherDecisao(usuario);
    expect(screen.queryByTestId('pendencias-decisao')).not.toBeInTheDocument();
    // Conta pela metade e período invertido continuam bloqueando.
    await usuario.clear(screen.getByLabelText('Agência (conta 1)'));
    await usuario.clear(screen.getByLabelText('Fim do período autorizado'));
    await usuario.type(screen.getByLabelText('Fim do período autorizado'), '2025-12-31');
    await usuario.click(screen.getByRole('button', { name: 'Registrar decisão' }));
    expect(screen.getByTestId('pendencias-decisao')).toHaveTextContent('banco, agência e número de cada conta informada');
    expect(screen.getByTestId('pendencias-decisao')).toHaveTextContent('o fim não pode ser anterior ao início');
    expect(registrarDecisaoJudicial).not.toHaveBeenCalled();
  });

  it('registra a decisão, lista com a marca de sigilo e só então abre a importação, sob a decisão escolhida', async () => {
    const { usuario, cliente } = renderizarAba();
    await screen.findByText(/Nenhuma decisão judicial registrada neste caso/);
    await preencherDecisao(usuario);
    await usuario.type(screen.getByLabelText('Investigados (opcional)'), '90.000.001/0001-00');
    await usuario.click(screen.getByRole('button', { name: 'Registrar decisão' }));

    const linha = await screen.findByTestId('decisao-judicial');
    expect(within(linha).getByTestId('marca-sigilo')).toHaveTextContent('sigiloso: ordem judicial nº Decisão ID 123456 (processo 0000000-00.2026.8.07.0001)');
    expect(linha).toHaveTextContent('1ª Vara Criminal de Exemplópolis');
    expect(linha).toHaveTextContent('01/01/2026 a 30/06/2026');
    expect(linha).toHaveTextContent('banco 999, agência 00001, conta 123456');
    expect(linha).toHaveTextContent('delegado.demo');
    // A decisão recém-registrada já fica escolhida e o formulário de importação aparece.
    const formulario = await screen.findByRole('form', { name: 'Importação sob ordem judicial' });
    expect(formulario).toHaveTextContent('Importando sob: sigiloso: ordem judicial nº Decisão ID 123456');
    expect(within(formulario).getByRole('button', { name: 'Importar arquivos' })).toBeDisabled();

    // Desfeita a escolha, a importação fecha de novo.
    await usuario.click(within(linha).getByRole('button', { name: 'Decisão escolhida' }));
    expect(screen.queryByRole('form', { name: 'Importação sob ordem judicial' })).not.toBeInTheDocument();
    expect(screen.getByTestId('sem-decisao-escolhida')).toHaveTextContent('Escolha acima a decisão judicial que autoriza a importação.');
    await usuario.click(within(linha).getByRole('button', { name: 'Importar sob esta decisão' }));
    expect(screen.getByRole('form', { name: 'Importação sob ordem judicial' })).toBeInTheDocument();

    const [gravada] = await cliente.listarDecisoesJudiciais('caso-1');
    expect(gravada).toMatchObject({ ...DECISAO_JUDICIAL_DEMO, registrado_por: 'delegado.demo', importacoes: 0 });
  });

  it('mostra a recusa do servidor (403) sem perder o que foi digitado', async () => {
    const registrarDecisaoJudicial = vi.fn(async () => {
      throw new ErroApi(403, '/casos/caso-1/importacao-judicial/decisoes', 'Só o perfil delegado registra decisão judicial.');
    });
    const { usuario } = renderizarAba({ sobrescritas: { registrarDecisaoJudicial } });
    await screen.findByText(/Nenhuma decisão judicial registrada neste caso/);
    await preencherDecisao(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Registrar decisão' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/A decisão não foi registrada: .*403.*Só o perfil delegado registra decisão judicial\./);
    expect(screen.getByLabelText('Juízo')).toHaveValue('1ª Vara Criminal de Exemplópolis');
  });
});

describe('RF10 e RNF02: importação, relatório de validação e registros', () => {
  it('envia o diretório, a origem e a descrição, e mostra o relatório de validação por arquivo, com rejeições e SHA-256', async () => {
    const { usuario, cliente } = renderizarAba();
    await screen.findByText(/Nenhuma decisão judicial registrada neste caso/);
    await preencherDecisao(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Registrar decisão' }));
    await usuario.type(await screen.findByLabelText('Diretório com os arquivos'), 'caso-sintetico');
    await usuario.selectOptions(screen.getByLabelText('Origem'), 'midia');
    await usuario.type(screen.getByLabelText('Descrição da origem (opcional)'), 'Mídia entregue pelo banco sintético');
    await usuario.click(screen.getByRole('button', { name: 'Importar arquivos' }));

    const relatorio = await screen.findByTestId('relatorio-importacao');
    expect(within(relatorio).getByRole('heading', { name: 'Importação concluída: relatório de validação' })).toBeInTheDocument();
    expect(relatorio).toHaveTextContent('Origem: Mídia (Mídia entregue pelo banco sintético)');
    expect(relatorio).toHaveTextContent('sigiloso: ordem judicial nº Decisão ID 123456');
    expect(within(relatorio).getByTestId('totais-importacao')).toHaveTextContent('15 linha(s) lida(s): 14 aceita(s), 1 rejeitada(s) e 3 em quarentena.');

    const arquivos = within(relatorio).getAllByTestId('arquivo-importado');
    expect(arquivos.map((a) => within(a).getByRole('rowheader').querySelector('code')?.textContent)).toEqual(['AGENCIAS', 'CONTAS', 'TITULARES', 'EXTRATO', 'ORIGEM_DESTINO']);
    const extrato = arquivos[3];
    // Linhas, aceitas, rejeitadas e em quarentena do EXTRATO.
    expect(within(extrato).getAllByRole('cell').slice(0, 4).map((c) => c.textContent)).toEqual(['8', '7', '1', '2']);
    expect(extrato).toHaveTextContent('EXTRATO.txt');
    const [gravada] = await cliente.listarImportacoesJudiciais('caso-1');
    for (const a of gravada.arquivos) {
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(within(relatorio).getByTitle(a.sha256)).toBeInTheDocument();
    }
    const rejeicoes = within(relatorio).getAllByTestId('rejeicao-importacao');
    expect(rejeicoes).toHaveLength(1);
    expect(rejeicoes[0]).toHaveTextContent('EXTRATO.txt, linha 7, campo DATA_LANCAMENTO: data inválida (esperado ddmmaaaa)');
    expect(gravada).toMatchObject({ origem: 'midia', descricao_origem: 'Mídia entregue pelo banco sintético', importado_por: 'delegado.demo' });
    // A decisão passa a contar a importação.
    await waitFor(() => expect(screen.getByTestId('decisao-judicial')).toHaveTextContent('1 importação(ões)'));
  });

  it('mostra o motivo quando o servidor recusa a pasta (422: sem o marcador SINTETICO)', async () => {
    const { usuario } = renderizarAba();
    await screen.findByText(/Nenhuma decisão judicial registrada neste caso/);
    await preencherDecisao(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Registrar decisão' }));
    await usuario.type(await screen.findByLabelText('Diretório com os arquivos'), 'pasta-real');
    await usuario.click(screen.getByRole('button', { name: 'Importar arquivos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/A importação foi recusada: .*sem o marcador SINTETICO/);
    expect(screen.queryByTestId('relatorio-importacao')).not.toBeInTheDocument();
  });

  it('lista os registros com a marca de sigilo, filtra por tipo e por quarentena, e destaca a quarentena com o motivo', async () => {
    const { usuario } = renderizarAba();
    await screen.findByText(/Nenhuma decisão judicial registrada neste caso/);
    await registrarEImportar(usuario);
    // Nada é consultado antes do pedido: cada consulta fica na auditoria.
    expect(screen.queryByTestId('registro-judicial')).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Consultar registros' }));
    await waitFor(() => expect(screen.getByTestId('total-registros')).toHaveTextContent('14 registro(s)'));
    const todos = screen.getAllByTestId('registro-judicial');
    expect(todos).toHaveLength(14);
    for (const linha of todos) expect(linha).toHaveTextContent('sigiloso: ordem judicial nº Decisão ID 123456');
    expect(todos.filter((l) => l.classList.contains('linha-quarentena'))).toHaveLength(3);

    await usuario.selectOptions(screen.getByLabelText('Tipo de arquivo'), 'EXTRATO');
    await usuario.click(screen.getByRole('button', { name: 'Consultar registros' }));
    await waitFor(() => expect(screen.getByTestId('total-registros')).toHaveTextContent('7 registro(s)'));
    const lancamento = screen.getAllByTestId('registro-judicial')[2];
    expect(lancamento).toHaveTextContent('linha 3');
    expect(lancamento).toHaveTextContent('10/02/2026');
    expect(lancamento).toHaveTextContent(/R\$\s100,00/);
    expect(lancamento).toHaveTextContent('dentro do escopo');
    expect(within(lancamento).queryByTestId('selo-quarentena')).not.toBeInTheDocument();

    await usuario.selectOptions(screen.getByLabelText('Quarentena'), 'true');
    await usuario.click(screen.getByRole('button', { name: 'Consultar registros' }));
    await waitFor(() => expect(screen.getByTestId('total-registros')).toHaveTextContent('2 registro(s)'));
    const quarentena = screen.getAllByTestId('registro-judicial');
    expect(quarentena).toHaveLength(2);
    for (const linha of quarentena) {
      expect(linha).toHaveClass('linha-quarentena');
      expect(within(linha).getByTestId('selo-quarentena')).toHaveTextContent('em quarentena');
    }
    expect(quarentena[0]).toHaveTextContent('Motivo: data 2026-08-15 fora do período da decisão (2026-01-01 a 2026-06-30)');
    expect(quarentena[1]).toHaveTextContent('Motivo: conta 654321 fora das contas autorizadas pela decisão');

    await usuario.selectOptions(screen.getByLabelText('Quarentena'), 'false');
    await usuario.click(screen.getByRole('button', { name: 'Consultar registros' }));
    await waitFor(() => expect(screen.getByTestId('total-registros')).toHaveTextContent('5 registro(s)'));
    expect(screen.queryByTestId('selo-quarentena')).not.toBeInTheDocument();
  });

  it('envia os filtros escolhidos na consulta (decisão, tipo, quarentena, limite e deslocamento) e pagina', async () => {
    const registro = (n: number): RegistroJudicial => ({
      id: `rj-${n}`, importacao_id: 'ij-1', decisao_id: 'dj-1', tipo: 'EXTRATO', linha: n, quarentena: false, motivo_quarentena: '', marca: 'sigiloso: ordem judicial nº 1 (processo 2)', campos: { CODIGO_CHAVE_EXTRATO: String(n) },
    });
    const listarRegistrosJudiciais = vi.fn(async (_casoId: unknown, filtro?: { deslocamento?: number }): Promise<PaginaRegistrosJudiciais> => ({
      total: 120,
      itens: Array.from({ length: 50 }, (_, i) => registro((filtro?.deslocamento ?? 0) + i + 1)),
    }));
    const { usuario } = renderizarAba({ sobrescritas: { listarRegistrosJudiciais } });
    await screen.findByText(/Nenhuma decisão judicial registrada neste caso/);
    await usuario.selectOptions(screen.getByLabelText('Tipo de arquivo'), 'TITULARES');
    await usuario.selectOptions(screen.getByLabelText('Quarentena'), 'false');
    await usuario.click(screen.getByRole('button', { name: 'Consultar registros' }));
    expect(listarRegistrosJudiciais).toHaveBeenLastCalledWith('caso-1', { tipo: 'TITULARES', quarentena: false, limite: 50, deslocamento: 0 });
    expect(await screen.findByTestId('total-registros')).toHaveTextContent('120 registro(s) com os filtros escolhidos; mostrando de 1 a 50.');
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    await usuario.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(listarRegistrosJudiciais).toHaveBeenLastCalledWith('caso-1', { tipo: 'TITULARES', quarentena: false, limite: 50, deslocamento: 50 });
    await waitFor(() => expect(screen.getByTestId('total-registros')).toHaveTextContent('mostrando de 51 a 100'));
  });

  it('RNF04: CPF aparece mascarado nos registros, nos investigados e no motivo da quarentena, mesmo que a API o devolvesse completo', async () => {
    const cpf = cpfSinteticoValido();
    const outro = cpfSinteticoValido();
    const decisao = {
      id: 'dj-1', caso_id: 'caso-1', ...DECISAO_JUDICIAL_DEMO, investigados: [cpf, '90000001000100'], registrado_por: 'delegado.demo', registrado_em: '2026-11-17T12:00:00Z',
      marca: 'sigiloso: ordem judicial nº Decisão ID 123456 (processo 0000000-00.2026.8.07.0001)', importacoes: 1,
    };
    const itens: RegistroJudicial[] = [
      { id: 'rj-1', importacao_id: 'ij-1', decisao_id: 'dj-1', tipo: 'TITULARES', linha: 2, quarentena: false, motivo_quarentena: '', marca: decisao.marca, campos: { CPF_CNPJ_TITULAR: cpf, NOME_TITULAR: 'FULANO FICTICIO DE TAL', NUMERO_CONTA: '123456' } },
      { id: 'rj-2', importacao_id: 'ij-1', decisao_id: 'dj-1', tipo: 'ORIGEM_DESTINO', linha: 5, quarentena: true, motivo_quarentena: `titular de CPF ${pontuado(outro)} fora do escopo`, marca: decisao.marca, campos: { CPF_CNPJ_OD: '90100001000100', OBSERVACAO: `repasse a ${outro}` } },
    ];
    const { usuario } = renderizarAba({
      sobrescritas: { listarDecisoesJudiciais: vi.fn(async () => [decisao]), listarRegistrosJudiciais: vi.fn(async () => ({ total: 2, itens })) },
    });
    const linhaDecisao = await screen.findByTestId('decisao-judicial');
    expect(linhaDecisao).toHaveTextContent(`Investigados: ${mascarado(cpf)}, 90000001000100`);
    await usuario.click(screen.getByRole('button', { name: 'Consultar registros' }));
    const registros = await screen.findAllByTestId('registro-judicial');
    expect(registros[0]).toHaveTextContent(mascarado(cpf));
    expect(registros[1]).toHaveTextContent(`Motivo: titular de CPF ${mascarado(outro)} fora do escopo`);
    expect(registros[1]).toHaveTextContent(`repasse a ${mascarado(outro)}`);
    // O CNPJ não é alterado.
    expect(registros[1]).toHaveTextContent('90100001000100');
    for (const numero of [cpf, outro, pontuado(cpf), pontuado(outro)]) expect(document.body.textContent).not.toContain(numero);
  });

  it('RNF04: valorDoCampoJudicial descaracteriza CPF em campo de documento e formata data e valor', () => {
    const cpf = cpfSinteticoValido();
    expect(valorDoCampoJudicial('CPF_CNPJ_TITULAR', cpf)).toBe(mascarado(cpf));
    // Em campo de documento, 11 dígitos são CPF mesmo com os verificadores errados.
    expect(valorDoCampoJudicial('NUMERO_DOCUMENTO', '12345678900')).toBe('***456789**');
    expect(valorDoCampoJudicial('CPF_CNPJ_TITULAR', '***123456**')).toBe('***123456**');
    expect(valorDoCampoJudicial('CPF_CNPJ_TITULAR', '90000001000100')).toBe('90000001000100');
    expect(valorDoCampoJudicial('DATA_LANCAMENTO', '2026-02-10')).toBe('10/02/2026');
    expect(valorDoCampoJudicial('VALOR_LANCAMENTO', 100)).toMatch(/^R\$\s100,00$/);
    expect(valorDoCampoJudicial('NUMERO_CONTA', '123456')).toBe('123456');
  });

  it('RNF02: abrir a aba, registrar, importar e consultar ficam na auditoria, com a justificativa', async () => {
    const { usuario, cliente } = renderizarAba();
    await screen.findByText(/Nenhuma decisão judicial registrada neste caso/);
    await registrarEImportar(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Consultar registros' }));
    await screen.findByTestId('total-registros');
    const entradas = (await cliente.listarAuditoria('caso-1')).filter((e) => e.acao.startsWith('importacao_judicial.'));
    const acoes = new Set(entradas.map((e) => e.acao));
    for (const acao of ['decisoes_listar', 'importacoes_listar', 'decisao_registrar', 'importar', 'registros_listar']) {
      expect(acoes.has(`importacao_judicial.${acao}`)).toBe(true);
    }
    expect(entradas.every((e) => e.usuario === 'delegado.demo' && e.justificativa === 'IP 0001/2026 — afastamento de sigilo')).toBe(true);
  });
});
