import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessaoProvider } from '../../sessao/SessaoContext';
import { clienteFalso } from '../../test/clienteFalso';
import { DetalheEntidade } from './AbaEntidades';

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
