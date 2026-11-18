import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiCliente, PapelCaso } from '../../api';
import { PapelProvider, papelNoCaso } from '../../sessao/PapelContext';
import { SessaoProvider } from '../../sessao/SessaoContext';
import { clienteFalso } from '../../test/clienteFalso';
import { Caso } from '../Caso';
import { AbaEquipe } from './AbaEquipe';

function renderizar(papel: PapelCaso = 'responsavel', cliente: ApiCliente = clienteFalso()) {
  const usuario = userEvent.setup();
  const aoMudar = vi.fn();
  render(
    <SessaoProvider cliente={cliente} inicial={{ me: { usuario: 'analista.demo', perfil: 'analista' } }}>
      <PapelProvider value={papelNoCaso(papel)}>
        <AbaEquipe casoId="caso-1" aoMudar={aoMudar} />
      </PapelProvider>
    </SessaoProvider>,
  );
  return { usuario, cliente, aoMudar };
}

const tarefa = (titulo: string) => screen.getAllByTestId('tarefa').find((l) => l.textContent?.includes(titulo))!;

describe('AbaEquipe — membros e papéis (RNF01, H23)', () => {
  it('lista os membros com papel, quem acrescentou e quando, e diz o papel de quem consulta', async () => {
    renderizar();
    const linhas = await screen.findAllByTestId('membro');
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toHaveTextContent('analista.demo');
    expect(linhas[0]).toHaveTextContent('(você)');
    expect(within(linhas[0]).getByLabelText('Papel de analista.demo')).toHaveValue('responsavel');
    expect(within(linhas[1]).getByLabelText('Papel de delegado.demo')).toHaveValue('investigador');
    expect(within(linhas[2]).getByLabelText('Papel de agente.demo')).toHaveValue('leitor');
    expect(linhas[2]).toHaveTextContent('12/11/2026');
    expect(screen.getByTestId('meu-papel')).toHaveTextContent('responsável');
    expect(screen.getByText(/Só os membros veem este caso/)).toBeInTheDocument();
  });

  it('o responsável acrescenta um membro, muda um papel e remove outro', async () => {
    const { usuario, cliente, aoMudar } = renderizar();
    await screen.findAllByTestId('membro');
    const acrescentar = screen.getByRole('button', { name: 'Acrescentar membro' });
    expect(acrescentar).toBeDisabled();
    await usuario.type(screen.getByLabelText('Login do usuário'), 'Admin.Demo');
    await usuario.selectOptions(screen.getByLabelText('Papel'), 'leitor');
    await usuario.click(acrescentar);

    expect(await screen.findByText('admin.demo agora é leitor neste caso.')).toBeInTheDocument();
    expect(screen.getAllByTestId('membro')).toHaveLength(4);
    expect(screen.getByLabelText('Login do usuário')).toHaveValue('');
    expect(aoMudar).toHaveBeenCalled();

    await usuario.selectOptions(screen.getByLabelText('Papel de agente.demo'), 'investigador');
    expect(await screen.findByText('agente.demo agora é investigador neste caso.')).toBeInTheDocument();
    expect(screen.getByLabelText('Papel de agente.demo')).toHaveValue('investigador');

    await usuario.click(screen.getByRole('button', { name: 'Remover admin.demo' }));
    expect(await screen.findByText(/admin.demo foi removido\(a\) do caso/)).toBeInTheDocument();
    expect(screen.getAllByTestId('membro')).toHaveLength(3);
    expect((await cliente.listarMembros('caso-1')).map((m) => `${m.usuario}:${m.papel}`)).toEqual([
      'analista.demo:responsavel',
      'delegado.demo:investigador',
      'agente.demo:investigador',
    ]);
    const acoes = (await cliente.listarAuditoria('caso-1')).map((e) => e.acao);
    expect(acoes).toEqual(expect.arrayContaining(['membro.definir', 'membro.remover']));
  });

  it('o único responsável não pode ser rebaixado nem removido; login desconhecido mostra a recusa do back-end (422)', async () => {
    const { usuario } = renderizar();
    await screen.findAllByTestId('membro');
    expect(screen.getByLabelText('Papel de analista.demo')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remover analista.demo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remover analista.demo' })).toHaveAttribute('title', 'O caso precisa de ao menos um responsável');
    expect(screen.getByLabelText('Papel de delegado.demo')).toBeEnabled();

    await usuario.type(screen.getByLabelText('Login do usuário'), 'ninguem.sintetico');
    await usuario.click(screen.getByRole('button', { name: 'Acrescentar membro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Não há usuário ativo com o login 'ninguem.sintetico'.");
    expect(screen.getAllByTestId('membro')).toHaveLength(3);

    // Com um segundo responsável, o primeiro pode mudar de papel.
    await usuario.selectOptions(screen.getByLabelText('Papel de delegado.demo'), 'responsavel');
    await waitFor(() => expect(screen.getByLabelText('Papel de analista.demo')).toBeEnabled());
  });

  it('o investigador vê a equipe sem os controles de gestão habilitados, com a explicação', async () => {
    renderizar('investigador', clienteFalso({}, 'teste automatizado', { token: 'dev-delegado' }));
    await screen.findAllByTestId('membro');
    expect(screen.getByText(/Só o responsável pelo caso acrescenta membros, muda papéis e remove membros/)).toBeInTheDocument();
    for (const controle of [...screen.getAllByLabelText(/^Papel de /), ...screen.getAllByRole('button', { name: /^Remover / })]) expect(controle).toBeDisabled();
    expect(screen.getByLabelText('Login do usuário')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Acrescentar membro' })).toBeDisabled();
    // Mas o investigador cria e altera tarefas.
    expect(screen.getByLabelText('Título da tarefa')).toBeEnabled();
  });

  it('o leitor vê tudo com a escrita desabilitada e a explicação do papel', async () => {
    renderizar('leitor', clienteFalso({}, 'teste automatizado', { token: 'dev-agente' }));
    expect(await screen.findAllByTestId('membro')).toHaveLength(3);
    expect(await screen.findAllByTestId('tarefa')).toHaveLength(3);
    expect(await screen.findAllByTestId('anotacao')).toHaveLength(2);
    expect(screen.getByTestId('meu-papel')).toHaveTextContent('leitor');
    expect(screen.getByTestId('tarefas-somente-leitura')).toHaveTextContent('Seu papel neste caso é leitor: você consulta, mas não altera.');
    for (const rotulo of ['Título da tarefa', 'Responsável pela tarefa', 'Descrição da tarefa', 'Prazo da tarefa', 'Login do usuário']) {
      expect(screen.getByLabelText(rotulo)).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Criar tarefa' })).toBeDisabled();
    for (const botao of screen.getAllByRole('button', { name: 'Alterar' })) expect(botao).toBeDisabled();
    for (const botao of screen.getAllByRole('button', { name: /^Remover / })) expect(botao).toBeDisabled();
  });
});

describe('AbaEquipe — tarefas com histórico (RF08, H37)', () => {
  it('lista as tarefas com situação, responsável, prazo e a marca de atrasada; filtra por situação', async () => {
    const { usuario } = renderizar();
    const tarefas = await screen.findAllByTestId('tarefa');
    expect(tarefas).toHaveLength(3);
    expect(tarefas[0]).toHaveTextContent('Pedir os processos de contratação ao órgão');
    expect(within(tarefas[0]).getByText('aberta')).toBeInTheDocument();
    expect(within(tarefas[0]).getByText('atrasada')).toBeInTheDocument();
    expect(tarefas[0]).toHaveTextContent('Responsável: delegado.demo');
    expect(tarefas[0]).toHaveTextContent('Prazo: 10/11/2026');
    expect(within(tarefas[1]).getByText('em andamento')).toBeInTheDocument();
    expect(within(tarefas[1]).queryByText('atrasada')).not.toBeInTheDocument();
    expect(tarefas[2]).toHaveTextContent('Prazo: sem prazo');

    await usuario.selectOptions(screen.getByLabelText('Situação das tarefas'), 'concluida');
    await waitFor(() => expect(screen.getAllByTestId('tarefa')).toHaveLength(1));
    expect(screen.getByTestId('tarefa')).toHaveTextContent('Coletar os dados abertos do CNPJ das contratadas');
  });

  it('mostra o histórico: quem mudou, quando e cada campo com o valor anterior e o novo', async () => {
    renderizar();
    await screen.findAllByTestId('tarefa');
    const historico = within(tarefa('Revisar as sugestões da IA')).getByRole('list', { name: /Histórico da tarefa Revisar as sugestões da IA/ });
    const eventos = within(historico).getAllByTestId('evento-tarefa');
    expect(eventos).toHaveLength(2);
    expect(eventos[0]).toHaveTextContent('delegado.demo em 14/11/2026');
    expect(eventos[0]).toHaveTextContent('situação: (vazio) → aberta');
    expect(eventos[0]).toHaveTextContent('prazo: (vazio) → 01/12/2099');
    expect(eventos[1]).toHaveTextContent('analista.demo em 15/11/2026');
    expect(eventos[1]).toHaveTextContent('responsável: (vazio) → analista.demo');
    expect(eventos[1]).toHaveTextContent('situação: aberta → em andamento');
    expect(within(tarefa('Revisar as sugestões da IA')).getByText('Histórico (2)')).toBeInTheDocument();
  });

  it('cria uma tarefa com responsável escolhido entre os membros e prazo', async () => {
    const criarTarefa = vi.fn();
    const base = clienteFalso();
    const cliente = clienteFalso({
      criarTarefa: (...args: Parameters<ApiCliente['criarTarefa']>) => {
        criarTarefa(...args);
        return base.criarTarefa(...args);
      },
      listarTarefas: (...args: Parameters<ApiCliente['listarTarefas']>) => base.listarTarefas(...args),
      listarMembros: (...args: Parameters<ApiCliente['listarMembros']>) => base.listarMembros(...args),
    });
    const { usuario, aoMudar } = renderizar('responsavel', cliente);
    await screen.findAllByTestId('tarefa');
    // O select de responsável só oferece os membros do caso.
    await waitFor(() =>
      expect(Array.from((screen.getByLabelText('Responsável pela tarefa') as HTMLSelectElement).options).map((o) => o.value)).toEqual(['', 'analista.demo', 'delegado.demo', 'agente.demo']),
    );
    const criar = screen.getByRole('button', { name: 'Criar tarefa' });
    expect(criar).toBeDisabled();
    await usuario.type(screen.getByLabelText('Título da tarefa'), 'Ouvir o pregoeiro');
    await usuario.selectOptions(screen.getByLabelText('Responsável pela tarefa'), 'delegado.demo');
    await usuario.type(screen.getByLabelText('Prazo da tarefa'), '2099-01-31');
    await usuario.click(criar);

    await waitFor(() => expect(screen.getAllByTestId('tarefa')).toHaveLength(4));
    expect(criarTarefa).toHaveBeenCalledWith('caso-1', { titulo: 'Ouvir o pregoeiro', responsavel: 'delegado.demo', prazo: '2099-01-31' });
    expect(tarefa('Ouvir o pregoeiro')).toHaveTextContent('Responsável: delegado.demo');
    expect(tarefa('Ouvir o pregoeiro')).toHaveTextContent('Prazo: 31/01/2099');
    expect(within(tarefa('Ouvir o pregoeiro')).getByText('Histórico (1)')).toBeInTheDocument();
    expect(screen.getByLabelText('Título da tarefa')).toHaveValue('');
    expect(aoMudar).toHaveBeenCalled();
  });

  it('altera a situação e limpa o prazo: só os campos mudados são enviados, e o histórico ganha a linha', async () => {
    const alterarTarefa = vi.fn();
    const base = clienteFalso();
    const cliente = clienteFalso({
      alterarTarefa: (...args: Parameters<ApiCliente['alterarTarefa']>) => {
        alterarTarefa(...args);
        return base.alterarTarefa(...args);
      },
      listarTarefas: (...args: Parameters<ApiCliente['listarTarefas']>) => base.listarTarefas(...args),
    });
    const { usuario } = renderizar('responsavel', cliente);
    await screen.findAllByTestId('tarefa');
    const cartao = () => tarefa('Pedir os processos de contratação ao órgão');
    await usuario.click(within(cartao()).getByRole('button', { name: 'Alterar' }));
    const gravar = within(cartao()).getByRole('button', { name: 'Gravar alterações' });
    expect(gravar).toBeDisabled(); // nada mudou ainda
    await usuario.selectOptions(within(cartao()).getByLabelText('Situação'), 'concluida');
    await usuario.clear(within(cartao()).getByLabelText('Prazo'));
    await usuario.click(gravar);

    await waitFor(() => expect(within(cartao()).getByText('concluída')).toBeInTheDocument());
    expect(alterarTarefa).toHaveBeenCalledWith('caso-1', 'tar-1', { situacao: 'concluida', prazo: null });
    expect(within(cartao()).queryByText('atrasada')).not.toBeInTheDocument();
    expect(cartao()).toHaveTextContent('Prazo: sem prazo');
    const eventos = within(cartao()).getAllByTestId('evento-tarefa');
    expect(eventos).toHaveLength(2);
    expect(eventos[1]).toHaveTextContent('analista.demo');
    expect(eventos[1]).toHaveTextContent('situação: aberta → concluída');
    expect(eventos[1]).toHaveTextContent('prazo: 10/11/2026 → (vazio)');
  });

  it('a recusa do back-end na alteração aparece no cartão da tarefa', async () => {
    const { usuario } = renderizar('investigador', clienteFalso({}, 'teste automatizado', { token: 'dev-agente' }));
    await screen.findAllByTestId('tarefa');
    const cartao = tarefa('Pedir os processos de contratação ao órgão');
    await usuario.click(within(cartao).getByRole('button', { name: 'Alterar' }));
    await usuario.selectOptions(within(cartao).getByLabelText('Situação'), 'cancelada');
    await usuario.click(within(cartao).getByRole('button', { name: 'Gravar alterações' }));
    expect(await within(cartao).findByRole('alert')).toHaveTextContent('Seu papel neste caso (leitor) não permite esta ação');
  });
});

describe('AbaEquipe — lista geral de anotações', () => {
  it('mostra todas as anotações do caso, da mais recente para a mais antiga, com o alvo de cada uma', async () => {
    renderizar();
    const lista = await screen.findByRole('list', { name: 'Anotações do caso' });
    const itens = within(lista).getAllByTestId('anotacao');
    expect(itens).toHaveLength(2);
    expect(itens[0]).toHaveTextContent('delegado.demo');
    expect(itens[0]).toHaveTextContent('entidade edital_restritivo.txt');
    expect(itens[1]).toHaveTextContent('entidade TETA SERVICOS SINTETICA LTDA');
    expect(screen.getByText(/Para anotar, abra a entidade \(aba Entidades\) ou o alerta \(aba Alertas\)/)).toBeInTheDocument();
  });
});

describe('Caso — papel no caso e abas do horizonte 3', () => {
  function renderizarCaso(token = 'dev-analista', abaInicial: Parameters<typeof Caso>[0]['abaInicial'] = 'equipe', iaAtiva = true) {
    const usuario = userEvent.setup();
    render(
      <SessaoProvider cliente={clienteFalso({}, 'teste automatizado', { token, iaAtiva })} inicial={{ token, justificativa: 'teste automatizado' }}>
        <Caso casoId="caso-1" aoVoltar={() => undefined} abaInicial={abaInicial} />
      </SessaoProvider>,
    );
    return usuario;
  }

  it('o cabeçalho mostra o papel e as contagens novas; as abas Equipe e Sugestões da IA mostram o que está pendente', async () => {
    renderizarCaso();
    expect(await screen.findByTestId('papel-no-caso')).toHaveTextContent('responsável');
    expect(screen.getByText(/3 membros · 2 tarefas abertas · 2 anotações · 6 sugestões de IA pendentes/)).toBeInTheDocument();
    expect(screen.getByTestId('tarefas-abertas')).toHaveTextContent('2 tarefas abertas');
    expect(screen.getByTestId('sugestoes-ia-pendentes')).toHaveTextContent('6 sugestões pendentes');
    expect(screen.queryByText(/O servidor recusa as ações de escrita/)).not.toBeInTheDocument();
    expect(await screen.findAllByTestId('membro')).toHaveLength(3);
  });

  it('para o leitor, o caso avisa que as ações de escrita são recusadas e a aba Equipe fica só para leitura', async () => {
    renderizarCaso('dev-agente');
    expect(await screen.findByTestId('papel-no-caso')).toHaveTextContent('leitor');
    expect(screen.getByText(/O servidor recusa as ações de escrita \(403\) e registra cada tentativa na auditoria/)).toBeInTheDocument();
    await screen.findAllByTestId('tarefa');
    expect(screen.getByRole('button', { name: 'Criar tarefa' })).toBeDisabled();
  });

  it('quem não é membro vê a recusa do back-end', async () => {
    renderizarCaso('dev-admin');
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('Você não é membro deste caso.');
  });

  it('a entidade do tipo edital oferece "Extrair com IA", que leva a captura do texto à aba Sugestões da IA', async () => {
    const usuario = renderizarCaso('dev-analista', 'entidades');
    await usuario.type(screen.getByLabelText(/Buscar por nome, CNPJ ou CPF parcial/), 'edital_restritivo');
    await usuario.click(screen.getByRole('button', { name: 'Buscar' }));
    await usuario.click(await screen.findByRole('button', { name: 'Detalhe' }));
    await usuario.click(await screen.findByRole('button', { name: 'Extrair com IA' }));

    expect(screen.getByRole('tab', { name: /Sugestões da IA/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Captura do documento')).toHaveValue('cap-10');
  });

  it('com a IA desligada no servidor, a entidade não oferece "Extrair com IA"; outra entidade nunca oferece', async () => {
    const usuario = renderizarCaso('dev-analista', 'entidades', false);
    await usuario.type(screen.getByLabelText(/Buscar por nome, CNPJ ou CPF parcial/), 'edital_restritivo');
    await usuario.click(screen.getByRole('button', { name: 'Buscar' }));
    await usuario.click(await screen.findByRole('button', { name: 'Detalhe' }));
    expect(await screen.findByRole('button', { name: 'Monitorar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Extrair com IA' })).not.toBeInTheDocument();
  });
});
