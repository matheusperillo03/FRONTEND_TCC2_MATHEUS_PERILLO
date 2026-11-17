import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { ErroApi, type ApiCliente } from '../api';
import { ClienteMock } from '../api/clienteMock';
import { CODIGO_MFA_DEMO, CONTAS_DEMO, SEGREDO_MFA_DEMO } from '../api/dadosSinteticos';
import { SessaoProvider } from '../sessao/SessaoContext';

/** Simulado ligado à sessão do navegador, como o cliente de verdade: lê o token e a justificativa a cada chamada. */
function clienteDaSessao(sobrescritas: Partial<ApiCliente> = {}): { cliente: ApiCliente; base: ClienteMock } {
  const base = new ClienteMock({
    obterToken: () => sessionStorage.getItem('osint.token') ?? '',
    obterJustificativa: () => sessionStorage.getItem('osint.justificativa') ?? '',
    latenciaMs: 0,
  });
  const cliente = new Proxy(base, {
    get(alvo, prop: keyof ApiCliente) {
      if (prop in sobrescritas) return sobrescritas[prop];
      const valor = alvo[prop];
      return typeof valor === 'function' ? (valor as (...a: unknown[]) => unknown).bind(alvo) : valor;
    },
  }) as ApiCliente;
  return { cliente, base };
}

function renderizar(sobrescritas: Partial<ApiCliente> = {}) {
  const usuario = userEvent.setup();
  const { cliente, base } = clienteDaSessao(sobrescritas);
  const resultado = render(
    <SessaoProvider cliente={cliente} config={{ modoMock: false, baseUrl: 'http://api.teste' }}>
      <App />
    </SessaoProvider>,
  );
  return { usuario, cliente, base, ...resultado };
}

async function informarCredenciais(usuario: ReturnType<typeof userEvent.setup>, login: string, senha: string) {
  await usuario.type(screen.getByLabelText('Usuário'), login);
  await usuario.type(screen.getByLabelText('Senha'), senha);
  await usuario.click(screen.getByRole('button', { name: 'Entrar' }));
}

async function entrar(usuario: ReturnType<typeof userEvent.setup>, login = 'analista.demo') {
  await informarCredenciais(usuario, login, CONTAS_DEMO[login].senha);
  await usuario.type(await screen.findByLabelText('Código de 6 dígitos'), CODIGO_MFA_DEMO);
  await usuario.click(screen.getByRole('button', { name: /Confirmar código|Cadastrar e entrar/ }));
  await screen.findByRole('button', { name: 'Sair' });
}

