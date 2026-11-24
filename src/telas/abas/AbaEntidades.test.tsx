import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErroApi, TIPOS_ENTIDADE, type ApiCliente, type EntidadeDetalhe, type LinhaDoTempoPatrimonial, type PapelCaso } from '../../api';
import { ROTULOS_TIPO_NO } from '../../grafo/mapear';
import { PapelProvider, papelNoCaso } from '../../sessao/PapelContext';
import { SessaoProvider } from '../../sessao/SessaoContext';
import { clienteFalso } from '../../test/clienteFalso';
import { cpfSinteticoValido, mascarado } from '../../test/cpfSintetico';
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

/** Renderiza o detalhe com o papel do usuário no caso (o token do simulado e o papel da tela andam juntos). */
function renderizar(entidadeId: string, opcoes: { papel?: PapelCaso; sobrescritas?: Partial<ApiCliente>; aoAbrirOutra?: (id: unknown) => void } = {}) {
  const papel = opcoes.papel ?? 'responsavel';
  const token = papel === 'leitor' ? 'dev-agente' : papel === 'investigador' ? 'dev-delegado' : 'dev-analista';
  const cliente = clienteFalso(opcoes.sobrescritas, 'teste automatizado', { token });
  const usuario = userEvent.setup();
  const tela = render(
    <SessaoProvider cliente={cliente}>
      <PapelProvider value={papelNoCaso(papel)}>
        <DetalheEntidade casoId="caso-1" entidadeId={entidadeId} aoAbrirOutra={opcoes.aoAbrirOutra} />
      </PapelProvider>
    </SessaoProvider>,
  );
  return { cliente, usuario, ...tela };
}

async function sugestaoDoSocio() {
  const lista = await screen.findByRole('list', { name: /Sugestões de resolução/ });
  return within(lista).getByTestId('sugestao');
}

