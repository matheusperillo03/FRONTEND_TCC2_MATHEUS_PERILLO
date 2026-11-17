import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Caso, NovoCaso } from '../api';
import { SessaoProvider } from '../sessao/SessaoContext';
import { clienteFalso } from '../test/clienteFalso';
import { Casos } from './Casos';

describe('Casos — finalidade e prazo de retenção (RNF04)', () => {
  it('só cria o caso com finalidade e prazo de retenção, e envia os dois ao back-end', async () => {
    const usuario = userEvent.setup();
    const criarCaso = vi.fn(async (corpo: NovoCaso): Promise<Caso> => ({ id: 'caso-9', criado_por: 'ana', criado_em: '2026-11-16T12:00:00Z', ...corpo }));
    render(
      <SessaoProvider cliente={clienteFalso({ criarCaso })} inicial={{ justificativa: 'teste automatizado' }}>
        <Casos aoAbrir={() => undefined} />
      </SessaoProvider>,
    );
    const criar = screen.getByRole('button', { name: 'Criar caso' });
    await usuario.type(screen.getByLabelText('Título'), 'Caso sintético');
    expect(criar).toBeDisabled();
    await usuario.type(screen.getByLabelText('Finalidade'), 'Apurar o contrato sintético 1/2026');
    expect(criar).toBeDisabled();
    await usuario.type(screen.getByLabelText('Prazo de retenção'), '2000-01-01');
    expect(criar).toBeDisabled(); // data passada
    await usuario.clear(screen.getByLabelText('Prazo de retenção'));
    await usuario.type(screen.getByLabelText('Prazo de retenção'), '2099-12-31');
    expect(criar).toBeEnabled();
    await usuario.click(criar);
    expect(criarCaso).toHaveBeenCalledWith({
      titulo: 'Caso sintético',
      descricao: '',
      numero_procedimento: '',
      finalidade: 'Apurar o contrato sintético 1/2026',
      retencao_ate: '2099-12-31',
    });
  });

  it('mostra a finalidade, o prazo e marca o caso vencido como só leitura', async () => {
    const listarCasos = vi.fn(async (): Promise<Caso[]> => [
      { id: 'c1', titulo: 'Vencido', descricao: '', numero_procedimento: 'P-1', criado_por: 'ana', criado_em: '2026-01-01T00:00:00Z', finalidade: 'Apurar X', retencao_ate: '2026-06-30', somente_leitura: true },
      { id: 'c2', titulo: 'Antigo', descricao: '', numero_procedimento: 'P-2', criado_por: 'ana', criado_em: '2026-01-01T00:00:00Z', finalidade: '', retencao_ate: null, somente_leitura: false },
    ]);
    render(
      <SessaoProvider cliente={clienteFalso({ listarCasos })} inicial={{ justificativa: 'teste automatizado' }}>
        <Casos aoAbrir={() => undefined} />
      </SessaoProvider>,
    );
    expect(await screen.findByText('Finalidade: Apurar X')).toBeInTheDocument();
    expect(screen.getByText('30/06/2026')).toBeInTheDocument();
    expect(screen.getAllByText('só leitura')).toHaveLength(1);
  });

  it('H23: mostra o papel do usuário em cada caso e explica a lista vazia de quem não é membro de nenhum', async () => {
    const { unmount } = render(
      <SessaoProvider cliente={clienteFalso({}, 'teste automatizado', { token: 'dev-agente' })} inicial={{ justificativa: 'teste automatizado' }}>
        <Casos aoAbrir={() => undefined} />
      </SessaoProvider>,
    );
    expect(await screen.findByText('Seu papel: leitor')).toBeInTheDocument();
    unmount();

    render(
      <SessaoProvider cliente={clienteFalso({}, 'teste automatizado', { token: 'dev-admin' })} inicial={{ justificativa: 'teste automatizado' }}>
        <Casos aoAbrir={() => undefined} />
      </SessaoProvider>,
    );
    expect(await screen.findByText(/A lista só traz os casos de que você é membro/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir' })).not.toBeInTheDocument();
  });
});
