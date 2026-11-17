import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Alerta, ComponenteCombinacao } from '../api';
import { ALERTAS } from '../api/dadosSinteticos';
import { SessaoProvider } from '../sessao/SessaoContext';
import { clienteFalso } from '../test/clienteFalso';
import { cpfSinteticoValido, mascarado } from '../test/cpfSintetico';
import { CartaoAlerta, idCartaoAlerta } from './CartaoAlerta';

const ALERTA_T1 = ALERTAS.find((a) => a.tipologia === 'T1')!;

describe('CartaoAlerta — explicabilidade (RNF05)', () => {
  it('mostra tipologia, motivo, severidade, parâmetros e cada evidência com fonte, origem e SHA-256', () => {
    const alerta = ALERTA_T1;
    render(
      <SessaoProvider cliente={clienteFalso()}>
        <CartaoAlerta alerta={alerta} rotulosEntidades={{ 'emp-1': 'ALFA SOLUÇÕES EM TI LTDA' }} aoAbrirEntidade={() => undefined} />
      </SessaoProvider>,
    );
    expect(screen.getByRole('heading', { name: alerta.titulo })).toBeInTheDocument();
    expect(screen.getByText('T1')).toBeInTheDocument();
    expect(screen.getByText(alerta.motivo)).toBeInTheDocument();
    expect(screen.getByText(/severidade: média/)).toBeInTheDocument();
    expect(screen.getByText('limiar_dias')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();

    const tabela = screen.getByRole('table', { name: /Evidências do alerta/ });
    for (const ev of alerta.evidencias) {
      expect(within(tabela).getByText(ev.descricao)).toBeInTheDocument();
      expect(within(tabela).getAllByText(ev.fonte).length).toBeGreaterThan(0);
      expect(within(tabela).getByText(ev.url_ou_arquivo)).toBeInTheDocument();
      expect(within(tabela).getByTitle(ev.sha256)).toBeInTheDocument();
    }
    expect(within(tabela).getAllByRole('button', { name: 'Verificar integridade' })).toHaveLength(alerta.evidencias.length);
    expect(screen.getByRole('button', { name: 'ALFA SOLUÇÕES EM TI LTDA' })).toBeInTheDocument();
  });

  it('verifica a integridade de uma evidência e mostra íntegra ou violada com os dois hashes', async () => {
    const usuario = userEvent.setup();
    const verificarCaptura = vi.fn(async (id: string | number) =>
      String(id) === 'cap-1'
        ? { integra: true, sha256_registrado: 'a'.repeat(64), sha256_recalculado: 'a'.repeat(64) }
        : { integra: false, sha256_registrado: 'b'.repeat(64), sha256_recalculado: 'c'.repeat(64) },
    );
    render(
      <SessaoProvider cliente={clienteFalso({ verificarCaptura })}>
        <CartaoAlerta alerta={ALERTA_T1} />
      </SessaoProvider>,
    );
    const tabela = screen.getByRole('table', { name: /Evidências do alerta/ });
    const linhas = within(tabela).getAllByRole('row').slice(1);
    await usuario.click(within(linhas[0]).getByRole('button', { name: 'Verificar integridade' }));
    expect(await within(linhas[0]).findByText('Íntegra')).toBeInTheDocument();
    expect(verificarCaptura).toHaveBeenCalledWith('cap-1');

    await usuario.click(within(linhas[1]).getByRole('button', { name: 'Verificar integridade' }));
    expect(await within(linhas[1]).findByText('VIOLADA')).toBeInTheDocument();
    expect(within(linhas[1]).getByTitle('b'.repeat(64))).toBeInTheDocument();
    expect(within(linhas[1]).getByTitle('c'.repeat(64))).toBeInTheDocument();
  });
});

describe('CartaoAlerta — alerta como pista (RF12) e política de erro (RF14)', () => {
  it('mostra a situação pendente, a política de erro da tipologia e exige justificativa para decidir', async () => {
    const usuario = userEvent.setup();
    const aoDecidir = vi.fn(async () => undefined);
    render(
      <SessaoProvider cliente={clienteFalso()}>
        <CartaoAlerta alerta={ALERTA_T1} aoDecidir={aoDecidir} />
      </SessaoProvider>,
    );
    expect(screen.getByText('pendente de análise')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma decisão registrada.')).toBeInTheDocument();
    expect(screen.getByText(ALERTA_T1.politica_erro!)).toBeInTheDocument();
    expect(screen.getByText('prefere evitar falso negativo')).toBeInTheDocument();

    const confirmar = screen.getByRole('button', { name: 'Confirmar alerta' });
    const descartar = screen.getByRole('button', { name: 'Descartar alerta' });
    expect(confirmar).toBeDisabled();
    expect(descartar).toBeDisabled();
    // Só pontuação ou espaços não valem como justificativa (mesma regra do back-end).
    await usuario.type(screen.getByLabelText('Justificativa da decisão (obrigatória)'), '  ...  ');
    expect(confirmar).toBeDisabled();
    expect(aoDecidir).not.toHaveBeenCalled();

    await usuario.clear(screen.getByLabelText('Justificativa da decisão (obrigatória)'));
    await usuario.type(screen.getByLabelText('Justificativa da decisão (obrigatória)'), ' Empresa regular, conferida no cadastro ');
    await usuario.click(descartar);
    expect(aoDecidir).toHaveBeenCalledWith(ALERTA_T1.id, 'descartado', 'Empresa regular, conferida no cadastro');
  });

  it('mostra a decisão em vigor com quem, quando e a justificativa, mantém o histórico e permite rever', () => {
    const decisoes = [
      { decisao: 'confirmado' as const, justificativa: 'Primeira análise', usuario: 'ana', perfil: 'analista', decidido_em: '2026-11-16T12:00:00Z' },
      { decisao: 'descartado' as const, justificativa: 'Revisto: documento novo', usuario: 'carlos', perfil: 'delegado', decidido_em: '2026-11-16T15:30:00Z' },
    ];
    render(
      <SessaoProvider cliente={clienteFalso()}>
        <CartaoAlerta alerta={{ ...ALERTA_T1, situacao: 'descartado', decisao: decisoes[1], decisoes }} aoDecidir={async () => undefined} />
      </SessaoProvider>,
    );
    expect(screen.getByText('descartado', { selector: '.situacao' })).toBeInTheDocument();
    const historico = within(screen.getByRole('list', { name: 'Histórico de decisões' })).getAllByTestId('decisao');
    expect(historico).toHaveLength(2);
    expect(historico[0]).toHaveTextContent('confirmado por ana (analista)');
    expect(historico[0]).toHaveTextContent('Justificativa: Primeira análise');
    expect(historico[0]).not.toHaveTextContent('em vigor');
    expect(historico[1]).toHaveTextContent('descartado por carlos (delegado) em 16/11/2026');
    expect(historico[1]).toHaveTextContent('em vigor');
    expect(screen.getByRole('button', { name: 'Rever: confirmar' })).toBeInTheDocument();
    expect(screen.getByLabelText('Justificativa da revisão (obrigatória)')).toBeInTheDocument();
  });

  it('mostra o erro do back-end quando a decisão é recusada e não tem formulário sem aoDecidir', async () => {
    const usuario = userEvent.setup();
    const aoDecidir = vi.fn(async () => {
      throw new Error('O prazo de retenção deste caso terminou');
    });
    const { unmount } = render(
      <SessaoProvider cliente={clienteFalso()}>
        <CartaoAlerta alerta={ALERTA_T1} aoDecidir={aoDecidir} />
      </SessaoProvider>,
    );
    await usuario.type(screen.getByLabelText('Justificativa da decisão (obrigatória)'), 'texto');
    await usuario.click(screen.getByRole('button', { name: 'Confirmar alerta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('prazo de retenção');
    unmount();

    render(
      <SessaoProvider cliente={clienteFalso()}>
        <CartaoAlerta alerta={{ ...ALERTA_T1, ativo: false }} />
      </SessaoProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Confirmar alerta' })).not.toBeInTheDocument();
    expect(screen.getByText(/não detectou mais este alerta/)).toBeInTheDocument();
  });
});

describe('CartaoAlerta — tipologias T5 a T10 (horizonte 2)', () => {
  function renderizar(alerta: (typeof ALERTAS)[number]) {
    return render(
      <SessaoProvider cliente={clienteFalso()}>
        <CartaoAlerta alerta={alerta} />
      </SessaoProvider>,
    );
  }
  const porId = (id: string) => ALERTAS.find((a) => a.id === id)!;

  it('exibe um alerta de cada tipologia nova com o nome, a severidade e a política de erro', () => {
    for (const t of ['T5', 'T6', 'T7', 'T8', 'T9', 'T10']) {
      const alerta = ALERTAS.find((a) => a.tipologia === t)!;
      const { unmount } = renderizar(alerta);
      expect(screen.getByText(t, { selector: '.etiqueta-tipologia' })).toBeInTheDocument();
      expect(screen.getByText(`${t} — ${alerta.tipologia_nome}`)).toBeInTheDocument();
      expect(screen.getByText(/^Prefere evitar falso (negativo|positivo):/)).toBeInTheDocument();
      expect(screen.getByRole('table', { name: /Evidências do alerta/ })).toBeInTheDocument();
      unmount();
    }
  });

  it('T7: selo visível de possível coincidência, com a explicação de que não é identificação', () => {
    renderizar(porId('alr-7'));
    expect(screen.getByTestId('selo-coincidencia')).toHaveTextContent('Possível coincidência (não é identificação)');
    expect(screen.getByText(/Isso não identifica uma\s+pessoa/)).toBeInTheDocument();
    // O CPF só aparece descaracterizado.
    expect(screen.getAllByText(/\*\*\*666666\*\*/).length).toBeGreaterThan(0);
  });

  it('T9: o selo aparece para doador pessoa física e não para doadora pessoa jurídica', () => {
    const { unmount } = renderizar(porId('alr-10'));
    expect(screen.getByTestId('selo-coincidencia')).toBeInTheDocument();
    unmount();
    renderizar(porId('alr-9'));
    expect(screen.queryByTestId('selo-coincidencia')).not.toBeInTheDocument();
  });

  it('sem identidade_confirmada nos parâmetros (T1 a T6, T8, T10) não há selo', () => {
    for (const id of ['alr-1', 'alr-6', 'alr-8', 'alr-11']) {
      const { unmount } = renderizar(porId(id));
      expect(screen.queryByTestId('selo-coincidencia')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('T10: lista as ocorrências com linha, coluna, posição e o trecho literal em bloco pré-formatado', () => {
    renderizar(porId('alr-11'));
    const ocorrencias = screen.getAllByTestId('ocorrencia');
    expect(ocorrencias).toHaveLength(2);
    expect(ocorrencias[0]).toHaveTextContent('linha 12, coluna 31, posição 508');
    const trecho = within(ocorrencias[0]).getByLabelText('Trecho literal da ocorrência 1');
    expect(trecho.tagName).toBe('PRE');
    expect(trecho.textContent).toBe('certidão negativa de quitação');
    // A quebra de linha do arquivo é preservada no trecho da segunda ocorrência.
    expect(ocorrencias[1]).toHaveTextContent('linha 27, coluna 58, posição 1304');
    expect(within(ocorrencias[1]).getByLabelText('Trecho literal da ocorrência 2').textContent).toBe('certidao negativa\nde quitacao');
    // As ocorrências não são repetidas como JSON na tabela de parâmetros.
    expect(screen.queryByText('ocorrencias')).not.toBeInTheDocument();
    expect(screen.getByText('ocorrencias_total')).toBeInTheDocument();
  });

  it('RNF04: CPF completo vindo da API é descaracterizado no título, no motivo, nos parâmetros e nas evidências', () => {
    const base = porId('alr-7');
    const cpfValido = cpfSinteticoValido();
    const alerta = {
      ...base,
      titulo: 'Possível coincidência: sócio 000.666.666-00',
      motivo: 'O sócio de CPF 00066666600 coincide com o servidor de CPF 000.666.666-00.',
      parametros: { ...base.parametros, cpf_descaracterizado: '00066666600' },
      // Sem a palavra CPF por perto, o que identifica o número é o dígito verificador (CPF sintético gerado
      // a cada execução). O telefone sintético ao lado não é CPF e fica como veio.
      evidencias: [{ ...base.evidencias[0], descricao: `Sócio (${cpfValido}), telefone 61999990000, nos dados abertos do CNPJ` }],
    };
    const { container } = renderizar(alerta);
    expect(container.textContent).not.toMatch(/00066666600|000\.666\.666-00/);
    expect(container.textContent).not.toContain(cpfValido);
    expect(screen.getByRole('heading', { name: 'Possível coincidência: sócio ***666666**' })).toBeInTheDocument();
    expect(screen.getByText('O sócio de CPF ***666666** coincide com o servidor de CPF ***666666**.')).toBeInTheDocument();
    expect(screen.getByText(`Sócio (${mascarado(cpfValido)}), telefone 61999990000, nos dados abertos do CNPJ`)).toBeInTheDocument();
  });
});

describe('RF04: cartão de alerta das tipologias de lavagem (L)', () => {
  function renderizar(alerta: Alerta, props: Partial<Parameters<typeof CartaoAlerta>[0]> = {}) {
    return render(
      <SessaoProvider cliente={clienteFalso()}>
        <CartaoAlerta alerta={alerta} {...props} />
      </SessaoProvider>,
    );
  }
  const L6 = ALERTAS.find((a) => a.tipologia === 'L6')!;
  const L14 = ALERTAS.find((a) => a.tipologia === 'L14')!;

  it('RNF05: o alerta L traz motivo, política de erro, parâmetros e evidências com SHA-256, como os T', () => {
    renderizar(L6);
    expect(screen.getByText('L6', { selector: '.etiqueta-tipologia' })).toBeInTheDocument();
    expect(screen.getByText('L6 — Porte ou regime incompatível com o valor contratado')).toBeInTheDocument();
    expect(screen.getByText(L6.motivo)).toBeInTheDocument();
    expect(screen.getByText(/^Prefere evitar falso positivo: compara a soma contratada/)).toBeInTheDocument();
    expect(screen.getByText('limite_anual')).toBeInTheDocument();
    const tabela = screen.getByRole('table', { name: /Evidências do alerta/ });
    for (const ev of L6.evidencias) expect(within(tabela).getByTitle(ev.sha256)).toBeInTheDocument();
    expect(screen.getByTestId('peso-alerta')).toHaveTextContent('peso na combinação: 1');
    expect(screen.queryByTestId('selo-sinal-fraco')).not.toBeInTheDocument();
  });

  it('RF12: o alerta L avisa no alto que é pista, não conclusão, e a frase não se repete na decisão', () => {
    const { container } = renderizar(L6);
    const aviso = screen.getByTestId('aviso-pista');
    expect(aviso).toHaveTextContent('Pista, não conclusão.');
    expect(aviso).toHaveTextContent('não prova lavagem de dinheiro');
    const decisao = screen.getByRole('region', { name: /Decisão sobre o alerta/ });
    expect(decisao).toHaveTextContent('A decisão e a justificativa ficam no alerta e na trilha de auditoria.');
    expect(decisao).not.toHaveTextContent('O alerta é uma pista, não uma conclusão.');
    expect(container.textContent?.match(/[Pp]ista, não (uma )?conclusão/g)).toHaveLength(1);
  });

  it('RF12: o alerta T continua com o aviso de pista só na seção da decisão (sem duplicar)', () => {
    const { container } = renderizar(ALERTA_T1);
    expect(screen.queryByTestId('aviso-pista')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Decisão sobre o alerta/ })).toHaveTextContent('O alerta é uma pista, não uma conclusão.');
    expect(container.textContent?.match(/pista, não uma conclusão/g)).toHaveLength(1);
  });

  it('RF14: o sinal fraco tem selo, peso 0,5 e o texto de que sozinho não indica nada', () => {
    renderizar(L14);
    expect(screen.getByTestId('selo-sinal-fraco')).toHaveTextContent('sinal fraco');
    expect(screen.getByTestId('aviso-pista')).toHaveTextContent('Sinal fraco: sozinho não indica nada; só pesa no alerta de combinação.');
    expect(screen.getByTestId('peso-alerta')).toHaveTextContent('peso na combinação: 0,5');
  });

  it('resposta antiga, sem grupo, sinal_fraco nem peso: o grupo vem do código e nada quebra', () => {
    const antigo: Alerta = { id: 'a-1', tipologia: 'L3', titulo: 'Mesmo administrador em 4 empresas', motivo: 'Motivo sintético.', severidade: 'media', entidades: [], evidencias: [], parametros: {} };
    renderizar(antigo);
    expect(screen.getByText('L3 — Mesmo administrador ou representante em muitas empresas')).toBeInTheDocument();
    expect(screen.getByTestId('aviso-pista')).toBeInTheDocument();
    expect(screen.queryByTestId('peso-alerta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('selo-sinal-fraco')).not.toBeInTheDocument();
  });
});

describe('RF14: cartão do alerta de combinação (COMB)', () => {
  const componente = (parcial: Partial<ComponenteCombinacao>): ComponenteCombinacao => ({
    alerta_id: 'alr-1',
    tipologia: 'T1',
    tipologia_nome: 'Empresa aberta pouco antes do contrato',
    titulo: 'Empresa aberta pouco antes do contrato',
    severidade: 'media',
    situacao: 'pendente',
    peso: 1,
    sinal_fraco: false,
    conta: true,
    observacao: '',
    ...parcial,
  });
  const COMB: Alerta = {
    id: 'alr-comb-1',
    tipologia: 'COMB',
    tipologia_nome: 'Combinação de alertas na mesma entidade',
    titulo: 'Combinação de alertas em ALFA LTDA: 3 tipologias distintas',
    motivo: 'ALFA LTDA acumula 3 alertas de 3 tipologias distintas, com soma de pesos 2,5.',
    severidade: 'alta',
    prefere_evitar: 'falso_positivo',
    politica_erro: 'Prefere evitar falso positivo: só dispara com o mínimo de tipologias distintas.',
    grupo: 'combinacao',
    sinal_fraco: false,
    peso: 0,
    entidades: ['emp-1'],
    evidencias: [],
    parametros: {
      entidade_id: 'emp-1',
      entidade_rotulo: 'ALFA LTDA',
      entidade_tipo: 'empresa',
      tipologias_distintas: 3,
      soma_pesos: 2.5,
      comb_minimo_tipologias: 2,
      comb_peso_minimo: 2.0,
      componentes: [
        componente({}),
        componente({ alerta_id: 'alr-7', tipologia: 'T7', tipologia_nome: 'Possível coincidência entre sócio e servidor', titulo: 'Possível coincidência: sócio e servidor', severidade: 'alta', situacao: 'confirmado' }),
        componente({ alerta_id: 'alr-13', tipologia: 'L14', tipologia_nome: 'Sócio em faixa etária atípica em empresa contratada', titulo: 'Sócio em faixa etária atípica', severidade: 'baixa', peso: 0.5, sinal_fraco: true }),
        componente({
          alerta_id: 'alr-20',
          tipologia: 'L8',
          tipologia_nome: 'Empresa recém-aberta com sócio que possivelmente é agente público',
          titulo: 'Empresa recém-aberta com sócio possivelmente servidor',
          severidade: 'alta',
          peso: 0,
          conta: false,
          observacao: 'Composição de T1 e T7, já contadas separadamente.',
        }),
      ],
      aviso: 'Não é escore de culpa: é uma pista para priorizar a análise (RF12).',
    },
  };

  function renderizar(alerta: Alerta = COMB, aoIrParaAlerta?: (id: string | number) => void) {
    return render(
      <SessaoProvider cliente={clienteFalso()}>
        <CartaoAlerta alerta={alerta} aoIrParaAlerta={aoIrParaAlerta} />
      </SessaoProvider>,
    );
  }

  it('lista cada componente com código, nome, título, peso e se conta ou não, com a observação', () => {
    renderizar();
    const tabela = screen.getByRole('table', { name: 'Alertas que compõem a combinação alr-comb-1' });
    const linhas = within(tabela).getAllByTestId('componente-combinacao');
    expect(linhas).toHaveLength(4);
    expect(linhas.map((l) => within(l).getByText(/^(T\d+|L\d+)$/, { selector: '.etiqueta-tipologia' }).textContent)).toEqual(['T1', 'T7', 'L14', 'L8']);
    expect(linhas[0]).toHaveTextContent('Empresa aberta pouco antes do contrato');
    expect(within(linhas[0]).getByText('conta')).toBeInTheDocument();
    expect(linhas[1]).toHaveTextContent('situação: confirmado');
    expect(linhas[2]).toHaveTextContent('0,5');
    expect(linhas[2]).toHaveTextContent('sinal fraco');
    expect(within(linhas[2]).getByText('conta')).toBeInTheDocument();
    expect(within(linhas[3]).getByText('não conta')).toBeInTheDocument();
    expect(linhas[3]).toHaveTextContent('Composição de T1 e T7, já contadas separadamente.');
    expect(linhas[3]).toHaveTextContent('Empresa recém-aberta com sócio que possivelmente é agente público');
  });

  it('mostra a soma dos pesos e o número de tipologias distintas contra os mínimos', () => {
    renderizar();
    expect(screen.getByTestId('combinacao-soma')).toHaveTextContent('2,5 (mínimo para disparar: 2)');
    expect(screen.getByTestId('combinacao-distintas')).toHaveTextContent('3 (mínimo para disparar: 2)');
    expect(screen.getByRole('heading', { name: 'Como esta combinação foi formada: ALFA LTDA' })).toBeInTheDocument();
    // Os componentes não viram JSON na tabela de parâmetros; os totais continuam lá.
    expect(screen.queryByText('componentes')).not.toBeInTheDocument();
    expect(screen.getByText('soma_pesos')).toBeInTheDocument();
  });

  it('RF12: avisa que não é escore de culpa e que é pista, não conclusão', () => {
    renderizar();
    expect(screen.getByTestId('aviso-combinacao')).toHaveTextContent('Não é escore de culpa: é uma pista para priorizar a análise (RF12).');
    expect(screen.getByTestId('aviso-pista')).toHaveTextContent('Pista, não conclusão.');
    expect(screen.getByTestId('aviso-pista')).toHaveTextContent('não mede culpa');
    // A combinação não tem peso próprio.
    expect(screen.queryByTestId('peso-alerta')).not.toBeInTheDocument();
  });

  it('sem `aviso` e sem os totais na resposta, usa o aviso padrão e soma o que os componentes dizem', () => {
    const omitidos = ['aviso', 'soma_pesos', 'tipologias_distintas', 'comb_peso_minimo'];
    const resto = Object.fromEntries(Object.entries(COMB.parametros).filter(([chave]) => !omitidos.includes(chave)));
    renderizar({ ...COMB, parametros: resto });
    expect(screen.getByTestId('aviso-combinacao')).toHaveTextContent('Não é escore de culpa');
    expect(screen.getByTestId('combinacao-soma')).toHaveTextContent(/^2,5$/);
    expect(screen.getByTestId('combinacao-distintas')).toHaveTextContent('3 (mínimo para disparar: 2)');
  });

  it('cada componente leva ao cartão do alerta correspondente', async () => {
    const usuario = userEvent.setup();
    const aoIrParaAlerta = vi.fn();
    renderizar(COMB, aoIrParaAlerta);
    await usuario.click(screen.getByRole('button', { name: 'Sócio em faixa etária atípica' }));
    expect(aoIrParaAlerta).toHaveBeenCalledWith('alr-13');
  });

  it('sem função de navegação, rola até a âncora do cartão do componente e põe o foco nele', async () => {
    const usuario = userEvent.setup();
    const rolar = vi.fn();
    render(
      <SessaoProvider cliente={clienteFalso()}>
        <CartaoAlerta alerta={COMB} />
        <CartaoAlerta alerta={{ ...ALERTA_T1, id: 'alr-1' }} />
      </SessaoProvider>,
    );
    const alvo = document.getElementById(idCartaoAlerta('alr-1'))!;
    alvo.scrollIntoView = rolar;
    await usuario.click(screen.getByRole('button', { name: 'Empresa aberta pouco antes do contrato' }));
    expect(rolar).toHaveBeenCalled();
    expect(alvo).toHaveFocus();
  });

  it('RNF04: CPF completo no título ou na observação de um componente aparece descaracterizado', () => {
    const cpf = cpfSinteticoValido();
    const comCpf: Alerta = {
      ...COMB,
      parametros: { ...COMB.parametros, componentes: [componente({ titulo: `Sócio de CPF ${cpf} em 4 empresas`, observacao: `Conferir o CPF ${cpf}.` })] },
    };
    const { container } = renderizar(comCpf);
    expect(container.textContent).not.toContain(cpf);
    expect(screen.getByRole('button', { name: `Sócio de CPF ${mascarado(cpf)} em 4 empresas` })).toBeInTheDocument();
  });
});
