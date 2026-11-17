import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SessaoProvider, useSessao } from '../sessao/SessaoContext';
import { clienteFalso } from '../test/clienteFalso';
import { JustificativaBarra } from './JustificativaBarra';

function Leitor() {
  const { justificativa } = useSessao();
  return <output data-testid="valor">{justificativa}</output>;
}

describe('JustificativaBarra', () => {
  it('alerta quando não há justificativa e a guarda na sessão após confirmar', async () => {
    const usuario = userEvent.setup();
    render(
      <SessaoProvider cliente={clienteFalso()} inicial={{ justificativa: '' }}>
        <JustificativaBarra />
        <Leitor />
      </SessaoProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Sem justificativa, as consultas ao caso são recusadas.');
    expect(screen.getByRole('button', { name: 'Usar nesta sessão' })).toBeDisabled();

    await usuario.type(screen.getByLabelText('Texto da justificativa'), 'IP 0001/2026 — vínculos societários');
    await usuario.click(screen.getByRole('button', { name: 'Usar nesta sessão' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('valor')).toHaveTextContent('IP 0001/2026 — vínculos societários');
    expect(screen.getByTestId('justificativa-atual')).toHaveTextContent('IP 0001/2026');
    expect(sessionStorage.getItem('osint.justificativa')).toBe('IP 0001/2026 — vínculos societários');
  });

  it('recusa justificativa com caractere de controle e não a guarda na sessão', async () => {
    const usuario = userEvent.setup();
    render(
      <SessaoProvider cliente={clienteFalso()} inicial={{ justificativa: '' }}>
        <JustificativaBarra />
        <Leitor />
      </SessaoProvider>,
    );
    // Colar preserva a tabulação, que o campo de texto aceita.
    await usuario.click(screen.getByLabelText('Texto da justificativa'));
    await usuario.paste('IP 0001/2026\tvínculos');
    await usuario.click(screen.getByRole('button', { name: 'Usar nesta sessão' }));
    expect(screen.getByTestId('justificativa-erro')).toHaveTextContent('caracteres de controle');
    expect(screen.getByTestId('valor')).toHaveTextContent('');
    expect(sessionStorage.getItem('osint.justificativa')).toBeNull();
  });

  it('permite alterar a justificativa existente', async () => {
    const usuario = userEvent.setup();
    render(
      <SessaoProvider cliente={clienteFalso()} inicial={{ justificativa: 'antiga' }}>
        <JustificativaBarra />
        <Leitor />
      </SessaoProvider>,
    );
    await usuario.click(screen.getByRole('button', { name: 'Alterar' }));
    const campo = screen.getByLabelText('Texto da justificativa');
    await usuario.clear(campo);
    await usuario.type(campo, 'nova');
    await usuario.click(screen.getByRole('button', { name: 'Usar nesta sessão' }));
    expect(screen.getByTestId('valor')).toHaveTextContent('nova');
  });
});
