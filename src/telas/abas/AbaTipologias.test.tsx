import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErroApi, type TipologiaCatalogo } from '../../api';
import { SessaoProvider } from '../../sessao/SessaoContext';
import { clienteFalso } from '../../test/clienteFalso';
import { AbaTipologias, CartaoTipologia } from './AbaTipologias';

function renderizar(cliente = clienteFalso()) {
  render(
    <SessaoProvider cliente={cliente}>
      <AbaTipologias />
    </SessaoProvider>,
  );
}

describe('AbaTipologias — catálogo e configuração em vigor (GET /tipologias)', () => {
  it('mostra as dez tipologias com código, nome, história, severidade, política, regra, base e fontes', async () => {
    renderizar();
    const cartoes = await screen.findAllByTestId('tipologia');
    expect(cartoes.map((c) => within(c).getByText(/^T\d+$/, { selector: '.etiqueta-tipologia' }).textContent)).toEqual([
      'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10',
    ]);
    const t8 = cartoes[7];
    expect(within(t8).getByRole('heading', { name: 'Aditivos acima do limite do art. 125 da Lei nº 14.133/2021' })).toBeInTheDocument();
    expect(within(t8).getByText('H35')).toBeInTheDocument();
    expect(within(t8).getByText('severidade: média')).toBeInTheDocument();
    expect(within(t8).getByText('prefere evitar falso negativo')).toBeInTheDocument();
    expect(within(t8).getByText(/^Prefere evitar falso negativo: soma todo valor acrescido/)).toBeInTheDocument();
    expect(within(t8).getByText(/^Soma do valor acrescido dos termos do contrato acima de N%/)).toBeInTheDocument();
    expect(within(t8).getByText(/art\. 125 \(25% e 50%\)/)).toBeInTheDocument();
    expect(within(t8).getByText('pncp_termos')).toBeInTheDocument();
  });

  it('mostra cada parâmetro com o valor em vigor e marca os que podem ser sobrescritos por execução', async () => {
    renderizar();
    const cartoes = await screen.findAllByTestId('tipologia');
    const linhasT8 = within(cartoes[7]).getAllByTestId('parametro-tipologia');
    expect(linhasT8).toHaveLength(2);
    expect(linhasT8[0]).toHaveTextContent('t8_percentual_limite');
    expect(linhasT8[0]).toHaveTextContent('25');
    expect(linhasT8[0]).toHaveTextContent('pode ser sobrescrito por execução');
    expect(linhasT8[1]).toHaveTextContent('50');

    const linhasT5 = within(cartoes[4]).getAllByTestId('parametro-tipologia');
    expect(linhasT5.map((l) => /pode ser sobrescrito por execução/.test(l.textContent ?? ''))).toEqual([true, false, false]);
    expect(linhasT5[1]).toHaveTextContent('fornecedor_e_categoria');
    expect(linhasT5[1]).toHaveTextContent('só pela configuração do servidor');
    // Lista vazia e tipologia sem parâmetro têm texto próprio.
    expect(within(cartoes[9]).getByText('nenhum')).toBeInTheDocument();
    expect(within(cartoes[3]).getByText('Esta tipologia não tem parâmetro configurável.')).toBeInTheDocument();
    expect(within(cartoes[8]).getByText(/ELEITO POR QP/)).toBeInTheDocument();
  });

  it('t5_limites_dispensa vira uma tabela por exercício, com inciso I, inciso II e a fonte', async () => {
    renderizar();
    const tabela = await screen.findByRole('table', { name: 'Limites de dispensa por exercício' });
    const linhas = within(tabela).getAllByTestId('limite-dispensa');
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toHaveTextContent('2026');
    expect(linhas[0]).toHaveTextContent(/R\$\s130\.984,20/);
    expect(linhas[0]).toHaveTextContent(/R\$\s65\.492,11/);
    expect(linhas[0]).toHaveTextContent('Decreto nº 12.807, de 29/12/2025');
    expect(within(tabela).getByRole('columnheader', { name: /Inciso I \(/ })).toBeInTheDocument();
    expect(within(tabela).getByRole('columnheader', { name: /Inciso II \(/ })).toBeInTheDocument();
  });

  it('vários exercícios aparecem em ordem, e o exercício sem fonte mostra um traço', () => {
    const tipologia: TipologiaCatalogo = {
      codigo: 'T5',
      nome: 'Possível fracionamento',
      historia: 'H32',
      severidade: 'media',
      prefere_evitar: 'falso_positivo',
      politica_erro: 'Prefere evitar falso positivo.',
      regra: 'Regra.',
      base: 'Base.',
      fontes: ['pncp'],
      parametros: [
        {
          nome: 't5_limites_dispensa',
          valor: { '2027': { inciso_i: 140000, inciso_ii: 70000 }, '2026': { inciso_i: 130984.2, inciso_ii: 65492.11, fonte: 'Decreto sintético' } },
          descricao: 'Limites por exercício.',
          por_execucao: false,
        },
      ],
    };
    render(<CartaoTipologia tipologia={tipologia} />);
    const linhas = screen.getAllByTestId('limite-dispensa');
    expect(linhas.map((l) => within(l).getByRole('rowheader').textContent)).toEqual(['2026', '2027']);
    expect(linhas[1]).toHaveTextContent(/R\$\s140\.000,00/);
    expect(linhas[1]).toHaveTextContent('—');
  });

  it('carrega sem justificativa (não é dado de caso) e mostra o erro do back-end', async () => {
    renderizar(clienteFalso({}, ''));
    expect(await screen.findAllByTestId('tipologia')).toHaveLength(10);

    const listarTipologias = vi.fn(async () => {
      throw new ErroApi(401, '/tipologias', 'Token inválido');
    });
    renderizar(clienteFalso({ listarTipologias }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Token inválido');
  });
});
