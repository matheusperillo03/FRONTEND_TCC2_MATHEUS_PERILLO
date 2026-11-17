import { useState } from 'react';
import type { Id } from './api';
import { JustificativaBarra } from './componentes/JustificativaBarra';
import { Cabecalho, Rodape } from './componentes/Moldura';
import { useSessao } from './sessao/SessaoContext';
import { Caso } from './telas/Caso';
import { Casos } from './telas/Casos';
import { Conta } from './telas/Conta';
import { Entrada } from './telas/Entrada';
import { Usuarios } from './telas/Usuarios';

type Tela = 'casos' | 'conta' | 'usuarios';

export function App() {
  const { me, encerrarSessao } = useSessao();
  const [casoAberto, setCasoAberto] = useState<Id | null>(null);
  const [tela, setTela] = useState<Tela>('casos');
  const [saindo, setSaindo] = useState(false);

  // Sem usuário (antes do login, depois de "Sair" ou com a sessão expirada), só existe a tela de entrada.
  if (!me) return <Entrada />;

  async function sair() {
    setSaindo(true);
    try {
      await encerrarSessao();
    } finally {
      setSaindo(false);
      setCasoAberto(null);
      setTela('casos');
    }
  }

  return (
    <div className="app">
      <nav className="br-skiplink" aria-label="Atalhos">
        <a className="br-item" href="#conteudo">
          Ir para o conteúdo
        </a>
      </nav>
      <Cabecalho>
        <span>
          <span className="mudo">usuário</span> <strong>{me.usuario}</strong>
        </span>
        <span>
          <span className="mudo">perfil</span> <strong>{me.perfil}</strong>
        </span>
        {tela !== 'casos' && (
          <button type="button" className="br-button secondary small" onClick={() => setTela('casos')}>
            Casos
          </button>
        )}
        {me.perfil === 'admin' && tela !== 'usuarios' && (
          <button type="button" className="br-button secondary small" onClick={() => setTela('usuarios')}>
            Usuários
          </button>
        )}
        {tela !== 'conta' && (
          <button type="button" className="br-button secondary small" onClick={() => setTela('conta')}>
            Minha conta
          </button>
        )}
        <button type="button" className="br-button secondary small" onClick={() => void sair()} disabled={saindo}>
          {saindo ? 'Saindo…' : 'Sair'}
        </button>
      </Cabecalho>
      <JustificativaBarra />
      {tela === 'conta' && <Conta />}
      {tela === 'usuarios' && <Usuarios />}
      {tela === 'casos' && (casoAberto === null ? <Casos aoAbrir={setCasoAberto} /> : <Caso casoId={casoAberto} aoVoltar={() => setCasoAberto(null)} />)}
      <Rodape />
    </div>
  );
}
