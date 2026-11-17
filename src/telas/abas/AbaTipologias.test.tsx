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
  it('mostra as tipologias (T1 a T10, as L e a combinação) com código, nome, história, severidade, política, regra, base e fontes', async () => {
    renderizar();
    const cartoes = await screen.findAllByTestId('tipologia');
    expect(cartoes.map((c) => within(c).getByText(/^(T\d+|L\d+|COMB)$/, { selector: '.etiqueta-tipologia' }).textContent)).toEqual([
      'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10',
      'L1', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L10', 'L14', 'L15', 'L16',
      'COMB',
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
    expect(await screen.findAllByTestId('tipologia')).toHaveLength(22);

    const listarTipologias = vi.fn(async () => {
      throw new ErroApi(401, '/tipologias', 'Token inválido');
    });
    renderizar(clienteFalso({ listarTipologias }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Token inválido');
  });
});

describe('RF04: tipologias de lavagem no catálogo (grupos, sinal fraco e peso na combinação)', () => {
  const porCodigo = (cartoes: HTMLElement[], codigo: string) => cartoes.find((c) => within(c).queryByText(codigo, { selector: '.etiqueta-tipologia' }))!;

  it('separa o catálogo em três grupos: contratações, lavagem e ocultação, e combinação', async () => {
    renderizar();
    const grupos = await screen.findAllByTestId('grupo-tipologias');
    expect(grupos.map((g) => g.querySelector(':scope > h3')?.textContent)).toEqual(['Contratações (10)', 'Lavagem e ocultação (11)', 'Combinação (1)']);
    expect(within(grupos[1]).getAllByTestId('tipologia').map((c) => c.querySelector('.etiqueta-tipologia')?.textContent)).toEqual([
      'L1', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L10', 'L14', 'L15', 'L16',
    ]);
    expect(grupos[1]).toHaveTextContent('Nenhum deles prova lavagem de dinheiro.');
    expect(within(grupos[2]).getByRole('heading', { name: 'Combinação de alertas na mesma entidade' })).toBeInTheDocument();
    expect(grupos[2]).toHaveTextContent('não é escore de culpa');
  });

  it('RF14: marca os sinais fracos (L14 e L15) com o texto do contrato e mostra o peso de cada tipologia', async () => {
    renderizar();
    const cartoes = await screen.findAllByTestId('tipologia');
    expect(cartoes.filter((c) => within(c).queryByTestId('selo-sinal-fraco')).map((c) => c.querySelector('.etiqueta-tipologia')?.textContent)).toEqual(['L14', 'L15']);
    const l14 = porCodigo(cartoes, 'L14');
    expect(within(l14).getByTestId('texto-sinal-fraco')).toHaveTextContent('Sinal fraco: sozinho não indica nada; só pesa no alerta de combinação.');
    expect(within(l14).getByTestId('peso-tipologia')).toHaveTextContent(/^0,5$/);
    expect(within(porCodigo(cartoes, 'L1')).getByTestId('peso-tipologia')).toHaveTextContent(/^1$/);
    expect(within(porCodigo(cartoes, 'T1')).getByTestId('peso-tipologia')).toHaveTextContent(/^1$/);
    // L8 é composição de T1 e T7: aparece no catálogo, mas não soma.
    expect(within(porCodigo(cartoes, 'L8')).getByTestId('peso-tipologia')).toHaveTextContent('0 (não conta na soma)');
    expect(within(porCodigo(cartoes, 'COMB')).queryByTestId('peso-tipologia')).not.toBeInTheDocument();
    expect(within(porCodigo(cartoes, 'L6')).getByText('Lavagem e ocultação')).toBeInTheDocument();
  });

  it('l6_limites vira uma tabela ano → limite do MEI, com o limite mensal do ano de início e a fonte, mais ME e EPP', async () => {
    renderizar();
    const tabela = await screen.findByRole('table', { name: 'Limites de receita por regime ou porte' });
    const mei = within(tabela).getAllByTestId('limite-mei');
    expect(mei.map((l) => within(l).getAllByRole('cell')[0].textContent)).toEqual(['até 2026', '2027', 'a partir de 2028']);
    expect(mei[0]).toHaveTextContent(/R\$\s81\.000,00/);
    expect(mei[0]).toHaveTextContent(/R\$\s6\.750,00/);
    expect(mei[0]).toHaveTextContent('Lei Complementar nº 123/2006, art. 18-A');
    expect(mei[1]).toHaveTextContent(/R\$\s110\.000,00/);
    expect(mei[2]).toHaveTextContent(/R\$\s140\.000,00/);
    expect(mei[2]).toHaveTextContent('Lei Complementar nº 238/2026');
    const portes = within(tabela).getAllByTestId('limite-porte');
    expect(portes[0]).toHaveTextContent(/Microempresa \(ME\).*R\$\s360\.000,00/);
    expect(portes[1]).toHaveTextContent(/Empresa de pequeno porte \(EPP\).*R\$\s4\.800\.000,00/);
    // O booleano e as listas dos parâmetros novos ficam legíveis, sem JSON.
    const l6 = porCodigo(screen.getAllByTestId('tipologia'), 'L6');
    expect(within(l6).getAllByTestId('parametro-tipologia')[1]).toHaveTextContent(/l6_tolerancia_transicao.*sim/);
    expect(porCodigo(screen.getAllByTestId('tipologia'), 'L14')).toHaveTextContent(/l14_faixas_atipicas\s*1\s+2\s+9/);
  });

  it('RF14: comb_pesos vira uma tabela tipologia → peso, e os mínimos da combinação podem ser sobrescritos por execução', async () => {
    renderizar();
    const tabela = await screen.findByRole('table', { name: 'Peso de cada tipologia na combinação' });
    const linhas = within(tabela).getAllByTestId('peso-combinacao');
    expect(linhas).toHaveLength(22);
    const peso = (codigo: string) => within(linhas.find((l) => within(l).getByRole('rowheader').textContent === codigo)!).getByRole('cell').textContent;
    expect(peso('T1')).toBe('1');
    expect(peso('L14')).toBe('0,5');
    expect(peso('L8')).toBe('0 (não conta)');
    const comb = porCodigo(screen.getAllByTestId('tipologia'), 'COMB');
    const parametros = within(comb).getAllByTestId('parametro-tipologia');
    expect(parametros.map((l) => /pode ser sobrescrito por execução/.test(l.textContent ?? ''))).toEqual([true, true, false]);
  });

  it('resposta antiga, sem grupo, sinal_fraco nem peso: o grupo vem do código e o cartão não mostra peso nem selo', () => {
    const base = { historia: '', severidade: 'baixa', prefere_evitar: 'falso_positivo', politica_erro: 'Política.', regra: 'Regra.', base: 'Base.', fontes: [], parametros: [] };
    const listarTipologias = vi.fn(async (): Promise<TipologiaCatalogo[]> => [
      { ...base, codigo: 'T1', nome: 'Empresa aberta pouco antes do contrato' },
      { ...base, codigo: 'L15', nome: 'Número excessivo de atividades econômicas' },
    ]);
    renderizar(clienteFalso({ listarTipologias }));
    return screen.findAllByTestId('grupo-tipologias').then((grupos) => {
      expect(grupos.map((g) => g.querySelector(':scope > h3')?.textContent)).toEqual(['Contratações (1)', 'Lavagem e ocultação (1)']);
      expect(screen.queryByTestId('peso-tipologia')).not.toBeInTheDocument();
      expect(screen.queryByTestId('selo-sinal-fraco')).not.toBeInTheDocument();
    });
  });

  it('l6_limites fora do formato esperado não quebra a tela: aparece como veio', () => {
    render(
      <CartaoTipologia
        tipologia={{
          codigo: 'L6', nome: 'Porte incompatível', historia: '', severidade: 'media', prefere_evitar: 'falso_positivo', politica_erro: 'P.', regra: 'R.', base: 'B.', fontes: [],
          parametros: [{ nome: 'l6_limites', valor: 'indisponível', descricao: 'Limites.', por_execucao: false }],
        }}
      />,
    );
    expect(screen.getByTestId('parametro-tipologia')).toHaveTextContent('indisponível');
    expect(screen.queryByRole('table', { name: 'Limites de receita por regime ou porte' })).not.toBeInTheDocument();
  });
});
