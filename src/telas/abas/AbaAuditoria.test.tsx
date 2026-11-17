import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { VerificacaoAuditoria } from '../../api';
import { SessaoProvider } from '../../sessao/SessaoContext';
import { clienteFalso } from '../../test/clienteFalso';
import { AbaAuditoria } from './AbaAuditoria';

function renderizar(verificarAuditoria: () => Promise<VerificacaoAuditoria>) {
  render(
    <SessaoProvider cliente={clienteFalso({ verificarAuditoria })}>
      <AbaAuditoria casoId="caso-1" />
    </SessaoProvider>,
  );
}

describe('AbaAuditoria — verificação da cadeia (RNF02)', () => {
  it('lista as entradas e mostra o estado de verificação em andamento e íntegra', async () => {
    const usuario = userEvent.setup();
    let resolver!: (v: VerificacaoAuditoria) => void;
    const pendente = new Promise<VerificacaoAuditoria>((r) => (resolver = r));
    renderizar(() => pendente);

    expect(await screen.findByRole('table')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Verificar cadeia' }));
    expect(screen.getByRole('button', { name: 'Verificando…' })).toBeDisabled();
    expect(screen.getByText('Verificando a cadeia de auditoria…')).toBeInTheDocument();

    resolver({ integra: true, entradas: 12, primeira_quebra: null });
    expect(await screen.findByTestId('resultado-cadeia')).toHaveTextContent('Cadeia íntegra');
    expect(screen.getByText(/12 entrada\(s\) verificada\(s\)/)).toBeInTheDocument();
    expect(screen.queryByText(/primeira quebra/)).not.toBeInTheDocument();
  });

  it('mostra cadeia violada com a primeira quebra', async () => {
    const usuario = userEvent.setup();
    renderizar(vi.fn(async () => ({ integra: false, entradas: 5, primeira_quebra: 3 })));
    await screen.findByRole('table');
    await usuario.click(screen.getByRole('button', { name: 'Verificar cadeia' }));
    expect(await screen.findByTestId('resultado-cadeia')).toHaveTextContent('Cadeia VIOLADA');
    expect(screen.getByText(/primeira quebra na entrada/)).toBeInTheDocument();
    expect(screen.getByText('seq 3')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('exibe o erro quando a verificação falha', async () => {
    const usuario = userEvent.setup();
    renderizar(vi.fn(async () => {
      throw new Error('serviço indisponível');
    }));
    await screen.findByRole('table');
    await usuario.click(screen.getByRole('button', { name: 'Verificar cadeia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('serviço indisponível');
  });
});
