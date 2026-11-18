import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessaoProvider } from '../../sessao/SessaoContext';
import { clienteFalso } from '../../test/clienteFalso';
import { AbaAlertas } from './AbaAlertas';

async function renderizarComAlertas() {
  const usuario = userEvent.setup();
  const cliente = clienteFalso();
  render(
    <SessaoProvider cliente={cliente}>
      <AbaAlertas casoId="caso-1" />
    </SessaoProvider>,
  );
  await usuario.click(await screen.findByRole('button', { name: 'Executar tipologias' }));
  await screen.findByTestId('resumo-situacao');
  return { usuario, cliente };
}

describe('AbaAlertas — severidade (RF14) e decisão do investigador (RF12)', () => {
  it('lista os alertas por severidade, com a política de erro de cada tipologia', async () => {
    await renderizarComAlertas();
    const cartoes = screen.getAllByRole('article');
    // A etiqueta do cartão é a do cabeçalho (a tabela de componentes da combinação também tem etiquetas).
    const etiqueta = (c: HTMLElement) => c.querySelector('header .etiqueta-tipologia')?.textContent;
    // As duas combinações vêm em destaque; o sinal fraco (L14) fica recolhido, fora da lista.
    expect(cartoes.map(etiqueta)).toEqual(['COMB', 'COMB', 'T4', 'T6', 'T7', 'L6', 'T1', 'T3', 'T5', 'T8', 'T9', 'T9', 'T10', 'T2']);
    expect(cartoes.map((c) => within(c).getByText(/^severidade: /).textContent)).toEqual([
      ...Array(5).fill('severidade: alta'),
      ...Array(7).fill('severidade: média'),
      ...Array(2).fill('severidade: baixa'),
    ]);
    for (const cartao of cartoes) {
      expect(within(cartao).getByText(/^Prefere evitar falso (negativo|positivo):/)).toBeInTheDocument();
    }
    // O resumo conta todos os alertas, inclusive o sinal fraco recolhido.
    expect(screen.getByTestId('resumo-situacao')).toHaveTextContent('15 pendentes de análise · 0 confirmados · 0 descartados');
  });

  it('diz o total de alertas do caso e quantos estão em cada bloco, para o número conferir com o do cabeçalho', async () => {
    const { usuario } = await renderizarComAlertas();
    // 14 cartões à vista e 1 sinal fraco recolhido: o total é 15, como no cabeçalho do caso.
    expect(screen.getAllByRole('article')).toHaveLength(14);
    const total = screen.getByTestId('resumo-total');
    expect(total).toHaveTextContent('15 alertas no caso (o mesmo número do cabeçalho): 2 de combinação, 12 por tipologia e 1 sinal fraco (recolhido no fim da lista).');
    expect(total).not.toHaveTextContent('Com os filtros escolhidos');
    await usuario.selectOptions(screen.getByLabelText('Tipologia'), 'T9');
    expect(total).toHaveTextContent('15 alertas no caso');
    expect(total).toHaveTextContent('Com os filtros escolhidos: 2.');
  });

  it('descarta um alerta com justificativa: a situação muda na tela e a decisão vai para a auditoria', async () => {
    const { usuario, cliente } = await renderizarComAlertas();
    const cartao = within(screen.getByTestId('grupo-alertas')).getAllByRole('article')[0];
    await usuario.type(within(cartao).getByLabelText('Justificativa da decisão (obrigatória)'), 'Baixa posterior ao contrato');
    await usuario.click(within(cartao).getByRole('button', { name: 'Descartar alerta' }));

    expect(await within(cartao).findByText('descartado', { selector: '.situacao' })).toBeInTheDocument();
    expect(within(cartao).getByTestId('decisao')).toHaveTextContent('Justificativa: Baixa posterior ao contrato');
    expect(screen.getByTestId('resumo-situacao')).toHaveTextContent('14 pendentes de análise · 0 confirmados · 1 descartado');

    const eventos = (await cliente.listarAuditoria('caso-1')).filter((e) => e.acao === 'alerta.decidir');
    expect(eventos).toHaveLength(1);
    expect(eventos[0].detalhes).toMatchObject({ decisao: 'descartado', justificativa_decisao: 'Baixa posterior ao contrato', revisao: false });

    // O filtro por situação separa o que falta analisar.
    await usuario.selectOptions(screen.getByLabelText('Situação'), 'pendente');
    expect(screen.getAllByRole('article')).toHaveLength(13);
    await usuario.selectOptions(screen.getByLabelText('Situação'), 'descartado');
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });
});

