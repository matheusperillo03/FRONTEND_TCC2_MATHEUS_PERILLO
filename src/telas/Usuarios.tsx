import { useEffect, useState, type FormEvent } from 'react';
import { PERFIS_USUARIO, type AlteracaoUsuario, type PerfilUsuario, type UsuarioAdmin } from '../api';
import { Campo, Carregando, Mensagem, Tabela, formatarData } from '../componentes/basicos';
import { useSessao } from '../sessao/SessaoContext';
import { useChamada } from '../sessao/useChamada';

/**
 * Administração de contas (H23), só para o perfil admin: listar, criar,
 * ativar ou desativar, mudar o perfil, redefinir a senha e apagar o segundo
 * fator. O administrador nunca vê o segredo do segundo fator: cada usuário o
 * cadastra no próprio login.
 */
export function Usuarios() {
  const { cliente, justificativa, me } = useSessao();
  const lista = useChamada<UsuarioAdmin[]>();
  const criacao = useChamada<UsuarioAdmin>();
  const alteracao = useChamada<UsuarioAdmin>();
  const [usuario, setUsuario] = useState('');
  const [nome, setNome] = useState('');
  const [perfil, setPerfil] = useState<PerfilUsuario>('analista');
  const [senha, setSenha] = useState('');
  /** Conta com o campo de senha nova aberto. */
  const [redefinindo, setRedefinindo] = useState<string | null>(null);
  const [senhaNova, setSenhaNova] = useState('');

  const semJustificativa = !justificativa.trim();
  const carregar = () => lista.executar(() => cliente.listarUsuarios());

  useEffect(() => {
    if (semJustificativa) {
      lista.limpar();
      return;
    }
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, semJustificativa]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    const r = await criacao.executar(() => cliente.criarUsuario({ usuario: usuario.trim().toLowerCase(), nome: nome.trim(), perfil, senha }));
    if (r) {
      setUsuario('');
      setNome('');
      setSenha('');
      await carregar();
    }
  }

  async function alterar(alvo: string, corpo: AlteracaoUsuario) {
    const r = await alteracao.executar(() => cliente.alterarUsuario(alvo, corpo));
    if (r) {
      setRedefinindo(null);
      setSenhaNova('');
      await carregar();
    }
  }

  const ocupado = alteracao.carregando || criacao.carregando;

  return (
    <main className="casos" id="conteudo">
      <section className="br-card painel" aria-labelledby="usuarios-titulo">
        <div className="painel-cabecalho">
          <h2 id="usuarios-titulo">Usuários</h2>
          <button type="button" className="br-button secondary small" onClick={() => void carregar()} disabled={lista.carregando || semJustificativa}>
            Atualizar
          </button>
        </div>
        <p className="mudo">
          Só o perfil admin administra contas. Mudar o perfil, a senha, o segundo fator ou desativar a conta encerra as
          sessões dela. Cada ação fica na trilha de auditoria.
        </p>
        {semJustificativa && <Mensagem tipo="aviso">Informe a justificativa no topo da página para administrar as contas.</Mensagem>}
        {lista.carregando && <Carregando />}
        {lista.erro && <Mensagem tipo="erro">{lista.erro}</Mensagem>}
        {alteracao.erro && <Mensagem tipo="erro">{alteracao.erro}</Mensagem>}
        {alteracao.dados && <Mensagem tipo="ok">Conta {alteracao.dados.usuario} atualizada.</Mensagem>}
        {lista.dados && (
          <Tabela rotulo="Contas de usuário">
            <thead>
              <tr>
                <th scope="col">Usuário</th>
                <th scope="col">Perfil</th>
                <th scope="col">Situação</th>
                <th scope="col">Segundo fator</th>
                <th scope="col">Criada</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.dados.map((u) => {
                const eu = u.usuario === me?.usuario;
                return (
                  <tr key={u.usuario} data-testid="usuario">
                    <td>
                      <strong>{u.usuario}</strong>
                      {eu && <span className="mudo"> (você)</span>}
                      {u.nome && <div className="mudo">{u.nome}</div>}
                    </td>
                    <td>
                      <select aria-label={`Perfil de ${u.usuario}`} value={u.perfil} disabled={ocupado || eu} onChange={(e) => void alterar(u.usuario, { perfil: e.target.value as PerfilUsuario })}>
                        {PERFIS_USUARIO.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {u.ativo ? 'ativa' : 'desativada'}
                      {u.bloqueado_ate && <div className="mudo">bloqueada até {formatarData(u.bloqueado_ate)}</div>}
                    </td>
                    <td>
                      {u.mfa_ativo ? 'cadastrado' : 'não cadastrado'}
                      {u.mfa_obrigatorio && <div className="mudo">obrigatório para o perfil</div>}
                    </td>
                    <td>
                      {formatarData(u.criado_em)}
                      {u.criado_por && <div className="mudo">por {u.criado_por}</div>}
                    </td>
                    <td>
                      <div className="linha">
                        <button type="button" className="br-button secondary small" disabled={ocupado || eu} onClick={() => void alterar(u.usuario, { ativo: !u.ativo })}>
                          {u.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                        <button type="button" className="br-button secondary small" disabled={ocupado || !u.mfa_ativo} onClick={() => void alterar(u.usuario, { redefinir_mfa: true })}>
                          Redefinir segundo fator
                        </button>
                        <button
                          type="button"
                          className="br-button secondary small"
                          disabled={ocupado}
                          onClick={() => {
                            setSenhaNova('');
                            setRedefinindo(redefinindo === u.usuario ? null : u.usuario);
                          }}
                        >
                          Redefinir senha
                        </button>
                      </div>
                      {redefinindo === u.usuario && (
                        <form
                          className="linha"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (senhaNova) void alterar(u.usuario, { senha: senhaNova });
                          }}
                        >
                          <Campo rotulo={`Senha nova de ${u.usuario}`} emLinha>
                            <input type="password" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} autoComplete="new-password" maxLength={256} required />
                          </Campo>
                          <button type="submit" className="br-button primary small" disabled={ocupado || !senhaNova}>
                            Gravar senha
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        )}
      </section>

      <section className="br-card painel" aria-labelledby="novo-usuario-titulo">
        <h2 id="novo-usuario-titulo">Nova conta</h2>
        <form onSubmit={criar} className="formulario">
          <Campo rotulo="Login" dica="De 3 a 64 caracteres: letras minúsculas, dígitos, ponto, hífen ou sublinhado.">
            <input type="text" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={64} required />
          </Campo>
          <Campo rotulo="Nome">
            <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" maxLength={200} />
          </Campo>
          <Campo rotulo="Perfil">
            <select value={perfil} onChange={(e) => setPerfil(e.target.value as PerfilUsuario)}>
              {PERFIS_USUARIO.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Senha inicial" dica="Entregue ao usuário por canal seguro. O segundo fator é cadastrado por ele no primeiro login.">
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" maxLength={256} required />
          </Campo>
          <div className="linha">
            <button type="submit" className="br-button primary small" disabled={criacao.carregando || semJustificativa || usuario.trim().length < 3 || !senha}>
              {criacao.carregando ? 'Criando…' : 'Criar conta'}
            </button>
          </div>
          {criacao.erro && <Mensagem tipo="erro">{criacao.erro}</Mensagem>}
          {criacao.dados && (
            <Mensagem tipo="ok">
              Conta <strong>{criacao.dados.usuario}</strong> criada com o perfil {criacao.dados.perfil}.
            </Mensagem>
          )}
        </form>
      </section>
    </main>
  );
}
