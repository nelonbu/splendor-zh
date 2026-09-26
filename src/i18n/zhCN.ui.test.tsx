import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NOBLE_TILES } from '../game/constants';
import { useGameStore } from '../store/gameStore';
import DiscardModal from '../components/DiscardModal';
import NobleModal from '../components/NobleModal';
import GameOver from '../components/GameOver';

afterEach(() => {
  cleanup();
  act(() => useGameStore.getState().resetGame());
});

describe('Chinese local outcome and required-action dialogs', () => {
  it('explains the gem limit and labels discard and undo controls', () => {
    const state = useGameStore.getState();
    act(() => useGameStore.setState({
      players: [{ ...state.players[0], gems: { white: 5, blue: 2, green: 2, red: 1, black: 1, gold: 0 } }, state.players[1]],
      pendingDiscard: true,
    }));
    render(<DiscardModal />);
    expect(screen.getByRole('dialog', { name: '弃置宝石' })).toBeTruthy();
    expect(screen.getByText('你有 11 枚宝石，请弃置到 10 枚。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '弃置 1 枚白色宝石，当前选择弃置 0 枚' }));
    expect(screen.getByRole('button', { name: '确认弃置（1 枚）' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: '撤销弃置 1 枚白色宝石' })).toBeTruthy();
  });

  it('names the noble choice for keyboard and screen reader use', () => {
    act(() => useGameStore.setState({ pendingNobles: [NOBLE_TILES[0]] }));
    render(<NobleModal />);
    expect(screen.getByRole('dialog', { name: '选择贵族' })).toBeTruthy();
    const choice = screen.getByRole('button', { name: '选择贵族，3 点声望' });
    expect(choice.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(choice, { key: 'Enter' });
    expect(useGameStore.getState().pendingNobles).toBeNull();
  });

  it('shows the local winner, score and replay action in Chinese', () => {
    const state = useGameStore.getState();
    const winner = { ...state.players[0], name: '玩家一' };
    act(() => useGameStore.setState({ players: [winner, state.players[1]], winner, phase: 'ended' }));
    render(<GameOver />);
    expect(screen.getByRole('heading', { name: '玩家一获胜！' })).toBeTruthy();
    expect(screen.getByText('0 点声望')).toBeTruthy();
    expect(screen.getByRole('button', { name: '再玩一局' })).toBeTruthy();
  });
});