describe('AbaAlertas — execução com tipologias e limiares do horizonte 2', () => {
  /** O botão só fica disponível depois da carga inicial da lista. */
  async function renderizar() {
    const usuario = userEvent.setup();
    const executarAlertas = vi.fn(async (..._args: unknown[]) => []);
    render(
      <SessaoProvider cliente={clienteFalso({ executarAlertas })}>
        <AbaAlertas casoId="caso-1" />
      </SessaoProvider>,
    );
    await screen.findByRole('button', { name: 'Executar tipologias' });
    return { usuario, executarAlertas };
  }

  it('sem alterar nada, executa todas as tipologias com a configuração em vigor (sem corpo)', async () => {
    const { usuario, executarAlertas } = await renderizar();
    const formulario = screen.getByRole('form', { name: 'Execução das tipologias' });
    // T1 a T10, as onze L e a combinação.
    expect(within(formulario).getAllByRole('checkbox')).toHaveLength(22);
    for (const caixa of within(formulario).getAllByRole('checkbox')) expect(caixa).toBeChecked();
    await usuario.click(screen.getByRole('button', { name: 'Executar tipologias' }));
    expect(executarAlertas).toHaveBeenCalledWith('caso-1');
  });

  it('envia só as tipologias escolhidas e os três limiares novos', async () => {
    const { usuario, executarAlertas } = await renderizar();
    const desmarcar = ['T1', 'T2', 'T3', 'T4', 'T6', 'T7', 'T9', 'L1', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L10', 'L14', 'L15', 'L16', 'COMB'];
    for (const t of desmarcar) await usuario.click(screen.getByRole('checkbox', { name: t }));
    await usuario.type(screen.getByLabelText('T5 — mínimo de contratações somadas'), '3');
    await usuario.type(screen.getByLabelText('T8 — limite de acréscimo (%)'), '20');
    await usuario.type(screen.getByLabelText('T8 — limite de acréscimo em reforma (%)'), '40.5');
    await usuario.click(screen.getByRole('button', { name: 'Executar tipologias' }));
    expect(executarAlertas).toHaveBeenCalledWith('caso-1', {
      tipologias: ['T5', 'T8', 'T10'],
      parametros: { t5_minimo_contratacoes: 3, t8_percentual_limite: 20, t8_percentual_limite_reforma: 40.5 },
    });
  });

  it('não executa com limiar fora da faixa nem sem tipologia escolhida', async () => {
    const { usuario, executarAlertas } = await renderizar();
    const botao = screen.getByRole('button', { name: 'Executar tipologias' });
    await usuario.type(screen.getByLabelText('T5 — mínimo de contratações somadas'), '1');
    expect(botao).toBeDisabled();
    expect(screen.getByText(/limiar fora da faixa aceita/)).toBeInTheDocument();
    await usuario.clear(screen.getByLabelText('T5 — mínimo de contratações somadas'));
    expect(botao).toBeEnabled();
    await usuario.type(screen.getByLabelText('T8 — limite de acréscimo (%)'), '0');
    expect(botao).toBeDisabled();
    await usuario.clear(screen.getByLabelText('T8 — limite de acréscimo (%)'));
    for (const caixa of screen.getAllByRole('checkbox')) await usuario.click(caixa);
    expect(botao).toBeDisabled();
    expect(screen.getByText('Escolha ao menos uma tipologia.')).toBeInTheDocument();
    expect(executarAlertas).not.toHaveBeenCalled();
  });

  it('o filtro de tipologia vai de T1 a T10', async () => {
    const usuario = userEvent.setup();
    render(
      <SessaoProvider cliente={clienteFalso()}>
        <AbaAlertas casoId="caso-1" />
      </SessaoProvider>,
    );
    await usuario.click(await screen.findByRole('button', { name: 'Executar tipologias' }));
    await screen.findByTestId('resumo-situacao');
    await usuario.selectOptions(screen.getByLabelText('Tipologia'), 'T9');
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getAllByTestId('selo-coincidencia')).toHaveLength(1);
    await usuario.selectOptions(screen.getByLabelText('Tipologia'), 'T10');
    expect(screen.getAllByTestId('ocorrencia')).toHaveLength(2);
  });
});

