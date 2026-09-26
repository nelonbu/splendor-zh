import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useGameStore } from '../store/gameStore';
import { createSampleFixture, loadSampleFixture } from './sampleFixture';
import { cardArt, nobleArt, gemArt } from '../components/gameArt.generated';

afterEach(() => {
  act(() => useGameStore.getState().resetGame());
});

describe('stage 2 playable sample', () => {
  it('keeps a deterministic legal scene without changing the normal initial resources', () => {
    const fixture = createSampleFixture();
    expect(fixture.board.visibleCards[0].slice(0, 2).map(card => card.id)).toEqual(['1-U-01', '1-W-08']);
    expect(fixture.board.nobles.map(noble => noble.id)).toEqual(['N-06']);
    expect(fixture.board.gemSupply.black + fixture.players[0].gems.black).toBe(4);
  });

  it('buys a sample card and shows the same art on board, flight and purchased player card', async () => {
    loadSampleFixture();
    const { container } = render(<App />);
    const boardCard = container.querySelector(`.card-slot .card:has(img[src="${cardArt['1-U-01']}"])`)!;
    expect(boardCard).toBeTruthy();
    fireEvent.click(boardCard.querySelector('.btn-buy')!);

    expect(useGameStore.getState().players[0].purchased.map(card => card.id)).toContain('1-U-01');
    expect(container.querySelector(`.purchased-card img[src="${cardArt['1-U-01']}"]`)).toBeTruthy();
    await waitFor(() => expect(container.querySelector(`.fly-overlay .flying-card img[src="${cardArt['1-U-01']}"]`)).toBeTruthy());
  });

  it('reserves a sample card and shows the same art on board, flight and reserved player card', async () => {
    loadSampleFixture();
    const { container } = render(<App />);
    const boardCard = container.querySelector(`.card-slot .card:has(img[src="${cardArt['1-W-08']}"])`)!;
    expect(boardCard).toBeTruthy();
    fireEvent.click(boardCard.querySelector('.btn-reserve')!);

    expect(useGameStore.getState().players[0].reserved.map(card => card.id)).toContain('1-W-08');
    expect(container.querySelector(`.reserved-card img[src="${cardArt['1-W-08']}"]`)).toBeTruthy();
    await waitFor(() => expect(container.querySelector(`.fly-overlay .flying-card img[src="${cardArt['1-W-08']}"]`)).toBeTruthy());
  });

  it('keeps point, cost and requirement text readable when art fails', () => {
    loadSampleFixture();
    const { container } = render(<App />);
    const whiteCard = container.querySelector(`.card-slot .card:has(img[src="${cardArt['1-W-08']}"])`)!;
    const noble = container.querySelector('.noble-tile')!;
    const blueToken = container.querySelector('.gem-token.gem-blue')!;
    expect(noble.querySelector('.noble-art')?.getAttribute('src')).toBe(nobleArt['N-06']);
    expect(blueToken.querySelector('.gem-art')?.getAttribute('src')).toBe(gemArt.blue);
    fireEvent.error(whiteCard.querySelector('.card-art')!);
    fireEvent.error(noble.querySelector('.noble-art')!);
    fireEvent.error(blueToken.querySelector('.gem-art')!);

    expect(whiteCard.querySelector('.card-art')).toBeNull();
    expect(whiteCard.querySelector('.card-points')?.textContent).toBe('1');
    expect(whiteCard.querySelector('.card-cost')?.textContent).toContain('4');
    expect(noble.querySelector('.noble-art')).toBeNull();
    expect(noble.querySelector('.points')?.textContent).toBe('3');
    expect(noble.querySelector('.requirement')?.textContent).toBe('333');
    expect(blueToken.querySelector('.gem-art')).toBeNull();
    expect(blueToken.querySelector('.token-label')).toBeNull();
    expect(blueToken.querySelector('.gem-art-fallback')?.textContent).toBe('蓝');
  });
});
