import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErroApi, type ApiCliente, type IaEstado, type PapelCaso, type SugestaoIa, type TextoCaptura } from '../../api';
import { TEXTOS_CAPTURA_DEMO } from '../../api/dadosSinteticos';
import { PapelProvider, papelNoCaso } from '../../sessao/PapelContext';
import { SessaoProvider } from '../../sessao/SessaoContext';
import { clienteFalso } from '../../test/clienteFalso';
import { AbaSugestoesIa, DocumentoComTrecho } from './AbaSugestoesIa';

const IA_ATIVA: IaEstado = { ativa: true, provedor: 'simulado', modelo: 'modelo-sintetico-de-demonstracao', local: true, tipos: ['empresa', 'orgao', 'pessoa', 'valor', 'data', 'objeto'] };
const IA_DESLIGADA: IaEstado = { ativa: false, provedor: null, modelo: null, local: true, tipos: [] };

function renderizar(opcoes: { ia?: IaEstado | null; cliente?: ApiCliente; papel?: PapelCaso; capturaInicial?: string } = {}) {
  const usuario = userEvent.setup();
  const cliente = opcoes.cliente ?? clienteFalso();
  const aoMudar = vi.fn();
  const aoAbrirEntidade = vi.fn();
  render(
    <SessaoProvider cliente={cliente}>
      <PapelProvider value={papelNoCaso(opcoes.papel ?? 'investigador')}>
        <AbaSugestoesIa casoId="caso-1" ia={opcoes.ia === undefined ? IA_ATIVA : opcoes.ia} capturaInicial={opcoes.capturaInicial} aoMudar={aoMudar} aoAbrirEntidade={aoAbrirEntidade} />
      </PapelProvider>
    </SessaoProvider>,
  );
  return { usuario, cliente, aoMudar, aoAbrirEntidade };
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

  it('"Extrair com IA" roda a extração na captura escolhida, mostra o resultado e escolhe a primeira sugestão nova', async () => {
    const { usuario, cliente, aoMudar } = renderizar({ capturaInicial: 'cap-10' });
    await screen.findAllByTestId('sugestao-ia');
    expect(screen.getByLabelText('Captura do documento')).toHaveValue('cap-10');
    await usuario.click(screen.getByRole('button', { name: 'Extrair com IA' }));

    expect(await screen.findByText(/8 itens devolvidos pelo modelo/)).toHaveTextContent('6 viraram sugestões pendentes e 2 foram recusados');
    await waitFor(() => expect(screen.getAllByTestId('sugestao-ia')).toHaveLength(12));
    expect(await screen.findAllByTestId('execucao-ia')).toHaveLength(2);
    expect(await screen.findByTestId('trecho-destacado')).toHaveTextContent('PREFEITURA SINTETICA DE EXEMPLOPOLIS');
    expect(aoMudar).toHaveBeenCalled();
    expect((await cliente.listarAuditoria('caso-1')).some((e) => e.acao === 'ia.extrair')).toBe(true);
    // Nenhuma entidade nasceu da extração.
    expect((await cliente.buscarEntidades('caso-1', 'FULANO')).length).toBe(0);
  });

  it('a falha da extração (502) aparece como erro, e a lista de execuções é atualizada', async () => {
    const base = clienteFalso();
    const listarExtracoesIa = vi.fn(() => base.listarExtracoesIa('caso-1'));
    const extrairComIa = vi.fn(async () => {
      throw new ErroApi(502, '/casos/caso-1/capturas/cap-10/extracao-ia', 'A extração falhou e foi registrada (ext-9): o servidor do modelo não respondeu');
    });
    const { usuario } = renderizar({ cliente: clienteFalso({ extrairComIa, listarExtracoesIa }) });
    await screen.findAllByTestId('sugestao-ia');
    await usuario.click(screen.getByRole('button', { name: 'Extrair com IA' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A extração falhou e foi registrada (ext-9)');
    expect(extrairComIa).toHaveBeenCalledWith('caso-1', 'cap-10');
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
