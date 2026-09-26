import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App';
import { NOBLE_TILES, TIER1_CARDS, TIER2_CARDS, TIER3_CARDS } from '../game/constants';
import { useGameStore } from '../store/gameStore';
import { loadSampleFixture } from '../sample/sampleFixture';
import { cardArt, deckArt, gemArt, nobleArt } from './gameArt.generated';

afterEach(() => act(() => useGameStore.getState().resetGame()));

describe('complete game art mapping and shared surfaces', () => {
  it('has stable display paths for every main-project card, noble, gem and deck', () => {
    const cards = [...TIER1_CARDS, ...TIER2_CARDS, ...TIER3_CARDS];
    expect(Object.keys(cardArt)).toHaveLength(cards.length);
    expect(cards.every(card => cardArt[card.id]?.startsWith('/pygem/images/'))).toBe(true);
    expect(Object.keys(nobleArt)).toHaveLength(NOBLE_TILES.length);
    expect(NOBLE_TILES.every(noble => nobleArt[noble.id]?.startsWith('/'))).toBe(true);
    expect(Object.keys(deckArt)).toHaveLength(3);
    expect(Object.keys(gemArt)).toHaveLength(6);
    expect(cardArt['1-U-01']).toBe(cardArt['1-U-01']);
  });

  it('shows mapped art on market cards, backs, pool, player nobles and noble choice', () => {
    loadSampleFixture();
    const state = useGameStore.getState();
    const noble = NOBLE_TILES.find(item => item.id === 'N-06')!;
    act(() => useGameStore.setState({
      players: [{ ...state.players[0], nobles: [noble] }, state.players[1]],
      pendingNobles: [noble],
    }));
    const { container } = render(<App />);
    for (const card of state.board.visibleCards.flat()) {
      expect(container.querySelector(`.card-slot .card img[src="${cardArt[card.id]}"]`)).toBeTruthy();
    }
    expect([...container.querySelectorAll('.deck-button .deck-art')].map(img => img.getAttribute('src')))
      .toEqual([deckArt[3], deckArt[2], deckArt[1]]);
    for (const path of Object.values(gemArt)) {
      expect(container.querySelector(`.gem-token img[src="${path}"]`)).toBeTruthy();
    }
    expect(container.querySelector(`.player-noble img[src="${nobleArt[noble.id]}"]`)).toBeTruthy();
    expect(container.querySelector(`.noble-choice img[src="${nobleArt[noble.id]}"]`)).toBeTruthy();
    expect(container.querySelector('.card-slot .card:has(img[src="/pygem/images/blue1-1.webp"]) .btn-buy')?.hasAttribute('disabled')).toBe(true);
    expect(container.querySelector('.deck-button')?.hasAttribute('disabled')).toBe(true);
  });

  it('keeps mapped icons and numbers in the discard dialog and gem flight', async () => {
    loadSampleFixture();
    const { container } = render(<App />);
    fireEvent.click(container.querySelector('.gem-token.gem-white')!);
    fireEvent.click(container.querySelector('.gem-token.gem-blue')!);
    fireEvent.click(container.querySelector('.gem-token.gem-green')!);
    fireEvent.click(container.querySelector('.gem-selection-actions .btn-confirm')!);
    await waitFor(() => expect(container.querySelector(`.fly-overlay .flying-gem img[src="${gemArt.white}"]`)).toBeTruthy());

    const state = useGameStore.getState();
    act(() => useGameStore.setState({
      currentPlayerIndex: 0,
      players: [{ ...state.players[0], gems: { white: 3, blue: 3, green: 3, red: 2, black: 0, gold: 0 } }, state.players[1]],
      pendingDiscard: true,
    }));
    expect(container.querySelector(`.discard-gem.gem-white img[src="${gemArt.white}"]`)).toBeTruthy();
    expect(container.querySelector('.discard-gem.gem-white .gem-value')?.textContent).toBe('3');
  });

  it('measures the live card after a viewport change when starting the flight', async () => {
    loadSampleFixture();
    const { container } = render(<App />);
    const boardCard = container.querySelector(`.card-slot .card:has(img[src="${cardArt['1-U-01']}"])`)!;
    const source = boardCard as HTMLElement;
    source.getBoundingClientRect = () => new DOMRect(200, 160, 120, 140);
    fireEvent(window, new Event('resize'));
    fireEvent.click(boardCard.querySelector('.btn-buy')!);
    await waitFor(() => {
      const flight = container.querySelector('.fly-overlay .flying-card') as HTMLElement | null;
      expect(flight).toBeTruthy();
      expect(flight?.style.left).toBe('260px');
      expect(flight?.style.top).toBe('230px');
    });
  });

  it('flies a tier back rather than revealing the face on a blind reserve', async () => {
    loadSampleFixture();
    const { container } = render(<App />);
    fireEvent.click(container.querySelector('.deck-button')!);
    expect(useGameStore.getState().players[0].reserved.slice(-1)[0]?.tier).toBe(3);
    await waitFor(() => {
      const flight = container.querySelector('.fly-overlay .deck-flight');
      expect(flight?.querySelector('.deck-art')?.getAttribute('src')).toBe(deckArt[3]);
      expect(flight?.querySelector('.card-art')).toBeNull();
    });
  });

  it('retains readable deck, card and icon text when their images fail', () => {
    loadSampleFixture();
    const { container } = render(<App />);
    const deck = container.querySelector('.deck-button')!;
    const card = container.querySelector('.card-slot .card')!;
    const token = container.querySelector('.gem-token.gem-white')!;
    expect(token.querySelector('.token-label')).toBeNull();
    expect(token.querySelector('.gem-art-fallback')).toBeNull();
    expect(token.getAttribute('aria-label')).toContain('白色宝石');
    const bonus = card.querySelector('.card-bonus')!;
    expect(bonus.textContent).toBe('');
    fireEvent.error(deck.querySelector('.deck-art')!);
    fireEvent.error(card.querySelector('.card-art')!);
    fireEvent.error(token.querySelector('.gem-art')!);
    fireEvent.error(bonus.querySelector('.gem-art')!);
    expect(deck.querySelector('.deck-art')).toBeNull();
    expect(deck.textContent).toContain('牌堆');
    expect(card.querySelector('.card-cost')?.textContent).toBeTruthy();
    expect(token.querySelector('.gem-art-fallback')?.textContent).toBe('白');
    expect(bonus.querySelector('.gem-art-fallback')?.textContent).toBeTruthy();
  });
});