describe('DetalheEntidade — decisão da sugestão de resolução (H46)', () => {
  it('H46: a sugestão candidato x sócio aparece como pendente, e o texto diz que confirmar não funde os registros', async () => {
    renderizar('cand-3');
    const item = await sugestaoDoSocio();
    expect(within(item).getByTestId('situacao-sugestao')).toHaveTextContent('pendente');
    expect(within(item).getByText('sugestão — não fundida')).toBeInTheDocument();
    expect(within(item).getByText('***234567**')).toBeInTheDocument();
    expect(within(item).getByText(/confiança 90%/)).toBeInTheDocument();
    expect(within(item).getByText(/Confirmar não funde os registros/)).toBeInTheDocument();
    // Sem justificativa (ou só com espaços), os dois botões ficam desabilitados.
    const confirmar = within(item).getByRole('button', { name: 'Confirmar sugestão' });
    const descartar = within(item).getByRole('button', { name: 'Descartar sugestão' });
    expect(confirmar).toBeDisabled();
    expect(descartar).toBeDisabled();
    await userEvent.type(within(item).getByLabelText('Justificativa da decisão (obrigatória)'), '   ');
    expect(confirmar).toBeDisabled();
  });

  it('H46: o investigador confirma com justificativa; a tela mostra quem decidiu, quando e por quê, e os registros continuam separados', async () => {
    const { cliente, usuario } = renderizar('cand-3', { papel: 'investigador' });
    const item = await sugestaoDoSocio();
    await usuario.type(within(item).getByLabelText('Justificativa da decisão (obrigatória)'), 'Conferido no registro de candidatura');
    await usuario.click(within(item).getByRole('button', { name: 'Confirmar sugestão' }));
    await waitFor(() => expect(within(item).getByTestId('situacao-sugestao')).toHaveTextContent('confirmada pelo investigador'));
    expect(within(item).getByTestId('decisao-sugestao')).toHaveTextContent(/por delegado\.demo em \d{2}\/\d{2}\/\d{4}/);
    expect(within(item).getByTestId('decisao-sugestao')).toHaveTextContent('Justificativa: Conferido no registro de candidatura');
    expect(within(item).getByText('sugestão — não fundida')).toBeInTheDocument();
    // O campo é limpo e a decisão pode ser revista.
    expect(within(item).getByLabelText('Justificativa da revisão (obrigatória)')).toHaveValue('');
    expect(within(item).getByRole('button', { name: 'Rever: descartar' })).toBeInTheDocument();
    // A decisão vale para o par e não fundiu: o sócio continua existindo, com a sugestão confirmada.
    const socio = await cliente.obterEntidade('caso-1', 'pes-2');
    expect(socio.tipo).toBe('pessoa');
    expect(socio.sugestoes.find((s) => s.entidade_id === 'cand-3')?.situacao).toBe('confirmado');
    expect(screen.getByRole('heading', { name: /MARIA EXEMPLO SOUZA/ })).toBeInTheDocument();
    expect(screen.getByText(/id cand-3/)).toBeInTheDocument();
  });

  it('H46: descartar mostra "descartada pelo investigador" com a justificativa', async () => {
    const { usuario } = renderizar('pes-2');
    const item = await sugestaoDoSocio();
    await usuario.type(within(item).getByLabelText('Justificativa da decisão (obrigatória)'), 'Homônimo: filiação diferente');
    await usuario.click(within(item).getByRole('button', { name: 'Descartar sugestão' }));
    await waitFor(() => expect(within(item).getByTestId('situacao-sugestao')).toHaveTextContent('descartada pelo investigador'));
    expect(within(item).getByTestId('decisao-sugestao')).toHaveTextContent('por analista.demo');
    expect(within(item).getByTestId('decisao-sugestao')).toHaveTextContent('Justificativa: Homônimo: filiação diferente');
  });

  it('H46: o leitor vê a situação e a decisão já registrada, sem campo de justificativa nem botões', async () => {
    const decidida: EntidadeDetalhe = {
      id: 'cand-3',
      tipo: 'candidato',
      rotulo: 'MARIA EXEMPLO SOUZA',
      identificador: '2024:900002',
      atributos: {},
      fontes: [],
      outras_candidaturas: [],
      sugestoes: [
        { id: 'sgr-7', entidade_id: 'pes-2', rotulo: 'MARIA EXEMPLO SOUZA', identificador: '***234567**', tipo: 'pessoa', motivo: 'Possível coincidência.', confianca: 0.9, situacao: 'confirmado', decidido_por: 'delegado.demo', decidido_em: '2026-11-23T13:00:00Z', justificativa_decisao: 'Conferido no registro de candidatura' },
        { id: 'sgr-9', entidade_id: 'pes-9', rotulo: 'MARIA EXEMPLO SOUZA', identificador: '***234567**', tipo: 'pessoa', motivo: 'Possível coincidência.', confianca: 0.9, situacao: 'pendente', decidido_por: null, decidido_em: null, justificativa_decisao: null },
      ],
    };
    renderizar('cand-3', { papel: 'leitor', sobrescritas: { obterEntidade: async () => decidida } });
    const lista = await screen.findByRole('list', { name: /Sugestões de resolução/ });
    const [confirmada, pendente] = within(lista).getAllByTestId('sugestao');
    expect(within(confirmada).getByTestId('situacao-sugestao')).toHaveTextContent('confirmada pelo investigador');
    expect(within(confirmada).getByTestId('decisao-sugestao')).toHaveTextContent('por delegado.demo em 23/11/2026');
    expect(within(confirmada).getByTestId('decisao-sugestao')).toHaveTextContent('Justificativa: Conferido no registro de candidatura');
    expect(within(pendente).getByTestId('situacao-sugestao')).toHaveTextContent('pendente');
    expect(within(lista).queryByRole('button', { name: /Confirmar|Descartar|Rever/ })).not.toBeInTheDocument();
    expect(within(lista).queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(/Só o investigador ou o responsável pelo caso confirma ou descarta sugestões/)).toBeInTheDocument();
  });

  it('H46: o erro da API (403 do back-end) aparece junto do formulário e a situação não muda', async () => {
    const decidirSugestao = vi.fn(async () => {
      throw new ErroApi(403, '/casos/caso-1/sugestoes/x/decisao', 'Seu papel neste caso (leitor) não permite esta ação (exige investigador).');
    });
    const { usuario } = renderizar('cand-3', { sobrescritas: { decidirSugestao } });
    const item = await sugestaoDoSocio();
    await usuario.type(within(item).getByLabelText('Justificativa da decisão (obrigatória)'), 'Conferido');
    await usuario.click(within(item).getByRole('button', { name: 'Confirmar sugestão' }));
    expect(await within(item).findByRole('alert')).toHaveTextContent(/não permite esta ação/);
    expect(decidirSugestao).toHaveBeenCalledWith('caso-1', expect.anything(), { decisao: 'confirmado', justificativa: 'Conferido' });
    expect(within(item).getByTestId('situacao-sugestao')).toHaveTextContent('pendente');
    expect(within(item).getByLabelText('Justificativa da decisão (obrigatória)')).toHaveValue('Conferido');
  });

  it('H46: o CPF que vier na justificativa ou no motivo só aparece descaracterizado', async () => {
    const cpf = cpfSinteticoValido();
    const comCpf: EntidadeDetalhe = {
      id: 'cand-3',
      tipo: 'candidato',
      rotulo: 'MARIA EXEMPLO SOUZA',
      identificador: '2024:900002',
      atributos: {},
      fontes: [],
      sugestoes: [{ id: 'sgr-7', entidade_id: 'pes-2', rotulo: 'MARIA EXEMPLO SOUZA', motivo: `Mesmo nome; CPF ${cpf}.`, situacao: 'descartado', decidido_por: 'ana', decidido_em: '2026-11-23T13:00:00Z', justificativa_decisao: `CPF ${cpf} é de outra pessoa` }],
    };
    const { container } = renderizar('cand-3', { sobrescritas: { obterEntidade: async () => comCpf } });
    const item = await sugestaoDoSocio();
    expect(within(item).getByTestId('decisao-sugestao')).toHaveTextContent(`CPF ${mascarado(cpf)} é de outra pessoa`);
    expect(container.textContent).not.toContain(cpf);
  });
});

