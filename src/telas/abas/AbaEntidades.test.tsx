import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessaoProvider } from '../../sessao/SessaoContext';
import { clienteFalso } from '../../test/clienteFalso';
import { TIPOS_ENTIDADE } from '../../api';
import { ROTULOS_TIPO_NO } from '../../grafo/mapear';
import { AbaEntidades, DetalheEntidade } from './AbaEntidades';

describe('DetalheEntidade — homônimos como sugestão, nunca fusão (RF02)', () => {
  it('mantém a entidade com seu identificador e mostra o homônimo só como sugestão não fundida', async () => {
    render(
      <SessaoProvider cliente={clienteFalso()}>
        <DetalheEntidade casoId="caso-1" entidadeId="pes-1" />
      </SessaoProvider>,
    );
    const titulo = await screen.findByRole('heading', { name: /JOÃO EXEMPLO DA SILVA/ });
    expect(titulo).toBeInTheDocument();
    // A entidade exibida continua sendo só a pes-1, com o seu CPF parcial.
    expect(screen.getByText('***123456**', { selector: 'code' })).toBeInTheDocument();
    expect(screen.getByText(/id pes-1/)).toBeInTheDocument();

    const lista = screen.getByRole('list', { name: /Sugestões de resolução/ });
    const sugestoes = within(lista).getAllByTestId('sugestao');
    expect(sugestoes).toHaveLength(1);
    expect(within(sugestoes[0]).getByText('sugestão — não fundida')).toBeInTheDocument();
    expect(within(sugestoes[0]).getByText('***987654**')).toBeInTheDocument();
    expect(within(sugestoes[0]).getByText(/não foi fundido/)).toBeInTheDocument();

    // O CPF do homônimo não aparece nos atributos da entidade (não houve fusão).
    const atributos = screen.getAllByRole('table')[0];
    expect(within(atributos).queryByText('***987654**')).not.toBeInTheDocument();
    expect(within(atributos).getByText('***123456**')).toBeInTheDocument();
  });

  it('lista as fontes com o id da captura', async () => {
    render(
      <SessaoProvider cliente={clienteFalso()}>
        <DetalheEntidade casoId="caso-1" entidadeId="emp-1" />
      </SessaoProvider>,
    );
    await screen.findByRole('heading', { name: /ALFA SOLUÇÕES EM TI LTDA/ });
    expect(screen.getByText('cap-1')).toBeInTheDocument();
    expect(screen.getByText('cap-3')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma sugestão.')).toBeInTheDocument();
  });
});

describe('AbaEntidades — H09/RF11: filtro por tipo de entidade', () => {
  function montar(cliente = clienteFalso()) {
    render(
      <SessaoProvider cliente={cliente}>
        <AbaEntidades casoId="caso-1" />
      </SessaoProvider>,
    );
    return cliente;
  }

  it('H09: oferece "Todos os tipos" e uma opção para cada tipo que a API aceita', () => {
    montar();
    const filtro = screen.getByRole('combobox', { name: 'Tipo de entidade' });
    const opcoes = within(filtro).getAllByRole('option') as HTMLOptionElement[];
    expect(opcoes.map((o) => o.value)).toEqual(['', ...TIPOS_ENTIDADE]);
    expect(opcoes.map((o) => o.textContent)).toEqual(['Todos os tipos', ...TIPOS_ENTIDADE.map((t) => ROTULOS_TIPO_NO[t])]);
    expect(filtro).toHaveValue('');
  });

  it('H09: sem tipo escolhido, a busca não envia filtro e lista entidades de mais de um tipo', async () => {
    const real = clienteFalso();
    const buscarEntidades = vi.fn(real.buscarEntidades);
    montar(clienteFalso({ buscarEntidades }));
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    const tabela = await screen.findByRole('table', { name: 'Entidades encontradas' });
    expect(buscarEntidades).toHaveBeenCalledWith('caso-1', '', undefined);
    expect(within(tabela).getAllByText('Empresa').length).toBeGreaterThan(0);
    expect(within(tabela).getAllByText('Pessoa').length).toBeGreaterThan(0);
  });

  it('H09: com o tipo "Empresa", envia tipo=empresa junto com o termo e a lista só traz empresas', async () => {
    const real = clienteFalso();
    const buscarEntidades = vi.fn(real.buscarEntidades);
    montar(clienteFalso({ buscarEntidades }));
    await userEvent.type(screen.getByLabelText('Buscar por nome, CNPJ ou CPF parcial'), 'a');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo de entidade' }), 'empresa');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    const tabela = await screen.findByRole('table', { name: 'Entidades encontradas' });
    expect(buscarEntidades).toHaveBeenLastCalledWith('caso-1', 'a', 'empresa');
    const linhas = within(tabela).getAllByRole('row').slice(1);
    expect(linhas.length).toBeGreaterThan(0);
    for (const linha of linhas) expect(within(linha).getAllByRole('cell')[0]).toHaveTextContent('Empresa');
    expect(within(tabela).queryByText('Pessoa')).not.toBeInTheDocument();
  });

  it('H09: trocar o tipo depois de uma busca refaz a busca com o novo filtro', async () => {
    const real = clienteFalso();
    const buscarEntidades = vi.fn(real.buscarEntidades);
    montar(clienteFalso({ buscarEntidades }));
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByRole('table', { name: 'Entidades encontradas' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo de entidade' }), 'pessoa');
    expect(buscarEntidades).toHaveBeenLastCalledWith('caso-1', '', 'pessoa');
    const tabela = await screen.findByRole('table', { name: 'Entidades encontradas' });
    const linhas = within(tabela).getAllByRole('row').slice(1);
    for (const linha of linhas) expect(within(linha).getAllByRole('cell')[0]).toHaveTextContent('Pessoa');
  });

  it('H09: quando o tipo escolhido não tem entidade no caso, avisa que nada foi encontrado', async () => {
    montar();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo de entidade' }), 'convenio');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText(/Nenhuma entidade encontrada/)).toBeInTheDocument();
  });
});
