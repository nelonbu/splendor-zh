import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import GameSetup from '../src/components/GameSetup';
import { useGameStore } from '../src/store/gameStore';

describe('local game setup', () => {
  beforeEach(() => {
    localStorage.clear();
    useGameStore.getState().resetGame();
  });

  afterEach(cleanup);

  it('starts a two-player local game with both entered names', () => {
    render(<GameSetup />);

    const start = screen.getByRole('button', { name: '开始游戏' });
    expect(start.hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('textbox', { name: '玩家一名称' }).getAttribute('value')).toBe('玩家一');
    expect(screen.getByRole('textbox', { name: '玩家二名称' }).getAttribute('value')).toBe('玩家二');
    expect(screen.queryByRole('button', { name: /AI|Online/i })).toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: '玩家一名称' }), {
      target: { value: ' Alice ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '玩家二名称' }), {
      target: { value: ' Bob ' },
    });
    fireEvent.click(start);

    const state = useGameStore.getState();
    expect(state.phase).toBe('playing');
    expect(state.players.map(player => player.name)).toEqual(['Alice', 'Bob']);
    expect(state.aiMode).toBe(false);
    expect(state.onlineState).toBeNull();
  });

  it('opens Chinese rules with accessible labels and keeps blank names invalid', () => {
    render(<GameSetup />);
    fireEvent.click(screen.getByRole('button', { name: '玩法说明' }));
    expect(screen.getByRole('dialog', { name: '璀璨宝石玩法说明' })).toBeTruthy();
    expect(screen.getByText(/任一玩家达到至少 15 点声望/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭玩法说明' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: '玩家二名称' }), { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: '开始游戏' }).hasAttribute('disabled')).toBe(true);
  });
});