describe('DetalheEntidade — candidato: outras candidaturas e linha do tempo patrimonial (H50, H51)', () => {
  it('H50: mostra as outras candidaturas da mesma pessoa, explica a ligação pelo título eleitoral (só por resumo, nunca exibido) e abre a outra entidade', async () => {
    const aoAbrirOutra = vi.fn();
    const { usuario, container } = renderizar('cand-3', { aoAbrirOutra });
    const tabela = await screen.findByRole('table', { name: 'Outras candidaturas da mesma pessoa' });
    expect(screen.getByRole('heading', { name: 'Outras candidaturas da mesma pessoa' })).toBeInTheDocument();
    const [, linha] = within(tabela).getAllByRole('row');
    expect(linha).toHaveTextContent('2020');
    expect(linha).toHaveTextContent('VEREADOR');
    expect(linha).toHaveTextContent('GO');
    expect(linha).toHaveTextContent('ELEITO POR QP');
    expect(screen.getByTestId('explicacao-ligacao')).toHaveTextContent(/título eleitoral, comparado só por um resumo.*que o sistema não exibe/);
    expect(screen.getByTestId('explicacao-ligacao')).toHaveTextContent(/não foram fundidas/);
    await usuario.click(within(linha).getByRole('button', { name: 'Abrir a candidatura de 2020' }));
    expect(aoAbrirOutra).toHaveBeenCalledWith('cand-2');
    // Nenhum número de título (12 dígitos) na tela.
    expect(container.textContent).not.toMatch(/\b\d{12}\b/);
  });

  it('H50: candidato de uma eleição só diz que não há outras candidaturas; quem não é candidato não tem os blocos', async () => {
    const { unmount } = renderizar('cand-1');
    expect(await screen.findByText('Nenhuma outra candidatura desta pessoa no caso.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Linha do tempo patrimonial' })).toBeInTheDocument();
    unmount();
    const obterPatrimonio = vi.fn();
    renderizar('pes-2', { sobrescritas: { obterPatrimonio } });
    await sugestaoDoSocio();
    expect(screen.queryByRole('heading', { name: 'Outras candidaturas da mesma pessoa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Linha do tempo patrimonial' })).not.toBeInTheDocument();
    expect(obterPatrimonio).not.toHaveBeenCalled();
  });

  it('H51: a linha do tempo mostra, por eleição, total em reais, quantidade, soma por tipo, a captura com o SHA-256 e a variação', async () => {
    const { cliente } = renderizar('cand-3');
    const tabela = await screen.findByRole('table', { name: 'Bens declarados por eleição' });
    const [, de2020, de2024] = within(tabela).getAllByRole('row');
    expect(de2020).toHaveTextContent('2020');
    expect(de2020).toHaveTextContent(/R\$\s180\.000,00/);
    expect(de2020).toHaveTextContent('2 bens');
    expect(de2020).toHaveTextContent(/Casa: R\$\s150\.000,00 \(1\)/);
    expect(de2024).toHaveTextContent(/R\$\s455\.000,00/);
    expect(de2024).toHaveTextContent('4 bens');
    // Captura de origem: id, fonte e SHA-256 completo (no title do componente Hash).
    const linha = await cliente.obterPatrimonio('caso-1', 'cand-3');
    expect(linha.pontos[1].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(within(de2024).getByTitle(linha.pontos[1].sha256!)).toBeInTheDocument();
    expect(de2024).toHaveTextContent(String(linha.pontos[1].captura_id));
    expect(de2024).toHaveTextContent('tse_bens');
    // Nota sempre visível e variação entre eleições.
    expect(screen.getByTestId('nota-patrimonio')).toHaveTextContent(/valor informado pelo candidato/);
    expect(screen.getByTestId('variacoes-patrimonio')).toHaveTextContent(/2020 → 2024: \+\s?R\$\s275\.000,00 \(\+152,78%\)/);
    expect(screen.getByText(/ligadas pelo título eleitoral/)).toBeInTheDocument();
  });

  it('H51: a lista dos bens de cada eleição fica num detalhe expansível, com tipo, descrição e valor', async () => {
    const { usuario } = renderizar('cand-3');
    const resumo = await screen.findByText('Ver os 4 bens declarados em 2024');
    const detalhe = resumo.closest('details')!;
    expect(detalhe).not.toHaveAttribute('open');
    await usuario.click(resumo);
    expect(detalhe).toHaveAttribute('open');
    const bens = within(detalhe).getByRole('table', { name: 'Bens declarados em 2024' });
    expect(within(bens).getAllByRole('row')).toHaveLength(5);
    expect(bens).toHaveTextContent('Terreno');
    expect(bens).toHaveTextContent(/R\$\s200\.000,00/);
    expect(screen.getByText('Ver os 2 bens declarados em 2020')).toBeInTheDocument();
  });

  it('H51: sem renda pública conhecida, a tela mostra o motivo e diz que não há alerta', async () => {
    renderizar('cand-3');
    const aviso = await screen.findByTestId('renda-publica');
    expect(aviso).toHaveTextContent(/Renda pública não conhecida/);
    expect(aviso).toHaveTextContent(/ainda não coleta remuneração pública/);
    expect(aviso).toHaveTextContent(/Não há alerta/);
  });

  it('H51: candidatura sem arquivo de bens mostra "sem arquivo de bens coletado" (não "R$ 0,00") e a nota continua visível', async () => {
    renderizar('cand-1');
    const tabela = await screen.findByRole('table', { name: 'Bens declarados por eleição' });
    const [, unica] = within(tabela).getAllByRole('row');
    expect(unica).toHaveTextContent('sem arquivo de bens coletado');
    expect(tabela).not.toHaveTextContent(/R\$/);
    expect(screen.getByTestId('nota-patrimonio')).toHaveTextContent(/valor informado pelo candidato/);
    expect(screen.getByText(/Só há uma candidatura desta pessoa no caso/)).toBeInTheDocument();
    expect(screen.getByTestId('variacoes-patrimonio')).toHaveTextContent(/é preciso ter bens coletados em ao menos duas eleições/);
  });

  it('H51: valores do contrato — total zero é "R$ 0,00", percentual nulo não vira número, bem sem valor e CPF na descrição descaracterizado', async () => {
    const cpf = cpfSinteticoValido();
    const linha: LinhaDoTempoPatrimonial = {
      entidade_id: 'cand-3',
      ligacao: 'titulo_eleitoral',
      nota: 'Declarado ao TSE no registro da candidatura; valor informado pelo candidato (não é avaliação de mercado).',
      pontos: [
        { entidade_id: 'cand-2', rotulo: 'MARIA EXEMPLO SOUZA', ano: '2020', cargo: 'VEREADOR', uf: 'GO', total: 0, quantidade: 1, por_tipo: [], bens: [{ ordem: '1', tipo: 'Outros bens móveis', descricao: `Bem em nome de CPF ${cpf}`, valor: null, atualizado_em: '2020-09-20' }], captura_id: 'cap-x', sha256: 'a'.repeat(64), fonte: 'tse_bens', url_ou_arquivo: 'simulado://bens/2020.csv' },
        { entidade_id: 'cand-3', rotulo: 'MARIA EXEMPLO SOUZA', ano: '2024', cargo: 'VEREADOR', uf: 'GO', total: 1234.5, quantidade: 1, por_tipo: [{ tipo: 'Casa', total: 1234.5, quantidade: 1 }], bens: [{ ordem: '1', tipo: 'Casa', descricao: 'Casa sintética', valor: 1234.5, atualizado_em: '2024-08-10' }], captura_id: 'cap-y', sha256: 'b'.repeat(64), fonte: 'tse_bens', url_ou_arquivo: 'simulado://bens/2024.csv' },
      ],
      variacoes: [{ de_ano: '2020', para_ano: '2024', diferenca: 1234.5, percentual: null }],
      renda_publica: { conhecida: false, motivo: 'Fonte de renda não definida.' },
    };
    const { container } = renderizar('cand-3', { sobrescritas: { obterPatrimonio: async () => linha } });
    const tabela = await screen.findByRole('table', { name: 'Bens declarados por eleição' });
    const [, de2020, de2024] = within(tabela).getAllByRole('row');
    expect(de2020).toHaveTextContent(/R\$\s0,00/);
    expect(de2020).not.toHaveTextContent('sem arquivo de bens coletado');
    expect(de2024).toHaveTextContent(/R\$\s1\.234,50/);
    expect(de2024).toHaveTextContent('1 bem');
    expect(screen.getByTestId('variacoes-patrimonio')).toHaveTextContent(/2020 → 2024: \+\s?R\$\s1\.234,50 \(sem percentual: o total anterior é zero\)/);
    const bens2020 = screen.getByRole('table', { name: 'Bens declarados em 2020', hidden: true });
    expect(bens2020).toHaveTextContent(`Bem em nome de CPF ${mascarado(cpf)}`);
    expect(bens2020).toHaveTextContent('valor não informado');
    expect(container.textContent).not.toContain(cpf);
  });

  it('H51: falha ao carregar a linha do tempo aparece no bloco, sem derrubar o detalhe da entidade', async () => {
    renderizar('cand-3', {
      sobrescritas: {
        obterPatrimonio: async () => {
          throw new ErroApi(500, '/casos/caso-1/entidades/cand-3/patrimonio', 'Falha sintética ao montar a linha do tempo.');
        },
      },
    });
    expect(await screen.findByText(/Falha sintética ao montar a linha do tempo/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /MARIA EXEMPLO SOUZA/ })).toBeInTheDocument();
    expect(screen.getByTestId('nota-patrimonio')).toBeInTheDocument();
  });
});
