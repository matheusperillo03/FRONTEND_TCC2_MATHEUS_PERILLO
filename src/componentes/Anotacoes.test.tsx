import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ApiCliente, PapelCaso } from '../api';
import { ALERTAS } from '../api/dadosSinteticos';
import { PapelProvider, papelNoCaso } from '../sessao/PapelContext';
import { SessaoProvider } from '../sessao/SessaoContext';
import { clienteFalso } from '../test/clienteFalso';
import { DetalheEntidade } from '../telas/abas/AbaEntidades';
import { Anotacoes } from './Anotacoes';
import { CartaoAlerta } from './CartaoAlerta';

function comSessao(filho: React.ReactNode, cliente: ApiCliente = clienteFalso(), papel?: PapelCaso) {
  const usuario = userEvent.setup();
  render(
    <SessaoProvider cliente={cliente}>
      <PapelProvider value={papelNoCaso(papel)}>{filho}</PapelProvider>
    </SessaoProvider>,
  );
  return { usuario, cliente };
}

describe('Anotações — entidade e alerta (RF08, H37)', () => {
  it('o detalhe da entidade mostra as anotações dela e permite anotar; a nova aparece no topo', async () => {
    const { usuario, cliente } = comSessao(<DetalheEntidade casoId="caso-1" entidadeId="emp-5" />, clienteFalso(), 'investigador');
    const secao = await screen.findByRole('region', { name: 'Anotações do(a) entidade emp-5' });
    const existentes = await within(secao).findAllByTestId('anotacao');
    expect(existentes).toHaveLength(1);
    expect(existentes[0]).toHaveTextContent('analista.demo');
    expect(existentes[0]).toHaveTextContent('Três contratos com o mesmo órgão depois da doação.');
    expect(within(secao).getByText(/só de acréscimo: não se editam nem se apagam/)).toBeInTheDocument();
    expect(within(secao).queryByRole('button', { name: /editar|apagar|excluir|remover/i })).not.toBeInTheDocument();

    const anotar = within(secao).getByRole('button', { name: 'Anotar' });
    expect(anotar).toBeDisabled();
    await usuario.type(within(secao).getByLabelText('Nova anotação'), '   ');
    expect(anotar).toBeDisabled(); // só espaços não é anotação
    await usuario.type(within(secao).getByLabelText('Nova anotação'), 'Sócio também aparece no edital.');
    await usuario.click(anotar);

    await waitFor(() => expect(within(secao).getAllByTestId('anotacao')).toHaveLength(2));
    expect(within(secao).getAllByTestId('anotacao')[0]).toHaveTextContent('Sócio também aparece no edital.');
    expect(within(secao).getByLabelText('Nova anotação')).toHaveValue('');
    expect(await cliente.listarAnotacoes('caso-1', { alvo_tipo: 'entidade', alvo_id: 'emp-5' })).toHaveLength(2);
    expect((await cliente.listarAuditoria('caso-1')).some((e) => e.acao === 'anotacao.criar')).toBe(true);
  });

  it('no cartão do alerta as anotações só são consultadas quando o usuário pede; depois dá para anotar', async () => {
    const cliente = clienteFalso();
    await cliente.executarAlertas('caso-1');
    const alerta = ALERTAS.find((a) => a.id === 'alr-11')!;
    const { usuario } = comSessao(<CartaoAlerta alerta={alerta} casoId="caso-1" />, cliente, 'responsavel');
    const secao = screen.getByRole('region', { name: 'Anotações do(a) alerta alr-11' });
    expect(within(secao).queryByLabelText('Nova anotação')).not.toBeInTheDocument();
    expect((await cliente.listarAuditoria('caso-1')).some((e) => e.acao === 'anotacao.listar')).toBe(false);

    await usuario.click(within(secao).getByRole('button', { name: 'Ver e escrever anotações' }));
    expect(await within(secao).findByText('Nenhuma anotação.')).toBeInTheDocument();
    await usuario.type(within(secao).getByLabelText('Nova anotação'), 'Cláusula conferida no texto do edital.');
    await usuario.click(within(secao).getByRole('button', { name: 'Anotar' }));
    expect(await within(secao).findByText('Cláusula conferida no texto do edital.')).toBeInTheDocument();
    const [gravada] = await cliente.listarAnotacoes('caso-1', { alvo_tipo: 'alerta', alvo_id: 'alr-11' });
    expect(gravada).toMatchObject({ alvo_tipo: 'alerta', alvo_id: 'alr-11', autor: 'analista.demo' });
  });

  it('sem casoId o cartão do alerta não mostra anotações (cartão só de leitura)', () => {
    comSessao(<CartaoAlerta alerta={ALERTAS[0]} />);
    expect(screen.queryByRole('region', { name: /Anotações/ })).not.toBeInTheDocument();
  });

  it('o leitor vê as anotações, mas o campo e o botão ficam desabilitados, com a explicação', async () => {
    comSessao(<Anotacoes casoId="caso-1" alvoTipo="entidade" alvoId="emp-5" />, clienteFalso({}, 'teste automatizado', { token: 'dev-agente' }), 'leitor');
    expect(await screen.findAllByTestId('anotacao')).toHaveLength(1);
    expect(screen.getByLabelText('Nova anotação')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Anotar' })).toBeDisabled();
    expect(screen.getByTestId('somente-leitura')).toHaveTextContent('Seu papel neste caso é leitor: você consulta, mas não altera.');
    expect(screen.getByLabelText('Nova anotação')).toHaveAccessibleDescription(/Seu papel neste caso é leitor/);
  });

  it('a recusa do back-end aparece junto do formulário; o texto da anotação é mostrado como texto, com CPF descaracterizado', async () => {
    // O leitor de verdade (dev-agente), com a interface sem saber o papel: quem recusa é o servidor.
    const cliente = clienteFalso(
      {
        listarAnotacoes: async () => [
          { id: 'a1', alvo_tipo: 'entidade', alvo_id: 'emp-5', autor: 'ana.sintetica', criado_em: '2026-11-16T10:00:00Z', texto: '<img src=x onerror=alert(1)> CPF 000.666.666-00' },
        ],
      },
      'teste automatizado',
      { token: 'dev-agente' },
    );
    const { usuario } = comSessao(<Anotacoes casoId="caso-1" alvoTipo="entidade" alvoId="emp-5" />, cliente);
    const item = await screen.findByTestId('anotacao');
    expect(item).toHaveTextContent('<img src=x onerror=alert(1)> CPF ***666666**');
    expect(item.querySelector('img')).toBeNull();
    await usuario.type(screen.getByLabelText('Nova anotação'), 'tentativa do leitor');
    await usuario.click(screen.getByRole('button', { name: 'Anotar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Seu papel neste caso (leitor) não permite esta ação');
  });
});
