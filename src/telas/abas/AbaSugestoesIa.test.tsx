import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErroApi, type ApiCliente, type ExtracaoIa, type IaEstado, type PapelCaso, type ProgressoExtracaoIa, type SugestaoIa, type TextoCaptura } from '../../api';
import { TEXTOS_CAPTURA_DEMO } from '../../api/dadosSinteticos';
import { PapelProvider, papelNoCaso } from '../../sessao/PapelContext';
import { SessaoProvider } from '../../sessao/SessaoContext';
import { clienteFalso } from '../../test/clienteFalso';
import { AbaSugestoesIa, DocumentoComTrecho, formatarDuracao, rotuloCausaIa, rotuloExecucaoIa } from './AbaSugestoesIa';

const IA_ATIVA: IaEstado = { ativa: true, provedor: 'simulado', modelo: 'modelo-sintetico-de-demonstracao', local: true, tipos: ['empresa', 'orgao', 'pessoa', 'valor', 'data', 'objeto'] };
const IA_DESLIGADA: IaEstado = { ativa: false, provedor: null, modelo: null, local: true, tipos: [] };

function renderizar(opcoes: { ia?: IaEstado | null; cliente?: ApiCliente; papel?: PapelCaso; capturaInicial?: string } = {}) {
  const usuario = userEvent.setup();
  const cliente = opcoes.cliente ?? clienteFalso();
  const aoMudar = vi.fn();
  const aoAbrirEntidade = vi.fn();
  const resultado = render(
    <SessaoProvider cliente={cliente}>
      <PapelProvider value={papelNoCaso(opcoes.papel ?? 'investigador')}>
        <AbaSugestoesIa
          casoId="caso-1"
          ia={opcoes.ia === undefined ? IA_ATIVA : opcoes.ia}
          capturaInicial={opcoes.capturaInicial}
          aoMudar={aoMudar}
          aoAbrirEntidade={aoAbrirEntidade}
          intervaloAndamentoMs={5}
        />
      </PapelProvider>
    </SessaoProvider>,
  );
  return { usuario, cliente, aoMudar, aoAbrirEntidade, desmontar: resultado.unmount };
}

const cartao = (valor: string) => screen.getAllByTestId('sugestao-ia').find((c) => c.textContent?.includes(valor))!;

