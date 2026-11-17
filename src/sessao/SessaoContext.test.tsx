import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { clienteFalso } from '../test/clienteFalso';
import { SessaoProvider, useSessao } from './SessaoContext';

function Painel() {
  const { token, justificativa, me, definirToken, definirJustificativa, sair } = useSessao();
  return (
    <div>
      <output data-testid="token">{token}</output>
      <output data-testid="justificativa">{justificativa}</output>
      <output data-testid="usuario">{me?.usuario ?? ''}</output>
      <button
        type="button"
        onClick={() => {
          definirToken('tok-sintetico');
          definirJustificativa('IP 0001/2026 — consulta do usuário anterior');
        }}
      >
        preencher
      </button>
      <button type="button" onClick={sair}>
        sair
      </button>
    </div>
  );
}

describe('SessaoProvider — sair()', () => {
  it('limpa token, usuário e também a justificativa, no estado e no sessionStorage', async () => {
    const usuario = userEvent.setup();
    render(
      <SessaoProvider cliente={clienteFalso()} inicial={{ me: { usuario: 'analista.demo', perfil: 'analista' } }}>
        <Painel />
      </SessaoProvider>,
    );
    await usuario.click(screen.getByRole('button', { name: 'preencher' }));
    expect(sessionStorage.getItem('osint.token')).toBe('tok-sintetico');
    expect(sessionStorage.getItem('osint.justificativa')).toContain('usuário anterior');

    await usuario.click(screen.getByRole('button', { name: 'sair' }));
    expect(screen.getByTestId('token')).toHaveTextContent('');
    expect(screen.getByTestId('justificativa')).toHaveTextContent('');
    expect(screen.getByTestId('usuario')).toHaveTextContent('');
    expect(sessionStorage.getItem('osint.token')).toBeNull();
    expect(sessionStorage.getItem('osint.justificativa')).toBeNull();
  });
});
