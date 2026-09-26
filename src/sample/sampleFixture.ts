import { NOBLE_TILES, STARTING_GEMS, TIER1_CARDS, TIER2_CARDS, TIER3_CARDS } from '../game/constants';
import type { DevelopmentCard, GameState } from '../game/types';
import { useGameStore } from '../store/gameStore';

const buyCardId = '1-U-01';
const reserveCardId = '1-W-08';

function arrange(cards: DevelopmentCard[], frontIds: string[]): [DevelopmentCard[], DevelopmentCard[]] {
  const front = frontIds.map(id => {
    const card = cards.find(item => item.id === id);
    if (!card) throw new Error(`Fixture card is missing: ${id}`);
    return card;
  });
  const rest = cards.filter(item => !frontIds.includes(item.id));
  return [[...front, ...rest.slice(0, 4 - front.length)], rest.slice(4 - front.length)];
}

/** Deterministic legal purchase/reserve scene; never used by formal game setup. */
export function createSampleFixture(): GameState {
  const [visible1, deck1] = arrange(TIER1_CARDS, [buyCardId, reserveCardId]);
  const [visible2, deck2] = arrange(TIER2_CARDS, []);
  const [visible3, deck3] = arrange(TIER3_CARDS, []);
  const playerGems = { white: 1, blue: 0, green: 1, red: 1, black: 1, gold: 0 };
  return {
    board: {
      gemSupply: {
        white: STARTING_GEMS.white - playerGems.white,
        blue: STARTING_GEMS.blue - playerGems.blue,
        green: STARTING_GEMS.green - playerGems.green,
        red: STARTING_GEMS.red - playerGems.red,
        black: STARTING_GEMS.black - playerGems.black,
        gold: STARTING_GEMS.gold,
      },
      visibleCards: [visible1, visible2, visible3],
      decks: [deck1, deck2, deck3],
      nobles: [NOBLE_TILES.find(noble => noble.id === 'N-06')!],
    },
    players: [
      { name: '玩家一', gems: playerGems, reserved: [], purchased: [], nobles: [] },
      { name: '玩家二', gems: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }, reserved: [], purchased: [], nobles: [] },
    ],
    currentPlayerIndex: 0,
    phase: 'playing',
    winner: null,
    turnCount: 0,
  };
}

export function loadSampleFixture() {
  useGameStore.setState({
    ...createSampleFixture(),
    pendingNobles: null,
    pendingDiscard: false,
    lastMoves: [null, null],
    aiMode: false,
    aiConfig: null,
    aiVsAiMode: false,
    aiVsAiConfig: null,
    onlineState: null,
    opponentLeftMessage: null,
  });
}