describe('AbaSugestoesIa — revisão lado a lado (RF13, RNF05, H22)', () => {
  it('deixa explícito que é sugestão de IA local e que nada vira entidade sem decisão humana', async () => {
    renderizar();
    expect(screen.getByText('Sugestões de IA local, não conclusões.')).toBeInTheDocument();
    expect(screen.getByText('Nada vira entidade sem a decisão de um investigador')).toBeInTheDocument();
    expect(screen.getByText(/O documento não sai do servidor/)).toBeInTheDocument();
    const estado = screen.getByTestId('estado-ia');
    expect(estado).toHaveTextContent('IA local ativa');
    expect(estado).toHaveTextContent('modelo-sintetico-de-demonstracao');
    await screen.findAllByTestId('sugestao-ia');
  });

  it('lista as sugestões pendentes com tipo, valor, campos, confiança (quando houver), modelo e situação', async () => {
    renderizar();
    const sugestoes = await screen.findAllByTestId('sugestao-ia');
    expect(sugestoes).toHaveLength(6);
    expect(screen.getByTestId('resumo-sugestoes')).toHaveTextContent('6 pendentes de decisão · 0 aceitas · 0 recusadas');

    const empresa = cartao('TETA SERVICOS SINTETICA LTDA');
    expect(within(empresa).getByText('empresa')).toBeInTheDocument();
    expect(within(empresa).getByText('pendente de decisão')).toBeInTheDocument();
    expect(empresa).toHaveTextContent('cnpj90.000.004/0001-62');
    expect(empresa).toHaveTextContent('papelatual prestadora');
    expect(empresa).toHaveTextContent('Sugestão de IA · modelo modelo-sintetico-de-demonstracao (simulado)');
    expect(empresa).toHaveTextContent('confiança declarada pelo modelo: 88%');
    expect(empresa).toHaveTextContent('captura cap-10');
    expect(cartao('15/03/2026')).toHaveTextContent('o modelo não declarou confiança');
    expect(within(cartao('PREFEITURA SINTETICA DE EXEMPLOPOLIS')).getByText('órgão')).toBeInTheDocument();
    // Antes de escolher uma sugestão, o painel do documento só orienta.
    expect(screen.getByText('Escolha uma sugestão para ver o trecho citado no texto do documento.')).toBeInTheDocument();
    expect(screen.queryByTestId('trecho-destacado')).not.toBeInTheDocument();
  });

  it('ao escolher uma sugestão, mostra o texto do documento com o trecho citado em destaque e rola até ele', async () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;
    try {
      const { usuario } = renderizar();
      await screen.findAllByTestId('sugestao-ia');
      await usuario.click(within(cartao('TETA SERVICOS SINTETICA LTDA')).getByRole('button', { name: 'Ver o trecho no documento' }));

      const destaque = await screen.findByTestId('trecho-destacado');
      expect(destaque.tagName).toBe('MARK');
      expect(destaque).toHaveTextContent('A atual prestadora dos serviços é TETA SERVICOS SINTETICA LTDA, CNPJ 90.000.004/0001-62.');
      // O documento inteiro está lá, como texto, com o destaque no lugar certo.
      const documento = screen.getByLabelText('Texto do documento');
      expect(documento.tagName).toBe('PRE');
      expect(documento.textContent).toBe(TEXTOS_CAPTURA_DEMO['cap-10']);
      expect(documento.textContent!.indexOf(destaque.textContent!)).toBe(TEXTOS_CAPTURA_DEMO['cap-10'].indexOf('A atual prestadora'));
      expect(documento.querySelectorAll('mark')).toHaveLength(1);
      expect(rolar).toHaveBeenCalledWith({ block: 'center' });
      expect(screen.getByTestId('documento-ia')).toHaveTextContent('Captura cap-10');
      expect(within(cartao('TETA SERVICOS SINTETICA LTDA')).getByRole('button', { name: 'Trecho em destaque no documento' })).toHaveAttribute('aria-pressed', 'true');

      // Outra sugestão da mesma captura: o destaque muda e o texto não é buscado de novo.
      rolar.mockClear();
      await usuario.click(within(cartao('R$ 480.000,00')).getByRole('button', { name: 'Ver o trecho no documento' }));
      await waitFor(() => expect(screen.getByTestId('trecho-destacado')).toHaveTextContent('O valor estimado da contratação é de R$ 480.000,00'));
      expect(rolar).toHaveBeenCalled();
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('o trecho que atravessa linhas é destacado inteiro', async () => {
    const { usuario } = renderizar();
    await screen.findAllByTestId('sugestao-ia');
    await usuario.click(within(cartao('PREFEITURA SINTETICA DE EXEMPLOPOLIS')).getByRole('button', { name: 'Ver o trecho no documento' }));
    const destaque = await screen.findByTestId('trecho-destacado');
    expect(destaque.textContent).toBe('PREFEITURA SINTETICA DE EXEMPLOPOLIS\nCNPJ 90.100.001/0001-00');
  });

  it('aceitar ou recusar exige justificativa; a decisão aparece no cartão e atualiza o resumo', async () => {
    const { usuario, cliente, aoMudar, aoAbrirEntidade } = renderizar();
    await screen.findAllByTestId('sugestao-ia');
    // O formulário de decisão só aparece na sugestão escolhida (com o trecho à vista).
    expect(screen.queryByRole('button', { name: 'Aceitar sugestão' })).not.toBeInTheDocument();
    await usuario.click(within(cartao('TETA SERVICOS SINTETICA LTDA')).getByRole('button', { name: 'Ver o trecho no documento' }));
    const aceitar = screen.getByRole('button', { name: 'Aceitar sugestão' });
    const recusar = screen.getByRole('button', { name: 'Recusar sugestão' });
    expect(aceitar).toBeDisabled();
    expect(recusar).toBeDisabled();
    await usuario.type(screen.getByLabelText('Justificativa da decisão (obrigatória)'), '...');
    expect(aceitar).toBeDisabled(); // pontuação não é justificativa
    await usuario.clear(screen.getByLabelText('Justificativa da decisão (obrigatória)'));
    await usuario.type(screen.getByLabelText('Justificativa da decisão (obrigatória)'), 'Trecho confere com o item 4.1 do edital.');
    await usuario.click(aceitar);

    await waitFor(() => expect(screen.getByTestId('resumo-sugestoes')).toHaveTextContent('5 pendentes de decisão · 1 aceita · 0 recusadas'));
    expect(aoMudar).toHaveBeenCalled();
    // A lista mostra só as pendentes por padrão: a aceita sai dela.
    expect(screen.getAllByTestId('sugestao-ia')).toHaveLength(5);
    await usuario.selectOptions(screen.getByLabelText('Situação das sugestões'), 'aceita');
    const aceita = screen.getByTestId('sugestao-ia');
    expect(within(aceita).getByTestId('decisao-ia')).toHaveTextContent('Aceita por analista.demo');
    expect(within(aceita).getByTestId('decisao-ia')).toHaveTextContent('Justificativa: Trecho confere com o item 4.1 do edital.');
    expect(within(aceita).queryByRole('button', { name: 'Aceitar sugestão' })).not.toBeInTheDocument();
    await usuario.click(within(aceita).getByRole('button', { name: 'emp-5' }));
    expect(aoAbrirEntidade).toHaveBeenCalledWith('emp-5');

    // Recusar outra, e conferir o que ficou no servidor e na auditoria.
    await usuario.selectOptions(screen.getByLabelText('Situação das sugestões'), 'pendente');
    await usuario.click(within(cartao('15/03/2026')).getByRole('button', { name: 'Ver o trecho no documento' }));
    await usuario.type(screen.getByLabelText('Justificativa da decisão (obrigatória)'), 'É a data da sessão, não a do contrato.');
    await usuario.click(screen.getByRole('button', { name: 'Recusar sugestão' }));
    await waitFor(() => expect(screen.getByTestId('resumo-sugestoes')).toHaveTextContent('4 pendentes de decisão · 1 aceita · 1 recusada'));
    const noServidor = await cliente.listarSugestoesIa('caso-1');
    expect(noServidor.filter((s) => s.situacao !== 'pendente').map((s) => [s.tipo, s.situacao, s.entidade_id])).toEqual([
      ['data', 'recusada', null],
      ['empresa', 'aceita', 'emp-5'],
    ]);
    expect((await cliente.listarAuditoria('caso-1')).filter((e) => e.acao === 'ia.sugestao_decidir')).toHaveLength(2);
  });

  it('a recusa do back-end na decisão (409, já decidida) aparece junto do formulário', async () => {
    const decidirSugestaoIa = vi.fn(async () => {
      throw new ErroApi(409, '/casos/caso-1/sugestoes-ia/sug-2/decisao', 'Esta sugestão já foi decidida (aceita).');
    });
    const { usuario } = renderizar({ cliente: clienteFalso({ decidirSugestaoIa }) });
    await screen.findAllByTestId('sugestao-ia');
    await usuario.click(within(cartao('R$ 480.000,00')).getByRole('button', { name: 'Ver o trecho no documento' }));
    await usuario.type(screen.getByLabelText('Justificativa da decisão (obrigatória)'), 'Valor confere.');
    await usuario.click(screen.getByRole('button', { name: 'Aceitar sugestão' }));
    expect(await within(cartao('R$ 480.000,00')).findByRole('alert')).toHaveTextContent('Esta sugestão já foi decidida (aceita).');
    expect(decidirSugestaoIa).toHaveBeenCalledWith('caso-1', expect.anything(), { decisao: 'aceita', justificativa: 'Valor confere.' });
  });

  it('mostra as execuções com modelo, versão, parâmetros e os itens recusados automaticamente, com o motivo', async () => {
    renderizar();
    const execucao = await screen.findByTestId('execucao-ia');
    expect(execucao).toHaveAttribute('open');
    expect(execucao).toHaveTextContent('ext-1');
    expect(execucao).toHaveTextContent('6 sugestões, 2 recusados automaticamente');
    expect(execucao).toHaveTextContent('modelo-sintetico-de-demonstracao');
    expect(execucao).toHaveTextContent('sintetico-0');
    expect(within(execucao).getByText('temperature')).toBeInTheDocument();
    expect(within(execucao).getByRole('heading', { name: 'Itens recusados automaticamente (2)' })).toBeInTheDocument();
    const recusas = within(execucao).getAllByTestId('recusa-ia');
    expect(recusas).toHaveLength(2);
    expect(recusas[0]).toHaveTextContent('o trecho citado não está, literal, no documento');
    expect(recusas[0]).toHaveTextContent('trecho_nao_literal');
    expect(recusas[0]).toHaveTextContent('OMEGA INEXISTENTE SINTETICA LTDA');
    expect(recusas[1]).toHaveTextContent('o valor não aparece no trecho citado');
    expect(recusas[1]).toHaveTextContent('R$ 900.000,00');
    // O que foi recusado automaticamente nunca aparece como sugestão.
    expect(screen.getAllByTestId('sugestao-ia').some((c) => c.textContent?.includes('OMEGA INEXISTENTE'))).toBe(false);
  });

  it('"Extrair com IA" põe a extração na fila e acompanha: as sugestões aparecem conforme os blocos terminam', async () => {
    const { usuario, cliente, aoMudar } = renderizar({ capturaInicial: 'cap-10' });
    await screen.findAllByTestId('sugestao-ia');
    expect(screen.getByLabelText('Captura do documento')).toHaveValue('cap-10');
    expect(screen.queryByTestId('andamento-extracao')).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Extrair com IA' }));

    // O painel de andamento aparece logo, e a execução termina sozinha (o simulado conclui um bloco por consulta).
    const painel = await screen.findByTestId('andamento-extracao');
    expect(screen.getByText(/A extração roda em segundo plano no servidor/)).toBeInTheDocument();
    await waitFor(() => expect(within(painel).getByTestId('andamento-resumo')).toHaveTextContent('Blocos concluídos: 3 de 3'));
    expect(within(painel).getByText(/Extração concluída: todos os blocos do documento foram processados/)).toBeInTheDocument();
    expect(within(painel).getByText('concluída')).toBeInTheDocument();
    expect(within(painel).getByTestId('andamento-tempo')).toHaveTextContent('Tempo de processamento: 2 min 00 s · 6 sugestões até agora, 2 itens recusados automaticamente');
    await waitFor(() => expect(screen.getAllByTestId('sugestao-ia')).toHaveLength(12));
    expect(await screen.findAllByTestId('execucao-ia')).toHaveLength(2);
    await waitFor(() => expect(screen.getAllByTestId('execucao-ia')[0]).toHaveTextContent('concluída · 6 sugestões, 2 recusados automaticamente'));
    expect(aoMudar).toHaveBeenCalled();
    expect((await cliente.listarAuditoria('caso-1')).some((e) => e.acao === 'ia.extrair')).toBe(true);
    // Nenhuma entidade nasceu da extração.
    expect((await cliente.buscarEntidades('caso-1', 'FULANO')).length).toBe(0);
    // Terminada a execução, o botão volta e o aviso pode ser fechado.
    expect(screen.getByRole('button', { name: 'Extrair com IA' })).toBeEnabled();
    await usuario.click(within(painel).getByRole('button', { name: 'Fechar este aviso' }));
    expect(screen.queryByTestId('andamento-extracao')).not.toBeInTheDocument();
  });

  it('o pedido recusado (409) aparece como erro e nada passa a ser acompanhado', async () => {
    const base = clienteFalso();
    const listarExtracoesIa = vi.fn(() => base.listarExtracoesIa('caso-1'));
    const extrairComIa = vi.fn(async () => {
      throw new ErroApi(409, '/casos/caso-1/capturas/cap-10/extracao-ia', 'Já existe uma extração em andamento ou na fila para este documento (ext-9).');
    });
    const progressoExtracaoIa = vi.fn();
    const { usuario } = renderizar({ cliente: clienteFalso({ extrairComIa, listarExtracoesIa, progressoExtracaoIa }) });
    await screen.findAllByTestId('sugestao-ia');
    await usuario.click(screen.getByRole('button', { name: 'Extrair com IA' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma extração em andamento ou na fila para este documento (ext-9)');
    expect(extrairComIa).toHaveBeenCalledWith('caso-1', 'cap-10');
    expect(screen.queryByTestId('andamento-extracao')).not.toBeInTheDocument();
    expect(progressoExtracaoIa).not.toHaveBeenCalled();
    expect(listarExtracoesIa).toHaveBeenCalledTimes(2);
  });

  it('com a IA desligada no servidor, diz isso e não oferece o botão de extrair; as sugestões já registradas continuam', async () => {
    renderizar({ ia: IA_DESLIGADA, cliente: clienteFalso({}, 'teste automatizado', { iaAtiva: false }) });
    expect(screen.getByText('A extração por IA está desligada neste servidor.')).toBeInTheDocument();
    expect(screen.getByTestId('estado-ia')).not.toHaveTextContent('IA local ativa');
    expect(screen.queryByRole('button', { name: 'Extrair com IA' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Captura do documento')).not.toBeInTheDocument();
    expect(await screen.findAllByTestId('sugestao-ia')).toHaveLength(6);
  });

  it('enquanto o estado da IA não chegou, não oferece a extração', () => {
    renderizar({ ia: null });
    expect(screen.getByText('Consultando o estado da IA…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Extrair com IA' })).not.toBeInTheDocument();
  });

  it('o leitor revisa, mas não extrai nem decide: controles desabilitados, com a explicação', async () => {
    const { usuario } = renderizar({ papel: 'leitor', cliente: clienteFalso({}, 'teste automatizado', { token: 'dev-agente' }) });
    await screen.findAllByTestId('sugestao-ia');
    expect(screen.getByRole('button', { name: 'Extrair com IA' })).toBeDisabled();
    expect(screen.getByTestId('ia-somente-leitura')).toHaveTextContent('Seu papel neste caso é leitor');
    await usuario.click(within(cartao('R$ 480.000,00')).getByRole('button', { name: 'Ver o trecho no documento' }));
    expect(await screen.findByTestId('trecho-destacado')).toBeInTheDocument();
    expect(screen.getByLabelText('Justificativa da decisão (obrigatória)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Aceitar sugestão' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Recusar sugestão' })).toBeDisabled();
  });
});

describe('DocumentoComTrecho — o texto do documento', () => {
  const sugestao = (parcial: Partial<SugestaoIa>): SugestaoIa => ({
    id: 's1',
    extracao_id: 'e1',
    captura_id: 'c1',
    captura_sha256: 'a'.repeat(64),
    tipo: 'empresa',
    valor: 'EMPRESA FICTICIA LTDA',
    campos: {},
    trecho: 'EMPRESA FICTICIA LTDA',
    posicao_inicio: 0,
    posicao_fim: 0,
    confianca: null,
    situacao: 'pendente',
    decidido_por: null,
    decidido_em: null,
    justificativa_decisao: null,
    entidade_id: null,
    modelo: 'modelo-sintetico',
    provedor: 'simulado',
    ...parcial,
  });
  const texto = (conteudo: string, parcial: Partial<TextoCaptura> = {}): TextoCaptura => ({
    captura_id: 'c1',
    sha256: 'a'.repeat(64),
    codificacao: 'utf-8',
    caracteres: Array.from(conteudo).length,
    truncado: false,
    texto: conteudo,
    ...parcial,
  });

  it('localiza o trecho com a posição em pontos de código, mesmo com emoji antes (UTF-16 conta diferente)', () => {
    const conteudo = '📄📄 Contrato sintético 𝐀: a contratada é EMPRESA FICTICIA LTDA, e EMPRESA FICTICIA LTDA assina.';
    const indice = conteudo.indexOf('EMPRESA FICTICIA LTDA');
    const pontos = Array.from(conteudo.slice(0, indice)).length;
    expect(pontos).not.toBe(indice);
    render(<DocumentoComTrecho sugestao={sugestao({ posicao_inicio: pontos })} texto={texto(conteudo)} />);
    const documento = screen.getByLabelText('Texto do documento');
    expect(documento.textContent).toBe(conteudo);
    const destaque = screen.getByTestId('trecho-destacado');
    expect(destaque).toHaveTextContent('EMPRESA FICTICIA LTDA');
    // É a primeira ocorrência (a da posição informada), não a segunda.
    expect(documento.firstChild?.textContent).toBe(conteudo.slice(0, indice));
    expect(screen.queryByText(/localizado pelo conteúdo/)).not.toBeInTheDocument();
  });

  it('posição errada: localiza pelo conteúdo e avisa; trecho ausente: avisa e não destaca nada', () => {
    const conteudo = 'Linha um.\nA contratada é EMPRESA FICTICIA LTDA.\n';
    const { unmount } = render(<DocumentoComTrecho sugestao={sugestao({ posicao_inicio: 3 })} texto={texto(conteudo)} />);
    expect(screen.getByTestId('trecho-destacado')).toHaveTextContent('EMPRESA FICTICIA LTDA');
    expect(screen.getByText(/O trecho foi localizado pelo conteúdo: não estava na posição registrada \(3\)/)).toBeInTheDocument();
    unmount();

    render(<DocumentoComTrecho sugestao={sugestao({ trecho: 'trecho que o modelo inventou' })} texto={texto(conteudo, { truncado: true })} />);
    expect(screen.queryByTestId('trecho-destacado')).not.toBeInTheDocument();
    expect(screen.getByText(/O trecho citado não foi encontrado no texto exibido \(o texto está cortado\)/)).toBeInTheDocument();
    expect(screen.getByText(/Não aceite a sugestão sem conferir o/)).toBeInTheDocument();
    expect(screen.getByText(/O texto foi cortado no limite do servidor/)).toBeInTheDocument();
    expect(screen.getByLabelText('Texto do documento').textContent).toBe(conteudo);
  });

  it('renderiza o documento como texto: marcação HTML do documento não vira elemento', () => {
    const conteudo = '<script>alert(1)</script><img src=x onerror=alert(2)> EMPRESA FICTICIA LTDA <b>negrito</b>';
    const { container } = render(<DocumentoComTrecho sugestao={sugestao({ posicao_inicio: conteudo.indexOf('EMPRESA') })} texto={texto(conteudo)} />);
    const documento = screen.getByLabelText('Texto do documento');
    expect(documento.textContent).toBe(conteudo);
    expect(container.querySelector('script, img, b')).toBeNull();
    expect(documento.querySelectorAll('*')).toHaveLength(1); // só o <mark> do destaque
  });

  it('descaracteriza CPF no documento (RNF04) sem perder o destaque, e avisa quando o SHA-256 da captura mudou', () => {
    const conteudo = 'Pregoeiro: FULANO FICTICIO, CPF 000.666.666-00. Contratada: EMPRESA FICTICIA LTDA.';
    render(
      <DocumentoComTrecho sugestao={sugestao({ posicao_inicio: conteudo.indexOf('EMPRESA'), captura_sha256: 'b'.repeat(64) })} texto={texto(conteudo)} />,
    );
    const documento = screen.getByLabelText('Texto do documento');
    expect(documento.textContent).toBe('Pregoeiro: FULANO FICTICIO, CPF ***666666**. Contratada: EMPRESA FICTICIA LTDA.');
    expect(screen.getByTestId('trecho-destacado')).toHaveTextContent('EMPRESA FICTICIA LTDA');
    expect(screen.getByRole('alert')).toHaveTextContent('O SHA-256 desta captura não é o da captura usada na extração');
  });
});

// ---- Andamento da extração em segundo plano ---------------------------------

function progresso(parcial: Partial<ProgressoExtracaoIa> = {}): ProgressoExtracaoIa {
  return {
    id: 'ext-9',
    captura_id: 'cap-10',
    situacao: 'em_andamento',
    motivo: '',
    ativa: true,
    retomavel: false,
    cancelamento_pedido: false,
    posicao_na_fila: null,
    blocos_total: 4,
    blocos_concluidos: 0,
    blocos_falhos: 0,
    blocos_pendentes: 4,
    bloco_atual: 1,
    itens_recebidos: 0,
    itens_aceitos: 0,
    itens_recusados: 0,
    tempo_decorrido_ms: 0,
    estimativa_restante_ms: null,
    retomadas: 0,
    iniciado_em: '2026-11-18T12:00:00Z',
    concluido_em: null,
    blocos: [],
    ...parcial,
  };
}

/** Blocos de um andamento: uma letra por bloco (c: concluído, f: falho, a: em andamento, p: pendente). */
function blocos(letras: string, causas: Record<number, string> = {}): ProgressoExtracaoIa['blocos'] {
  const situacoes: Record<string, string> = { c: 'concluido', f: 'falho', a: 'em_andamento', p: 'pendente' };
  return [...letras].map((letra, i) => ({
    numero: i + 1,
    situacao: situacoes[letra],
    caracteres: 3000,
    tentativas: letra === 'p' ? 0 : 1,
    causa: causas[i + 1] ?? '',
    duracao_ms: letra === 'c' ? 95_000 : 0,
    pai_numero: null,
  }));
}

function emAndamento(letras: string, extra: Partial<ProgressoExtracaoIa> = {}, causas: Record<number, string> = {}): ProgressoExtracaoIa {
  const conta = (letra: string) => [...letras].filter((l) => l === letra).length;
  return progresso({
    blocos: blocos(letras, causas),
    blocos_total: letras.length,
    blocos_concluidos: conta('c'),
    blocos_falhos: conta('f'),
    blocos_pendentes: conta('p') + conta('a'),
    bloco_atual: letras.includes('a') ? letras.indexOf('a') + 1 : null,
    ...extra,
  });
}

function parada(situacao: string, letras: string, extra: Partial<ProgressoExtracaoIa> = {}, causas: Record<number, string> = {}): ProgressoExtracaoIa {
  return emAndamento(letras, { situacao, ativa: false, retomavel: situacao !== 'sucesso', bloco_atual: null, concluido_em: '2026-11-18T12:30:00Z', ...extra }, causas);
}

/** Execução como a lista de execuções a devolve, com o andamento dado. */
function execucao(p: ProgressoExtracaoIa): ExtracaoIa {
  return {
    id: p.id,
    captura_id: p.captura_id,
    captura_sha256: 'a'.repeat(64),
    provedor: 'simulado',
    modelo: 'modelo-sintetico-de-demonstracao',
    modelo_versao: 'sintetico-0',
    servidor_versao: '0.0.0-simulado',
    parametros: {},
    prompt_sha256: 'b'.repeat(64),
    situacao: p.situacao,
    motivo: p.motivo,
    blocos: p.blocos_total,
    itens_recebidos: p.itens_recebidos,
    itens_aceitos: p.itens_aceitos,
    itens_recusados: p.itens_recusados,
    recusas: [],
    usuario: 'analista.demo',
    iniciado_em: p.iniciado_em,
    concluido_em: p.concluido_em,
    progresso: p,
    sugestoes: [],
  };
}

/** Cliente em que o pedido devolve `inicial` e cada consulta do andamento devolve o próximo passo (o último se repete). */
function clienteComRoteiro(inicial: ProgressoExtracaoIa, passos: (ProgressoExtracaoIa | Error)[], sobrescritas: Partial<ApiCliente> = {}) {
  let chamada = 0;
  const progressoExtracaoIa = vi.fn(async () => {
    const passo = passos[Math.min(chamada++, passos.length - 1)];
    if (passo instanceof Error) throw passo;
    return passo;
  });
  const extrairComIa = vi.fn(async () => execucao(inicial));
  return { cliente: clienteFalso({ extrairComIa, progressoExtracaoIa, ...sobrescritas }), progressoExtracaoIa, extrairComIa };
}

async function iniciar(cliente: ApiCliente, opcoes: { papel?: PapelCaso } = {}) {
  const tela = renderizar({ cliente, capturaInicial: 'cap-10', ...opcoes });
  await screen.findAllByTestId('sugestao-ia');
  await tela.usuario.click(screen.getByRole('button', { name: 'Extrair com IA' }));
  return { ...tela, painel: await screen.findByTestId('andamento-extracao') };
}

describe('AbaSugestoesIa — andamento da extração em segundo plano', () => {
  it('na fila, mostra a posição e uma barra indeterminada; em andamento, a barra por bloco, o tempo e a estimativa', async () => {
    const fila = progresso({ situacao: 'na_fila', posicao_na_fila: 2, blocos_total: 0, blocos_pendentes: 0, bloco_atual: null });
    const meio = emAndamento('ccap', { itens_aceitos: 5, tempo_decorrido_ms: 190_000, estimativa_restante_ms: 185_000 });
    const { cliente } = clienteComRoteiro(fila, [fila, fila, emAndamento('appp'), meio]);
    const { painel } = await iniciar(cliente);

    expect(within(painel).getByTestId('andamento-resumo')).toHaveTextContent('Na fila (posição 2). O servidor processa um documento por vez.');
    expect(within(painel).getByText('na fila')).toBeInTheDocument();
    const barra = within(painel).getByRole('progressbar');
    expect(barra).not.toHaveAttribute('value');
    expect(barra).toHaveAccessibleName(/Na fila/);

    await waitFor(() => expect(within(painel).getByTestId('andamento-resumo')).toHaveTextContent('Blocos concluídos: 2 de 4'));
    expect(barra).toHaveAttribute('value', '2');
    expect(barra).toHaveAttribute('max', '4');
    expect(within(painel).getByText('em andamento')).toBeInTheDocument();
    expect(within(painel).getByTestId('andamento-tempo')).toHaveTextContent('Tempo de processamento: 3 min 10 s · faltam cerca de 3 min 05 s · 5 sugestões até agora');
    // Um quadrinho por bloco, com a situação escrita (a cor só reforça).
    const quadrinhos = within(painel).getAllByTestId('andamento-bloco');
    expect(quadrinhos.map((q) => q.className.replace('andamento-bloco ', ''))).toEqual([
      'andamento-bloco-concluido',
      'andamento-bloco-concluido',
      'andamento-bloco-em_andamento',
      'andamento-bloco-pendente',
    ]);
    expect(quadrinhos[0]).toHaveTextContent('Bloco 1: concluído, 1 min 35 s');
    expect(quadrinhos[2]).toHaveTextContent('Bloco 3: em andamento');
    expect(quadrinhos[3]).toHaveTextContent('Bloco 4: aguardando');
    // Enquanto roda, o documento não aceita outro pedido, e isso é dito.
    expect(screen.getByRole('button', { name: 'Extrair com IA' })).toBeDisabled();
    expect(screen.getByTestId('ia-documento-ocupado')).toHaveTextContent('Este documento já tem uma extração em andamento');
    expect(within(painel).queryByRole('button', { name: 'Retomar extração' })).not.toBeInTheDocument();
  });

  it('antes do primeiro bloco concluído, diz que a estimativa ainda não existe', async () => {
    const { cliente } = clienteComRoteiro(emAndamento('appp'), [emAndamento('appp', { tempo_decorrido_ms: 42_000 })]);
    const { painel } = await iniciar(cliente);
    await waitFor(() => expect(within(painel).getByTestId('andamento-tempo')).toHaveTextContent('Tempo de processamento: 42 s · estimativa depois do primeiro bloco · 0 sugestões até agora'));
    expect(within(painel).getByTestId('andamento-resumo')).toHaveTextContent('Blocos concluídos: 0 de 4');
  });

  it('a lista de sugestões é recarregada só quando um bloco termina, e a tela continua utilizável durante a extração', async () => {
    const base = clienteFalso();
    const listarSugestoesIa = vi.fn(() => base.listarSugestoesIa('caso-1'));
    const um = emAndamento('capp', { itens_aceitos: 2 });
    const { cliente, progressoExtracaoIa } = clienteComRoteiro(emAndamento('appp'), [emAndamento('appp'), emAndamento('appp'), um, um, um], { listarSugestoesIa });
    const { usuario, painel } = await iniciar(cliente);
    expect(listarSugestoesIa).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(within(painel).getByTestId('andamento-resumo')).toHaveTextContent('Blocos concluídos: 1 de 4'));
    await waitFor(() => expect(listarSugestoesIa).toHaveBeenCalledTimes(2));
    // Várias consultas do andamento depois, sem bloco novo: nenhuma outra consulta das sugestões (que é auditada).
    const consultas = progressoExtracaoIa.mock.calls.length;
    await waitFor(() => expect(progressoExtracaoIa.mock.calls.length).toBeGreaterThan(consultas + 3));
    expect(listarSugestoesIa).toHaveBeenCalledTimes(2);
    // Com a extração em andamento, o investigador revisa e decide normalmente.
    await usuario.click(within(cartao('R$ 480.000,00')).getByRole('button', { name: 'Ver o trecho no documento' }));
    expect(await screen.findByTestId('trecho-destacado')).toHaveTextContent('R$ 480.000,00');
    await usuario.type(screen.getByLabelText('Justificativa da decisão (obrigatória)'), 'Valor confere com o edital');
    await usuario.click(screen.getByRole('button', { name: 'Aceitar sugestão' }));
    await waitFor(() => expect(screen.getByTestId('resumo-sugestoes')).toHaveTextContent('5 pendentes de decisão · 1 aceita · 0 recusadas'));
    expect(within(painel).getByText('em andamento')).toBeInTheDocument();
  });

  it('cancelar pede a parada, mostra o pedido e depois a execução cancelada, que pode ser retomada', async () => {
    const meio = emAndamento('capp', { itens_aceitos: 2 });
    const pedido = { ...meio, cancelamento_pedido: true };
    const cancelada = parada('cancelada', 'cppp', { itens_aceitos: 2, motivo: 'Cancelada por analista.demo.' });
    const cancelarExtracaoIa = vi.fn(async () => pedido);
    const retomarExtracaoIa = vi.fn(async () => emAndamento('cppp', { situacao: 'na_fila', posicao_na_fila: 1, bloco_atual: null, retomadas: 1 }));
    const { cliente, progressoExtracaoIa } = clienteComRoteiro(meio, [meio], { cancelarExtracaoIa, retomarExtracaoIa });
    const { usuario, painel } = await iniciar(cliente);

    await usuario.click(within(painel).getByRole('button', { name: 'Cancelar extração' }));
    expect(cancelarExtracaoIa).toHaveBeenCalledWith('caso-1', 'ext-9');
    progressoExtracaoIa.mockImplementation(async () => cancelada);
    await waitFor(() => expect(within(painel).getByText('Extração cancelada.')).toBeInTheDocument());
    expect(within(painel).getByText('cancelada')).toBeInTheDocument();
    expect(within(painel).getByTestId('andamento-resumo')).toHaveTextContent('Blocos concluídos: 1 de 4 · por fazer: 3');
    expect(within(painel).queryByRole('button', { name: /Cancelar/ })).not.toBeInTheDocument();
    // O documento fica livre de novo.
    expect(screen.getByRole('button', { name: 'Extrair com IA' })).toBeEnabled();

    // A execução parada não é mais consultada; a retomada volta a consultar.
    progressoExtracaoIa.mockImplementation(async () => parada('sucesso', 'cccc', { itens_aceitos: 8, retomadas: 1 }));
    await usuario.click(within(painel).getByRole('button', { name: 'Retomar extração' }));
    expect(retomarExtracaoIa).toHaveBeenCalledWith('caso-1', 'ext-9');
    await waitFor(() => expect(within(painel).getByTestId('andamento-resumo')).toHaveTextContent('Blocos concluídos: 4 de 4'));
    expect(within(painel).getByTestId('andamento-tempo')).toHaveTextContent('retomada 1 vez');
    expect(within(painel).queryByRole('button', { name: 'Retomar extração' })).not.toBeInTheDocument();
  });

  it('enquanto o cancelamento não é atendido, o botão mostra que o pedido foi feito', async () => {
    const meio = emAndamento('capp');
    const pedido = { ...meio, cancelamento_pedido: true };
    // Como no servidor: depois do pedido de cancelamento, toda consulta do andamento já o informa.
    // (Trocar a resposta do andamento só depois do clique deixava uma consulta de 5 ms responder
    // com o estado antigo no intervalo, e o teste falhava de vez em quando.)
    let cancelado = false;
    const { cliente } = clienteComRoteiro(meio, [meio], {
      progressoExtracaoIa: vi.fn(async () => (cancelado ? pedido : meio)),
      cancelarExtracaoIa: vi.fn(async () => {
        cancelado = true;
        return pedido;
      }),
    });
    const { usuario, painel } = await iniciar(cliente);
    await usuario.click(within(painel).getByRole('button', { name: 'Cancelar extração' }));
    expect(await within(painel).findByRole('button', { name: 'Cancelamento pedido' })).toBeDisabled();
    expect(within(painel).getByText(/Cancelamento pedido: o modelo para assim que o servidor receber o pedido/)).toBeInTheDocument();
  });

  it('uma consulta do andamento que estava a caminho não desfaz o estado mais novo, vindo do cancelamento', async () => {
    const meio = emAndamento('capp');
    const pedido = { ...meio, cancelamento_pedido: true };
    let cancelado = false;
    let soltar: (p: ProgressoExtracaoIa) => void = () => {};
    // Antes do cancelamento, a consulta do andamento fica sem resposta (rede lenta).
    const progressoExtracaoIa = vi.fn((): Promise<ProgressoExtracaoIa> => {
      if (cancelado) return Promise.resolve(pedido);
      return new Promise((resolver) => {
        soltar = resolver;
      });
    });
    const { cliente } = clienteComRoteiro(meio, [meio], {
      progressoExtracaoIa,
      cancelarExtracaoIa: vi.fn(async () => {
        cancelado = true;
        return pedido;
      }),
    });
    const { usuario, painel } = await iniciar(cliente);
    await waitFor(() => expect(progressoExtracaoIa).toHaveBeenCalledTimes(1));
    await usuario.click(within(painel).getByRole('button', { name: 'Cancelar extração' }));
    expect(await within(painel).findByRole('button', { name: 'Cancelamento pedido' })).toBeDisabled();
    // A resposta atrasada chega agora, com o estado de antes do cancelamento: é descartada.
    await act(async () => {
      soltar(meio);
    });
    expect(within(painel).getByRole('button', { name: 'Cancelamento pedido' })).toBeDisabled();
    expect(within(painel).queryByRole('button', { name: 'Cancelar extração' })).not.toBeInTheDocument();
    // E o acompanhamento continua (a consulta descartada não parou o laço).
    const antes = progressoExtracaoIa.mock.calls.length;
    await waitFor(() => expect(progressoExtracaoIa.mock.calls.length).toBeGreaterThan(antes + 1));
    expect(within(painel).getByRole('button', { name: 'Cancelamento pedido' })).toBeDisabled();
  });

  it('concluída com falhas: diz quais blocos falharam e por quê, mantém as sugestões e oferece retomar', async () => {
    const causas = { 2: 'tempo_esgotado', 4: 'json_invalido' };
    const final = parada('concluida_com_falhas', 'cfcf', { itens_aceitos: 4, motivo: '2 de 4 blocos falharam.' }, causas);
    const { cliente } = clienteComRoteiro(emAndamento('appp'), [final]);
    const { painel } = await iniciar(cliente);
    await waitFor(() => expect(within(painel).getByText('concluída com falhas')).toBeInTheDocument());
    expect(within(painel).getByTestId('andamento-resumo')).toHaveTextContent('Blocos concluídos: 2 de 4 · com falha: 2');
    expect(within(painel).getByText('A extração terminou, mas 2 blocos falharam.')).toBeInTheDocument();
    expect(within(painel).getByText('Bloco 2: passou do tempo limite do bloco')).toBeInTheDocument();
    expect(within(painel).getByText('Bloco 4: a resposta do modelo não seguiu o formato esperado')).toBeInTheDocument();
    expect(within(painel).getAllByTestId('andamento-bloco')[1]).toHaveTextContent('Bloco 2: falhou (passou do tempo limite do bloco)');
    expect(within(painel).getByRole('progressbar')).toHaveAttribute('value', '4');
    expect(within(painel).getByRole('button', { name: 'Retomar extração' })).toBeEnabled();
  });

  it('falha e interrupção mostram o motivo do servidor', async () => {
    const falha = parada('falha', '', { blocos_total: 0, motivo: "O modelo 'x' não está instalado no servidor local de IA." });
    const primeira = await iniciar(clienteComRoteiro(emAndamento(''), [falha]).cliente);
    await waitFor(() => expect(within(primeira.painel).getByText('falhou')).toBeInTheDocument());
    expect(within(primeira.painel).getByRole('alert')).toHaveTextContent("A extração falhou. O modelo 'x' não está instalado no servidor local de IA. Depois de corrigir a causa, use \"Retomar\".");
    primeira.desmontar();

    const interrompida = parada('interrompida', 'ccpp', { motivo: 'O serviço foi reiniciado durante a execução. Os blocos já concluídos estão gravados; retome para processar os que faltam.' });
    const segunda = await iniciar(clienteComRoteiro(emAndamento('capp'), [interrompida]).cliente);
    await waitFor(() => expect(within(segunda.painel).getByText('interrompida')).toBeInTheDocument());
    expect(within(segunda.painel).getByText(/O serviço foi reiniciado durante a execução/)).toBeInTheDocument();
    expect(within(segunda.painel).getByRole('button', { name: 'Retomar extração' })).toBeInTheDocument();
  });

  it('se a consulta do andamento falha, avisa e continua consultando; a extração segue no servidor', async () => {
    const rede = new ErroApi(0, '/progresso', 'Sem resposta do servidor');
    const { cliente } = clienteComRoteiro(emAndamento('appp'), [rede, rede, emAndamento('ccap'), parada('sucesso', 'cccc')]);
    const { painel } = await iniciar(cliente);
    expect(await within(painel).findByText(/Não foi possível consultar o andamento agora/)).toHaveTextContent('A consulta será repetida; a extração continua no servidor.');
    await waitFor(() => expect(within(painel).getByTestId('andamento-resumo')).toHaveTextContent('Blocos concluídos: 4 de 4'));
    expect(within(painel).queryByText(/Não foi possível consultar/)).not.toBeInTheDocument();
  });

  it('depois de várias falhas seguidas, para de consultar e oferece consultar de novo', async () => {
    const rede = new ErroApi(0, '/progresso', 'Sem resposta do servidor');
    const { cliente, progressoExtracaoIa } = clienteComRoteiro(emAndamento('appp'), [rede]);
    const { usuario, painel } = await iniciar(cliente);
    expect(await within(painel).findByText(/A consulta do andamento falhou várias vezes seguidas/)).toHaveTextContent('A extração pode continuar rodando no servidor.');
    expect(progressoExtracaoIa).toHaveBeenCalledTimes(5);
    await new Promise((r) => setTimeout(r, 40));
    expect(progressoExtracaoIa).toHaveBeenCalledTimes(5);
    progressoExtracaoIa.mockImplementation(async () => parada('sucesso', 'cccc'));
    await usuario.click(within(painel).getByRole('button', { name: 'Consultar de novo' }));
    await waitFor(() => expect(within(painel).getByTestId('andamento-resumo')).toHaveTextContent('Blocos concluídos: 4 de 4'));
  });

  it('ao abrir a aba com uma extração já em andamento, passa a acompanhá-la sem ninguém clicar', async () => {
    const base = clienteFalso();
    const rodando = emAndamento('ccap', { tempo_decorrido_ms: 200_000, estimativa_restante_ms: 200_000 });
    const listarExtracoesIa = vi.fn(async () => [execucao(rodando), ...(await base.listarExtracoesIa('caso-1'))]);
    const progressoExtracaoIa = vi.fn(async () => emAndamento('cccp'.replace('p', 'a'), { tempo_decorrido_ms: 290_000 }));
    renderizar({ cliente: clienteFalso({ listarExtracoesIa, progressoExtracaoIa }) });
    const painel = await screen.findByTestId('andamento-extracao');
    expect(painel).toHaveAccessibleName('Extração ext-9');
    await waitFor(() => expect(within(painel).getByTestId('andamento-resumo')).toHaveTextContent('Blocos concluídos: 3 de 4'));
    expect(progressoExtracaoIa).toHaveBeenCalledWith('caso-1', 'ext-9');
    // Na lista de execuções, a mesma execução aparece com o andamento mais novo.
    expect(screen.getAllByTestId('execucao-ia')[0]).toHaveTextContent('em andamento');
    expect(screen.getAllByTestId('execucao-blocos')[0]).toHaveTextContent('Blocos concluídos: 3 de 4 · por fazer: 1 · tempo de processamento: 4 min 50 s');
  });

  it('uma execução parada de outra sessão pode ser retomada pela lista de execuções', async () => {
    const base = clienteFalso();
    const antiga = parada('interrompida', 'ccpp', { motivo: 'O serviço foi reiniciado durante a execução.' });
    const listarExtracoesIa = vi.fn(async () => [execucao(antiga), ...(await base.listarExtracoesIa('caso-1'))]);
    const retomarExtracaoIa = vi.fn(async () => emAndamento('ccpp', { situacao: 'na_fila', posicao_na_fila: 1, bloco_atual: null, retomadas: 1 }));
    const progressoExtracaoIa = vi.fn(async () => parada('sucesso', 'cccc', { retomadas: 1 }));
    const { usuario } = renderizar({ cliente: clienteFalso({ listarExtracoesIa, retomarExtracaoIa, progressoExtracaoIa }) });
    const linha = (await screen.findAllByTestId('execucao-ia'))[0];
    expect(linha).toHaveTextContent('interrompida');
    expect(linha).toHaveTextContent('O serviço foi reiniciado durante a execução.');
    expect(screen.queryByTestId('andamento-extracao')).not.toBeInTheDocument();
    await usuario.click(within(linha).getByRole('button', { name: 'Retomar esta extração' }));
    expect(retomarExtracaoIa).toHaveBeenCalledWith('caso-1', 'ext-9');
    const painel = await screen.findByTestId('andamento-extracao');
    await waitFor(() => expect(within(painel).getByTestId('andamento-resumo')).toHaveTextContent('Blocos concluídos: 4 de 4'));
  });

  it('o erro ao cancelar ou retomar aparece no painel, sem perder o andamento', async () => {
    const meio = emAndamento('capp');
    const cancelarExtracaoIa = vi.fn(async () => {
      throw new ErroApi(409, '/cancelar', "Esta execução está 'sucesso': não há o que cancelar.");
    });
    const { cliente } = clienteComRoteiro(meio, [meio], { cancelarExtracaoIa });
    const { usuario, painel } = await iniciar(cliente);
    await usuario.click(within(painel).getByRole('button', { name: 'Cancelar extração' }));
    expect(await within(painel).findByRole('alert')).toHaveTextContent('não há o que cancelar');
    expect(within(painel).getByTestId('andamento-resumo')).toHaveTextContent('Blocos concluídos: 1 de 4');
    expect(within(painel).getByRole('button', { name: 'Cancelar extração' })).toBeEnabled();
  });

  it('o leitor vê o andamento, mas não cancela nem retoma', async () => {
    const base = clienteFalso({}, 'teste automatizado', { token: 'dev-agente' });
    const rodando = emAndamento('capp');
    const parado = parada('cancelada', 'cppp', { id: 'ext-8' });
    const listarExtracoesIa = vi.fn(async () => [execucao(rodando), execucao(parado), ...(await base.listarExtracoesIa('caso-1'))]);
    const cliente = clienteFalso({ listarExtracoesIa, progressoExtracaoIa: vi.fn(async () => rodando) }, 'teste automatizado', { token: 'dev-agente' });
    renderizar({ papel: 'leitor', cliente });
    const painel = await screen.findByTestId('andamento-extracao');
    expect(within(painel).getByRole('button', { name: 'Cancelar extração' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Retomar esta extração' })).not.toBeInTheDocument();
  });

  it('ao sair da aba, a consulta periódica para', async () => {
    const meio = emAndamento('capp');
    const { cliente, progressoExtracaoIa } = clienteComRoteiro(meio, [meio]);
    const { desmontar } = await iniciar(cliente);
    await waitFor(() => expect(progressoExtracaoIa.mock.calls.length).toBeGreaterThan(1));
    desmontar();
    await new Promise((r) => setTimeout(r, 15));
    const consultas = progressoExtracaoIa.mock.calls.length;
    await new Promise((r) => setTimeout(r, 40));
    expect(progressoExtracaoIa.mock.calls.length).toBe(consultas);
  });

  it('rótulos e durações são escritos por extenso', () => {
    expect(formatarDuracao(0)).toBe('0 s');
    expect(formatarDuracao(59_400)).toBe('59 s');
    expect(formatarDuracao(60_000)).toBe('1 min 00 s');
    expect(formatarDuracao(197_000)).toBe('3 min 17 s');
    expect(formatarDuracao(3_600_000)).toBe('1 h 00 min');
    expect(formatarDuracao(4_500_000)).toBe('1 h 15 min');
    expect(formatarDuracao(-5)).toBe('0 s');
    expect(rotuloExecucaoIa('concluida_com_falhas')).toBe('concluída com falhas');
    expect(rotuloExecucaoIa('outra')).toBe('outra');
    expect(rotuloCausaIa('travamento')).toBe('o modelo parou de responder');
    expect(rotuloCausaIa('causa_nova')).toBe('causa_nova');
  });
});