describe('RF04 e RF14: tipologias de lavagem, sinais fracos e combinação na aba Alertas', () => {
  it('RF14: as combinações vêm em destaque, antes dos demais alertas, com o aviso de que não são escore de culpa', async () => {
    await renderizarComAlertas();
    const destaque = screen.getByTestId('grupo-combinacao');
    expect(within(destaque).getByRole('heading', { name: 'Combinação de alertas na mesma entidade (2)' })).toBeInTheDocument();
    const combinacoes = within(destaque).getAllByRole('article');
    expect(combinacoes).toHaveLength(2);
    // O destaque vem antes da lista por tipologia.
    expect(destaque.compareDocumentPosition(screen.getByTestId('grupo-alertas')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const alfa = combinacoes[0];
    expect(within(alfa).getByRole('heading', { name: /^Combinação de alertas em ALFA SOLUÇÕES EM TI LTDA: 5 tipologias distintas$/ })).toBeInTheDocument();
    // T1, T2, T3 e L6 pesam 1; o sinal fraco L14 pesa 0,5.
    expect(within(alfa).getByTestId('combinacao-soma')).toHaveTextContent('4,5 (mínimo para disparar: 2)');
    expect(within(alfa).getByTestId('combinacao-distintas')).toHaveTextContent('5 (mínimo para disparar: 2)');
    const componentes = within(alfa).getAllByTestId('componente-combinacao');
    expect(componentes.map((l) => l.querySelector('.etiqueta-tipologia')?.textContent).sort()).toEqual(['L14', 'L6', 'T1', 'T2', 'T3']);
    expect(within(alfa).getByTestId('aviso-combinacao')).toHaveTextContent('Não é escore de culpa');
    expect(within(combinacoes[1]).getByTestId('combinacao-soma')).toHaveTextContent('2 (mínimo para disparar: 2)');
  });

  it('RF12: os sinais fracos ficam numa seção à parte, recolhida, com o texto de que sozinhos não indicam nada', async () => {
    const { usuario } = await renderizarComAlertas();
    const secao = screen.getByTestId('grupo-sinais-fracos');
    expect(within(secao).getByRole('heading', { name: 'Sinais fracos (1)' })).toBeInTheDocument();
    expect(secao).toHaveTextContent('Sinal fraco: sozinho não indica nada; só pesa no alerta de combinação.');
    const botao = within(secao).getByRole('button', { name: 'Mostrar sinais fracos' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    expect(within(secao).queryByRole('article')).not.toBeInTheDocument();
    // Nenhum sinal fraco aparece entre os alertas por tipologia.
    expect(within(screen.getByTestId('grupo-alertas')).queryByTestId('selo-sinal-fraco')).not.toBeInTheDocument();

    await usuario.click(botao);
    expect(within(secao).getByRole('button', { name: 'Recolher sinais fracos' })).toHaveAttribute('aria-expanded', 'true');
    const cartao = within(secao).getByRole('article');
    expect(cartao.querySelector('header .etiqueta-tipologia')).toHaveTextContent('L14');
    expect(within(cartao).getByTestId('selo-sinal-fraco')).toBeInTheDocument();
    expect(within(cartao).getByLabelText('Justificativa da decisão (obrigatória)')).toBeInTheDocument();
  });

  it('RF14: o componente da combinação leva ao cartão do alerta, abrindo os sinais fracos e limpando o filtro', async () => {
    const { usuario } = await renderizarComAlertas();
    await usuario.selectOptions(screen.getByLabelText('Tipologia'), 'COMB');
    expect(screen.getAllByRole('article')).toHaveLength(2);
    const alfa = screen.getAllByRole('article')[0];

    await usuario.click(within(alfa).getByRole('button', { name: /^Sócio-administrador de ALFA SOLUÇÕES EM TI LTDA em faixa etária atípica$/ }));
    const alvo = await waitFor(() => {
      const cartao = document.getElementById('cartao-alerta-alr-13');
      expect(cartao).toHaveFocus();
      return cartao!;
    });
    expect(screen.getByLabelText('Tipologia')).toHaveValue('todos');
    expect(screen.getByTestId('grupo-sinais-fracos')).toContainElement(alvo);

    await usuario.click(within(alfa).getByRole('button', { name: 'Capital social incompatível com o valor contratado' }));
    await waitFor(() => expect(document.getElementById('cartao-alerta-alr-3')).toHaveFocus());
  });

  it('RF04: o filtro e a seleção para executar incluem os códigos L e a combinação, por grupo', async () => {
    const { usuario } = await renderizarComAlertas();
    const filtro = screen.getByLabelText('Tipologia');
    expect(within(filtro).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'todas',
      'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10',
      'L1', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L10', 'L14', 'L15', 'L16',
      'COMB',
    ]);
    expect(within(filtro).getAllByRole('group').map((g) => g.getAttribute('label'))).toEqual(['Contratações', 'Lavagem e ocultação', 'Combinação']);
    const formulario = screen.getByRole('form', { name: 'Execução das tipologias' });
    expect(within(within(formulario).getByRole('group', { name: 'Lavagem e ocultação' })).getAllByRole('checkbox')).toHaveLength(11);
    expect(within(within(formulario).getByRole('group', { name: 'Combinação' })).getByRole('checkbox', { name: 'COMB' })).toBeChecked();

    await usuario.selectOptions(filtro, 'L6');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByTestId('aviso-pista')).toHaveTextContent('Pista, não conclusão.');
  });

  it('RF04: envia os limiares de lavagem e da combinação só para a execução, e recusa valor fora da faixa', async () => {
    const usuario = userEvent.setup();
    const executarAlertas = vi.fn(async (..._args: unknown[]) => []);
    render(
      <SessaoProvider cliente={clienteFalso({ executarAlertas })}>
        <AbaAlertas casoId="caso-1" />
      </SessaoProvider>,
    );
    const botao = await screen.findByRole('button', { name: 'Executar tipologias' });
    await usuario.type(screen.getByLabelText('COMB — mínimo de tipologias distintas'), '1');
    expect(botao).toBeDisabled();
    expect(screen.getByText(/limiar fora da faixa aceita/)).toBeInTheDocument();
    await usuario.clear(screen.getByLabelText('COMB — mínimo de tipologias distintas'));
    await usuario.type(screen.getByLabelText('COMB — soma mínima dos pesos'), '0');
    expect(botao).toBeDisabled();
    await usuario.clear(screen.getByLabelText('COMB — soma mínima dos pesos'));

    await usuario.type(screen.getByLabelText('COMB — mínimo de tipologias distintas'), '3');
    await usuario.type(screen.getByLabelText('COMB — soma mínima dos pesos'), '2.5');
    await usuario.type(screen.getByLabelText('L1 — mínimo de estabelecimentos no endereço'), '10');
    await usuario.type(screen.getByLabelText('L7 — dias após a abertura que ainda contam como fundador'), '0');
    await usuario.type(screen.getByLabelText('L14 — valor contratado mínimo (R$)'), '250000.5');
    await usuario.click(botao);
    expect(executarAlertas).toHaveBeenCalledWith('caso-1', {
      parametros: { comb_minimo_tipologias: 3, comb_peso_minimo: 2.5, l1_minimo_estabelecimentos: 10, l7_dias_apos_abertura: 0, l14_valor_minimo: 250000.5 },
    });
  });

  it('RF14: com o mínimo de tipologias mais alto na execução, só a combinação que o atinge continua', async () => {
    const usuario = userEvent.setup();
    render(
      <SessaoProvider cliente={clienteFalso()}>
        <AbaAlertas casoId="caso-1" />
      </SessaoProvider>,
    );
    await usuario.type(await screen.findByLabelText('COMB — mínimo de tipologias distintas'), '3');
    await usuario.click(screen.getByRole('button', { name: 'Executar tipologias' }));
    const destaque = await screen.findByTestId('grupo-combinacao');
    expect(within(destaque).getAllByRole('article')).toHaveLength(1);
    expect(within(destaque).getByTestId('combinacao-distintas')).toHaveTextContent('5 (mínimo para disparar: 3)');
  });
});
