import { render, screen, within } from '@testing-library/react';
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
    const etiqueta = (c: HTMLElement) => within(c).getByText(/^T\d+$/, { selector: '.etiqueta-tipologia' }).textContent;
    expect(cartoes.map(etiqueta)).toEqual(['T4', 'T6', 'T7', 'T1', 'T3', 'T5', 'T8', 'T9', 'T9', 'T10', 'T2']);
    expect(cartoes.map((c) => within(c).getByText(/^severidade: /).textContent)).toEqual([
      ...Array(3).fill('severidade: alta'),
      ...Array(6).fill('severidade: média'),
      ...Array(2).fill('severidade: baixa'),
    ]);
    for (const cartao of cartoes) {
      expect(within(cartao).getByText(/^Prefere evitar falso (negativo|positivo):/)).toBeInTheDocument();
    }
    expect(screen.getByTestId('resumo-situacao')).toHaveTextContent('11 pendente(s) de análise · 0 confirmado(s) · 0 descartado(s)');
  });

  it('descarta um alerta com justificativa: a situação muda na tela e a decisão vai para a auditoria', async () => {
    const { usuario, cliente } = await renderizarComAlertas();
    const cartao = screen.getAllByRole('article')[0];
    await usuario.type(within(cartao).getByLabelText('Justificativa da decisão (obrigatória)'), 'Baixa posterior ao contrato');
    await usuario.click(within(cartao).getByRole('button', { name: 'Descartar alerta' }));

    expect(await within(cartao).findByText('descartado', { selector: '.situacao' })).toBeInTheDocument();
    expect(within(cartao).getByTestId('decisao')).toHaveTextContent('Justificativa: Baixa posterior ao contrato');
    expect(screen.getByTestId('resumo-situacao')).toHaveTextContent('10 pendente(s) de análise · 0 confirmado(s) · 1 descartado(s)');

    const eventos = (await cliente.listarAuditoria('caso-1')).filter((e) => e.acao === 'alerta.decidir');
    expect(eventos).toHaveLength(1);
    expect(eventos[0].detalhes).toMatchObject({ decisao: 'descartado', justificativa_decisao: 'Baixa posterior ao contrato', revisao: false });

    // O filtro por situação separa o que falta analisar.
    await usuario.selectOptions(screen.getByLabelText('Situação'), 'pendente');
    expect(screen.getAllByRole('article')).toHaveLength(10);
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

  it('sem alterar nada, executa T1 a T10 com a configuração em vigor (sem corpo)', async () => {
    const { usuario, executarAlertas } = await renderizar();
    const formulario = screen.getByRole('form', { name: 'Execução das tipologias' });
    expect(within(formulario).getAllByRole('checkbox')).toHaveLength(10);
    for (const caixa of within(formulario).getAllByRole('checkbox')) expect(caixa).toBeChecked();
    await usuario.click(screen.getByRole('button', { name: 'Executar tipologias' }));
    expect(executarAlertas).toHaveBeenCalledWith('caso-1');
  });

  it('envia só as tipologias escolhidas e os três limiares novos', async () => {
    const { usuario, executarAlertas } = await renderizar();
    for (const t of ['T1', 'T2', 'T3', 'T4', 'T6', 'T7', 'T9']) await usuario.click(screen.getByRole('checkbox', { name: t }));
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
