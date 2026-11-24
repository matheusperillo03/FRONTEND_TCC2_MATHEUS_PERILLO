import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErroApi, type Aviso } from '../../api';
import { AVISOS_DEMO } from '../../api/dadosSinteticos';
import { SessaoProvider } from '../../sessao/SessaoContext';
import { clienteFalso } from '../../test/clienteFalso';
import { cpfSinteticoValido, mascarado } from '../../test/cpfSintetico';
import { Caso } from '../Caso';
import { AbaMonitoramento, CartaoAviso } from './AbaMonitoramento';

function renderizar(cliente = clienteFalso(), props: Partial<Parameters<typeof AbaMonitoramento>[0]> = {}) {
  const usuario = userEvent.setup();
  const aoMudar = vi.fn();
  render(
    <SessaoProvider cliente={cliente}>
      <AbaMonitoramento casoId="caso-1" aoMudar={aoMudar} {...props} />
    </SessaoProvider>,
  );
  return { usuario, cliente, aoMudar };
}

describe('AbaMonitoramento — entidades monitoradas (RF06, H18)', () => {
  it('lista entidade, periodicidade, situação e motivo, próxima e última execução e as coletas de origem', async () => {
    renderizar();
    const linhas = await screen.findAllByTestId('monitoramento');
    expect(linhas).toHaveLength(2);
    const [zeta, prefeitura] = linhas;
    expect(zeta).toHaveTextContent('ZETA COMERCIO SINTETICA LTDA');
    expect(zeta).toHaveTextContent('90.000.006/0001-51');
    expect(zeta).toHaveTextContent('diária (24 h)');
    expect(within(zeta).getByText('ativo')).toBeInTheDocument();
    expect(zeta).toHaveTextContent('17/11/2026'); // próxima execução
    expect(zeta).toHaveTextContent('16/11/2026'); // última execução
    expect(within(zeta).getByText('sucesso')).toBeInTheDocument();
    expect(zeta).toHaveTextContent('automática (agendador) · 2 recoletas · 2 avisos');
    expect(within(zeta).getByText('portal_transparencia')).toBeInTheDocument();
    expect(within(zeta).getByText('cnpj_arquivo')).toBeInTheDocument();
    expect(zeta).toHaveTextContent('Acompanhar sanções e aditivos da contratada');

    expect(prefeitura).toHaveTextContent('semanal (168 h)');
    expect(within(prefeitura).getByText('inativo')).toBeInTheDocument();
    expect(prefeitura).toHaveTextContent('Desativado por delegado.demo.');
    expect(within(prefeitura).getByRole('button', { name: 'Executar agora' })).toBeDisabled();
    expect(within(prefeitura).getByRole('button', { name: 'Reativar' })).toBeEnabled();
  });

  it('marca uma entidade com periodicidade semanal e atualiza a lista', async () => {
    const { usuario, cliente, aoMudar } = renderizar();
    await screen.findAllByTestId('monitoramento');
    const botao = screen.getByRole('button', { name: 'Monitorar entidade' });
    expect(botao).toBeDisabled(); // sem entidade escolhida

    await usuario.type(screen.getByLabelText('Entidade a monitorar'), 'TETA');
    await usuario.click(screen.getByRole('button', { name: 'Buscar' }));
    await usuario.click(await screen.findByRole('button', { name: /TETA SERVICOS SINTETICA LTDA/ }));
    await usuario.selectOptions(screen.getByLabelText('Periodicidade'), '168');
    await usuario.click(botao);

    expect(await screen.findByText(/TETA SERVICOS SINTETICA LTDA está sendo monitorada: semanal \(168 h\)/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId('monitoramento')).toHaveLength(3));
    expect(aoMudar).toHaveBeenCalled();
    const criado = (await cliente.listarMonitoramentos('caso-1')).find((m) => m.entidade_id === 'emp-5');
    expect(criado).toMatchObject({ periodicidade_horas: 168, ativo: true, justificativa: 'teste automatizado' });
  });

  it('aceita periodicidade livre em horas, dentro da faixa de 1 a 8760', async () => {
    const criarMonitoramento = vi.fn(async () => {
      throw new ErroApi(422, '/casos/caso-1/monitoramentos', 'A periodicidade mínima é de 2 hora(s).');
    });
    const entidade = { id: 'emp-5', tipo: 'empresa' as const, rotulo: 'TETA SERVICOS SINTETICA LTDA', identificador: '90.000.004/0001-62', atributos: {} };
    const { usuario } = renderizar(clienteFalso({ criarMonitoramento }), { entidadeInicial: entidade });
    // A entidade vinda da aba Entidades já chega escolhida.
    expect(screen.getByText('TETA SERVICOS SINTETICA LTDA')).toBeInTheDocument();
    await usuario.selectOptions(screen.getByLabelText('Periodicidade'), 'outro');
    const horas = screen.getByLabelText('Horas entre execuções');
    const botao = screen.getByRole('button', { name: 'Monitorar entidade' });
    await usuario.clear(horas);
    await usuario.type(horas, '9000');
    expect(botao).toBeDisabled();
    await usuario.clear(horas);
    await usuario.type(horas, '1');
    await usuario.click(botao);
    expect(criarMonitoramento).toHaveBeenCalledWith('caso-1', { entidade_id: 'emp-5', periodicidade_horas: 1 });
    // A recusa do back-end aparece como erro.
    expect(await screen.findByRole('alert')).toHaveTextContent('A periodicidade mínima é de 2 hora(s).');
  });

  it('"Executar agora" mostra o resultado da execução e atualiza a última execução', async () => {
    const { usuario, cliente, aoMudar } = renderizar();
    const [zeta] = await screen.findAllByTestId('monitoramento');
    await usuario.click(within(zeta).getByRole('button', { name: 'Executar agora' }));

    const resultado = (await screen.findByText(/Execução concluída:/)).closest('.br-message')!;
    expect(resultado).toHaveTextContent('sucesso · 2 recoletas · 0 avisos gerados');
    expect(resultado).toHaveTextContent('mesmo conteúdo da coleta anterior');
    await waitFor(() => expect(screen.getAllByTestId('monitoramento')[0]).toHaveTextContent('manual, por analista.demo'));
    expect(aoMudar).toHaveBeenCalled();
    expect((await cliente.listarAuditoria('caso-1')).some((e) => e.acao === 'monitoramento.executar')).toBe(true);
  });

  it('desativa e reativa, e mostra a recusa do back-end na execução (409)', async () => {
    const { usuario } = renderizar();
    const [zeta] = await screen.findAllByTestId('monitoramento');
    await usuario.click(within(zeta).getByRole('button', { name: 'Desativar' }));
    await waitFor(() => expect(within(screen.getAllByTestId('monitoramento')[0]).getByText('inativo')).toBeInTheDocument());
    expect(screen.getAllByTestId('monitoramento')[0]).toHaveTextContent('Desativado por analista.demo.');
    await usuario.click(within(screen.getAllByTestId('monitoramento')[0]).getByRole('button', { name: 'Reativar' }));
    await waitFor(() => expect(within(screen.getAllByTestId('monitoramento')[0]).getByText('ativo')).toBeInTheDocument());
  });

  it('erro na execução (por exemplo, retenção vencida) aparece junto da lista', async () => {
    const executarMonitoramento = vi.fn(async () => {
      throw new ErroApi(403, '/casos/caso-1/monitoramentos/mon-1/executar', 'O prazo de retenção deste caso terminou em 2026-06-30');
    });
    const { usuario } = renderizar(clienteFalso({ executarMonitoramento }));
    const [zeta] = await screen.findAllByTestId('monitoramento');
    await usuario.click(within(zeta).getByRole('button', { name: 'Executar agora' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A execução não foi feita');
    expect(screen.getByRole('alert')).toHaveTextContent('prazo de retenção');
  });
});

describe('AbaMonitoramento — avisos de novidade', () => {
  it('lista tipo, descrição, data, capturas e se foi lido', async () => {
    renderizar();
    const avisos = await screen.findAllByTestId('aviso');
    expect(avisos).toHaveLength(3);
    expect(within(avisos[0]).getByText('Sanção nova')).toBeInTheDocument();
    expect(avisos[0]).toHaveTextContent('Novo registro no CEIS para ZETA COMERCIO SINTETICA LTDA');
    expect(avisos[0]).toHaveTextContent('detectado em 16/11/2026');
    expect(within(avisos[0]).getByText('cap-13')).toBeInTheDocument();
    expect(within(avisos[0]).getByText('não lido')).toBeInTheDocument();
    expect(within(avisos[1]).getByText('Termo de contrato novo')).toBeInTheDocument();
    expect(within(avisos[2]).getByText('Contrato novo')).toBeInTheDocument();
    expect(within(avisos[2]).getByText('lido')).toBeInTheDocument();
    expect(avisos[2]).toHaveTextContent('lido por delegado.demo em 15/11/2026');
    expect(within(avisos[2]).queryByRole('button', { name: 'Marcar como lido' })).not.toBeInTheDocument();
  });

  it('"Marcar como lido" registra a leitura, some com o botão e avisa o cabeçalho do caso', async () => {
    const { usuario, cliente, aoMudar } = renderizar();
    const [primeiro] = await screen.findAllByTestId('aviso');
    await usuario.click(within(primeiro).getByRole('button', { name: 'Marcar como lido' }));
    await waitFor(() => expect(screen.getAllByTestId('aviso')[0]).toHaveTextContent('lido por analista.demo'));
    expect(within(screen.getAllByTestId('aviso')[0]).queryByRole('button', { name: 'Marcar como lido' })).not.toBeInTheDocument();
    expect(aoMudar).toHaveBeenCalled();
    expect(await cliente.listarAvisos('caso-1', true)).toHaveLength(1);
    expect((await cliente.listarAuditoria('caso-1')).some((e) => e.acao === 'aviso.marcar_lido')).toBe(true);
  });

  it('o filtro "Só não lidos" consulta de novo com nao_lidos e esconde os lidos', async () => {
    const base = clienteFalso();
    const listarAvisos = vi.fn((casoId: Parameters<typeof base.listarAvisos>[0], naoLidos?: boolean) => base.listarAvisos(casoId, naoLidos));
    const { usuario } = renderizar(clienteFalso({ listarAvisos }));
    expect(await screen.findAllByTestId('aviso')).toHaveLength(3);
    await usuario.click(screen.getByRole('checkbox', { name: 'Só não lidos' }));
    await waitFor(() => expect(screen.getAllByTestId('aviso')).toHaveLength(2));
    expect(listarAvisos).toHaveBeenLastCalledWith('caso-1', true);
    expect(screen.queryByText('Contrato novo')).not.toBeInTheDocument();
  });

  it('RNF04: CPF completo num aviso vindo da API é mostrado descaracterizado', () => {
    const cpfValido = cpfSinteticoValido();
    const aviso: Aviso = {
      ...AVISOS_DEMO[0],
      tipo: 'quadro_societario',
      titulo: 'Sócio novo: 000.666.666-00',
      // Sem a palavra CPF por perto, vale o dígito verificador (CPF sintético gerado a cada execução).
      descricao: `RICARDO FICTICIO LIMA (${cpfValido}) entrou no quadro societário.`,
      detalhes: { cpf: '00066666600', cnpj: '90000006000151' },
    };
    const { container } = render(<CartaoAviso aviso={aviso} />);
    expect(container.textContent).not.toMatch(/00066666600|000\.666\.666-00/);
    expect(container.textContent).not.toContain(cpfValido);
    expect(screen.getByText(`RICARDO FICTICIO LIMA (${mascarado(cpfValido)}) entrou no quadro societário.`)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sócio novo: ***666666**' })).toBeInTheDocument();
    expect(screen.getByText('90000006000151')).toBeInTheDocument();
    expect(screen.getByText('Quadro societário')).toBeInTheDocument();
  });
});

describe('Caso — abas do horizonte 2', () => {
  function renderizarCaso() {
    const usuario = userEvent.setup();
    render(
      <SessaoProvider cliente={clienteFalso()} inicial={{ token: 'dev-analista', justificativa: 'teste automatizado' }}>
        <Caso casoId="caso-1" aoVoltar={() => undefined} abaInicial="monitoramento" />
      </SessaoProvider>,
    );
    return usuario;
  }

  it('mostra no rótulo da aba Monitoramento os avisos não lidos e atualiza ao marcar um como lido', async () => {
    const usuario = renderizarCaso();
    expect(await screen.findByTestId('avisos-nao-lidos')).toHaveTextContent('2 avisos não lidos');
    expect(screen.getByText(/1 monitoramento ativo · 2 avisos não lidos/)).toBeInTheDocument();
    const [primeiro] = await screen.findAllByTestId('aviso');
    await usuario.click(within(primeiro).getByRole('button', { name: 'Marcar como lido' }));
    await waitFor(() => expect(screen.getByTestId('avisos-nao-lidos')).toHaveTextContent('1 aviso não lido'));
  });

  it('tem as abas Tipologias e Monitoramento, e o botão "Monitorar" da entidade leva ao formulário', async () => {
    const usuario = renderizarCaso();
    expect(screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\d.*$/, ''))).toEqual([
      'Coleta', 'Entidades', 'Grafo', 'Alertas', 'Sugestões da IA', 'Tipologias', 'Monitoramento', 'Equipe', 'Auditoria', 'Relatório',
    ]);
    await usuario.click(screen.getByRole('tab', { name: 'Tipologias' }));
    expect(await screen.findAllByTestId('tipologia')).toHaveLength(25);

    await usuario.click(screen.getByRole('tab', { name: 'Entidades' }));
    await usuario.type(screen.getByLabelText(/Buscar por nome, CNPJ ou CPF parcial/), 'TETA');
    await usuario.click(screen.getByRole('button', { name: 'Buscar' }));
    await usuario.click(await screen.findByRole('button', { name: 'Detalhe' }));
    await usuario.click(await screen.findByRole('button', { name: 'Monitorar' }));

    expect(screen.getByRole('tab', { name: /Monitoramento/ })).toHaveAttribute('aria-selected', 'true');
    const formulario = await screen.findByRole('heading', { name: 'Marcar entidade para monitoramento' });
    expect(formulario).toBeInTheDocument();
    expect(screen.getByText('TETA SERVICOS SINTETICA LTDA', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Monitorar entidade' })).toBeEnabled();
  });
});