describe('Entrada — login com senha e segundo fator (RNF01, H23)', () => {
  it('usuário e senha levam à etapa do código; o código certo abre a aplicação e guarda só o token da sessão ativa', async () => {
    const { usuario } = renderizar();
    expect(screen.getByRole('heading', { name: 'Buscador OSINT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
    await informarCredenciais(usuario, 'analista.demo', CONTAS_DEMO['analista.demo'].senha);

    expect(await screen.findByRole('heading', { name: 'Segundo fator' })).toBeInTheDocument();
    expect(screen.getByText(/Informe o código de 6 dígitos do seu aplicativo autenticador/)).toBeInTheDocument();
    expect(screen.queryByTestId('cadastro-mfa')).not.toBeInTheDocument();
    // Na etapa pendente nada é guardado no navegador: o token pendente fica só na memória da tela.
    expect(sessionStorage.getItem('osint.token')).toBeNull();
    expect(localStorage.length).toBe(0);

    const confirmar = screen.getByRole('button', { name: 'Confirmar código' });
    const codigo = screen.getByLabelText('Código de 6 dígitos');
    await usuario.type(codigo, '12a3');
    expect(codigo).toHaveValue('123'); // só dígitos
    expect(confirmar).toBeDisabled();
    await usuario.type(codigo, '456');
    await usuario.click(confirmar);

    expect(await screen.findByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(screen.getByText('analista.demo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Casos' })).toBeInTheDocument();
    expect(sessionStorage.getItem('osint.token')).toMatch(/^sessao-simulada-/);
    expect(localStorage.length).toBe(0);
  });

  it('senha errada mostra "Usuário ou senha inválidos." e continua na primeira etapa', async () => {
    const { usuario } = renderizar();
    await informarCredenciais(usuario, 'analista.demo', 'senha-errada-sintetica');
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha inválidos.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/sessão expirou/i);
    expect(screen.getByLabelText('Usuário')).toBeInTheDocument();
    expect(screen.queryByLabelText('Código de 6 dígitos')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('osint.token')).toBeNull();
  });

  it('código errado mostra o erro, limpa o campo e mantém a etapa; o código certo em seguida entra', async () => {
    const { usuario } = renderizar();
    await informarCredenciais(usuario, 'analista.demo', CONTAS_DEMO['analista.demo'].senha);
    const codigo = await screen.findByLabelText('Código de 6 dígitos');
    await usuario.type(codigo, '000000');
    await usuario.click(screen.getByRole('button', { name: 'Confirmar código' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Código de verificação inválido.');
    expect(screen.getByRole('heading', { name: 'Segundo fator' })).toBeInTheDocument();
    expect(screen.getByLabelText('Código de 6 dígitos')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem('osint.token')).toBeNull();

    await usuario.type(screen.getByLabelText('Código de 6 dígitos'), CODIGO_MFA_DEMO);
    await usuario.click(screen.getByRole('button', { name: 'Confirmar código' }));
    expect(await screen.findByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('conta bloqueada (429) mostra a mensagem do servidor', async () => {
    const login = vi.fn(async () => {
      throw new ErroApi(429, '/auth/login', 'Conta bloqueada temporariamente por excesso de tentativas.');
    });
    const { usuario } = renderizar({ login });
    await informarCredenciais(usuario, 'analista.demo', 'qualquer-senha-sintetica');
    expect(await screen.findByRole('alert')).toHaveTextContent('Conta bloqueada temporariamente por excesso de tentativas.');
  });

  it('primeiro acesso: mostra o segredo e a URI otpauth como texto copiável e entra depois do primeiro código', async () => {
    const { usuario, container } = renderizar();
    await informarCredenciais(usuario, 'novato.demo', CONTAS_DEMO['novato.demo'].senha);
    expect(await screen.findByRole('heading', { name: 'Cadastre o segundo fator' })).toBeInTheDocument();
    const cadastro = screen.getByTestId('cadastro-mfa');
    expect(within(cadastro).getByLabelText('Chave secreta (Base32)')).toHaveValue(SEGREDO_MFA_DEMO);
    expect(within(cadastro).getByLabelText('Chave secreta (Base32)')).toHaveAttribute('readonly');
    expect((within(cadastro).getByLabelText('URI de configuração (otpauth)') as HTMLInputElement).value).toMatch(/^otpauth:\/\/totp\//);
    // Sem QR code: nenhuma imagem nem canvas na tela.
    expect(container.querySelector('img, canvas, svg')).toBeNull();

    await usuario.type(screen.getByLabelText('Código de 6 dígitos'), CODIGO_MFA_DEMO);
    await usuario.click(screen.getByRole('button', { name: 'Cadastrar e entrar' }));
    expect(await screen.findByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(screen.getByText('novato.demo')).toBeInTheDocument();
  });

  it('"Voltar ao usuário e senha" descarta a etapa pendente', async () => {
    const { usuario } = renderizar();
    await informarCredenciais(usuario, 'analista.demo', CONTAS_DEMO['analista.demo'].senha);
    await usuario.click(await screen.findByRole('button', { name: 'Voltar ao usuário e senha' }));
    expect(screen.getByLabelText('Usuário')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toHaveValue('');
  });
});

describe('Entrada — sessão expirada e saída', () => {
  it('um 401 numa chamada autenticada derruba a sessão local e volta ao login com o aviso de sessão expirada', async () => {
    let expirada = false;
    const { usuario, base } = renderizar({
      listarCasos: async () => {
        if (expirada) throw new ErroApi(401, '/casos', 'Token inválido ou sessão expirada.');
        return base.listarCasos();
      },
    });
    await entrar(usuario);
    await usuario.type(screen.getByLabelText('Texto da justificativa'), 'IP 0001/2026 - teste');
    await usuario.click(screen.getByRole('button', { name: 'Usar nesta sessão' }));
    expect(await screen.findByRole('button', { name: 'Abrir' })).toBeInTheDocument();
    expect(sessionStorage.getItem('osint.token')).not.toBeNull();

    expirada = true;
    await usuario.click(screen.getByRole('button', { name: 'Atualizar' }));

    expect(await screen.findByText('Sua sessão expirou ou foi encerrada. Entre de novo para continuar.')).toBeInTheDocument();
    expect(screen.getByLabelText('Usuário')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
    // Token e justificativa saem da memória e do sessionStorage.
    expect(sessionStorage.getItem('osint.token')).toBeNull();
    expect(sessionStorage.getItem('osint.justificativa')).toBeNull();
    // O aviso some quando o usuário entra de novo.
    await entrar(usuario);
    expect(screen.queryByText(/Sua sessão expirou/)).not.toBeInTheDocument();
  });

  it('"Sair" chama POST /auth/logout, limpa a sessão local e não mostra aviso de expiração', async () => {
    const { usuario, base } = renderizar();
    const logout = vi.spyOn(base, 'logout');
    await entrar(usuario);
    const token = sessionStorage.getItem('osint.token')!;
    await usuario.click(screen.getByRole('button', { name: 'Sair' }));

    expect(await screen.findByLabelText('Usuário')).toBeInTheDocument();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('osint.token')).toBeNull();
    expect(screen.queryByText(/Sua sessão expirou/)).not.toBeInTheDocument();
    // O token antigo deixou de valer no servidor.
    sessionStorage.setItem('osint.token', token);
    await expect(base.me()).rejects.toMatchObject({ status: 401 });
  });

  it('"Sair" limpa a sessão local mesmo se o logout falhar no servidor', async () => {
    const logout = vi.fn(async () => {
      throw new ErroApi(401, '/auth/logout', 'Token inválido ou sessão expirada.');
    });
    const { usuario } = renderizar({ logout });
    await entrar(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByLabelText('Usuário')).toBeInTheDocument();
    expect(logout).toHaveBeenCalled();
    expect(sessionStorage.getItem('osint.token')).toBeNull();
    expect(screen.queryByText(/Sua sessão expirou/)).not.toBeInTheDocument();
  });

  it('página recarregada com token guardado: confere a sessão no servidor e entra; se não vale mais, pede o login', async () => {
    sessionStorage.setItem('osint.token', 'dev-delegado');
    const valida = renderizar();
    expect(await screen.findByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(screen.getByText('delegado.demo')).toBeInTheDocument();
    valida.unmount();

    sessionStorage.setItem('osint.token', 'sessao-que-nao-existe-mais');
    renderizar();
    expect(await screen.findByText(/Sua sessão expirou/)).toBeInTheDocument();
    expect(sessionStorage.getItem('osint.token')).toBeNull();
  });
});

describe('Entrada — token de desenvolvimento (secundário)', () => {
  it('fica recolhido num <details>, fora do formulário principal, com o aviso de MODO_DEV', () => {
    renderizar();
    const campo = screen.getByLabelText('Token de desenvolvimento');
    const detalhes = campo.closest('details')!;
    expect(detalhes).not.toHaveAttribute('open');
    expect(within(detalhes).getByText('Entrar com token de desenvolvimento')).toBeInTheDocument();
    expect(detalhes).toHaveTextContent('MODO_DEV=1');
    expect(screen.getByRole('form', { name: 'Entrar com usuário e senha' })).not.toContainElement(campo);
  });

  it('entra com um token válido e, ao sair, não chama o logout (token de desenvolvimento não tem sessão)', async () => {
    const { usuario, base } = renderizar();
    const logout = vi.spyOn(base, 'logout');
    await usuario.click(screen.getByText('Entrar com token de desenvolvimento'));
    await usuario.type(screen.getByLabelText('Token de desenvolvimento'), 'dev-delegado');
    await usuario.click(screen.getByRole('button', { name: 'Entrar com token' }));
    expect(await screen.findByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(screen.getByText('delegado.demo')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByLabelText('Usuário')).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it('token inválido mostra o erro de acesso, sem aviso de sessão expirada, e não fica guardado', async () => {
    const { usuario } = renderizar();
    await usuario.type(screen.getByLabelText('Token de desenvolvimento'), 'token-sintetico-invalido');
    await usuario.click(screen.getByRole('button', { name: 'Entrar com token' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado (401)');
    expect(screen.queryByText(/Sua sessão expirou/)).not.toBeInTheDocument();
    expect(sessionStorage.getItem('osint.token')).toBeNull();
  });
});

describe('App — conta e administração de usuários', () => {
  it('"Minha conta" mostra a sessão e troca a senha; o botão "Usuários" só existe para o perfil admin', async () => {
    const { usuario } = renderizar();
    await entrar(usuario);
    expect(screen.queryByRole('button', { name: 'Usuários' })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Minha conta' }));
    const sessao = await screen.findByLabelText('Sessão atual');
    expect(sessao).toHaveTextContent('usuário e senha');
    expect(sessao).toHaveTextContent('após 30 min');

    await usuario.type(screen.getByLabelText('Senha atual'), CONTAS_DEMO['analista.demo'].senha);
    await usuario.type(screen.getByLabelText('Senha nova'), 'Outra-Senha-Sintetica-1');
    await usuario.type(screen.getByLabelText('Repita a senha nova'), 'Outra-Senha-Sintetica-2');
    expect(screen.getByRole('button', { name: 'Trocar a senha' })).toBeDisabled();
    expect(screen.getByText('As duas senhas novas não são iguais.')).toBeInTheDocument();
    await usuario.clear(screen.getByLabelText('Repita a senha nova'));
    await usuario.type(screen.getByLabelText('Repita a senha nova'), 'Outra-Senha-Sintetica-1');
    await usuario.click(screen.getByRole('button', { name: 'Trocar a senha' }));
    expect(await screen.findByText(/Senha trocada/)).toBeInTheDocument();
  });

  it('admin: lista as contas, cria uma conta e redefine o segundo fator de outra', async () => {
    const { usuario, base } = renderizar();
    await entrar(usuario, 'admin.demo');
    await usuario.type(screen.getByLabelText('Texto da justificativa'), 'Gestão de contas - teste');
    await usuario.click(screen.getByRole('button', { name: 'Usar nesta sessão' }));
    await usuario.click(screen.getByRole('button', { name: 'Usuários' }));

    const linhas = await screen.findAllByTestId('usuario');
    expect(linhas).toHaveLength(4);
    const propria = linhas.find((l) => l.textContent?.includes('admin.demo'))!;
    expect(propria).toHaveTextContent('(você)');
    expect(within(propria).getByRole('button', { name: 'Desativar' })).toBeDisabled();

    await usuario.type(screen.getByLabelText('Login'), 'perita.sintetica');
    await usuario.type(screen.getByLabelText('Senha inicial'), 'Senha-Inicial-Sintetica');
    await usuario.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText(/criada com o perfil analista/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId('usuario')).toHaveLength(5));

    const analista = screen.getAllByTestId('usuario').find((l) => l.textContent?.includes('analista.demo'))!;
    expect(analista).toHaveTextContent('cadastrado');
    await usuario.click(within(analista).getByRole('button', { name: 'Redefinir segundo fator' }));
    await waitFor(() => expect(screen.getAllByTestId('usuario').find((l) => l.textContent?.includes('analista.demo'))).toHaveTextContent('não cadastrado'));
    expect((await base.listarAuditoria()).filter((e) => e.acao.startsWith('usuario.')).map((e) => e.acao)).toEqual(
      expect.arrayContaining(['usuario.listar', 'usuario.criar', 'usuario.alterar']),
    );
  });
});
