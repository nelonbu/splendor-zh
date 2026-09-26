import { describe, it, expect } from 'vitest';
import type { GameState, Action, NobleTile } from '../game/types';
import { generateInitialState } from '../game/engine';
import {
  buildGameStatePrompt,
  buildLegalMovesPrompt,
  buildSystemPrompt,
  buildDiscardPrompt,
  buildNobleSelectionPrompt,
  parseAiResponse,
} from './aiService';

// ── Helpers ─────────────────────────────────────────────────

function makeSampleState(): GameState {
  return generateInitialState('Alice', 'Bob');
}

function makeSampleActions(state: GameState): Action[] {
  // Manually construct a small set of representative legal actions
  const actions: Action[] = [];

  // Take 3 gems
  actions.push({ type: 'takeGems', colors: ['white', 'blue', 'green'] });

  // Take 2 gems
  actions.push({ type: 'take2Gems', color: 'red' });

  // Reserve visible card
  const visibleCard = state.board.visibleCards[0][0];
  if (visibleCard) {
    actions.push({ type: 'reserveCard', source: visibleCard });
  }

  // Reserve from deck
  actions.push({ type: 'reserveCard', source: { fromDeck: 2 } });

  return actions;
}

// ── Prompt Construction Tests ───────────────────────────────

describe('buildGameStatePrompt', () => {
  it('produces valid JSON with full color names', () => {
    const state = makeSampleState();
    const prompt = buildGameStatePrompt(state);

    expect(prompt).toContain('Current game state:');
    // Extract the JSON part (before optional PLANNING section)
    const jsonStr = prompt.replace('Current game state:\n', '').split('\n\nPLANNING')[0];
    const parsed = JSON.parse(jsonStr);

    // Check structure
    expect(parsed).toHaveProperty('you');
    expect(parsed).toHaveProperty('opp');
    expect(parsed).toHaveProperty('board');
    expect(parsed.board).toHaveProperty('gems');
    expect(parsed.board).toHaveProperty('tier1');
    expect(parsed.board).toHaveProperty('tier2');
    expect(parsed.board).toHaveProperty('tier3');
    expect(parsed.board).toHaveProperty('deckSizes');
    expect(parsed.board).toHaveProperty('nobles');

    // Check full color name gem keys (supply should have white, blue, etc.)
    expect(parsed.board.gems).toHaveProperty('white');
    expect(parsed.board.gems).toHaveProperty('gold');

    // Check cards have full color bonus
    expect(parsed.board.tier1[0]).toHaveProperty('id');
    expect(parsed.board.tier1[0]).toHaveProperty('bonus');
    expect(parsed.board.tier1[0]).toHaveProperty('cost');
    // bonus should be a full color name
    expect(['white', 'blue', 'green', 'red', 'black']).toContain(parsed.board.tier1[0].bonus);
  });

  it('stays under 4000 tokens (rough char estimate)', () => {
    const state = makeSampleState();
    const prompt = buildGameStatePrompt(state);
    // Rough estimate: ~4 chars per token; full names + planning section is larger
    expect(prompt.length).toBeLessThan(16000);
  });

  it('defaults to Player 2 perspective (backward compat)', () => {
    const state = makeSampleState();
    const prompt = buildGameStatePrompt(state);
    const jsonStr = prompt.replace('Current game state:\n', '').split('\n\nPLANNING')[0].split('\n\nOPPONENT')[0];
    const parsed = JSON.parse(jsonStr);

    expect(parsed.you.name).toContain('P2');
    expect(parsed.opp.name).toContain('P1');
  });

  it('uses Player 1 perspective when aiPlayerIndex=0', () => {
    const state = makeSampleState();
    const prompt = buildGameStatePrompt(state, 0);
    const jsonStr = prompt.replace('Current game state:\n', '').split('\n\nPLANNING')[0].split('\n\nOPPONENT')[0];
    const parsed = JSON.parse(jsonStr);

    expect(parsed.you.name).toContain('P1');
    expect(parsed.opp.name).toContain('P2');
  });

  it('swaps player data correctly based on perspective', () => {
    const state = makeSampleState();
    // Give Player 1 (index 0) some gems so we can verify the swap
    state.players[0].gems = { white: 5, blue: 0, green: 0, red: 0, black: 0, gold: 0 };
    state.players[1].gems = { white: 0, blue: 0, green: 0, red: 0, black: 3, gold: 0 };

    // From P1 perspective (index=0): "you" should be P1 with 5 white
    const promptP1 = buildGameStatePrompt(state, 0);
    const jsonP1 = promptP1.replace('Current game state:\n', '').split('\n\nPLANNING')[0].split('\n\nOPPONENT')[0];
    const parsedP1 = JSON.parse(jsonP1);
    expect(parsedP1.you.gems.white).toBe(5);
    expect(parsedP1.opp.gems.black).toBe(3);

    // From P2 perspective (index=1): "you" should be P2 with 3 black
    const promptP2 = buildGameStatePrompt(state, 1);
    const jsonP2 = promptP2.replace('Current game state:\n', '').split('\n\nPLANNING')[0].split('\n\nOPPONENT')[0];
    const parsedP2 = JSON.parse(jsonP2);
    expect(parsedP2.you.gems.black).toBe(3);
    expect(parsedP2.opp.gems.white).toBe(5);
  });
});

describe('buildLegalMovesPrompt', () => {
  it('categorizes moves correctly', () => {
    const state = makeSampleState();
    const actions = makeSampleActions(state);
    const prompt = buildLegalMovesPrompt(actions);

    expect(prompt).toContain('Legal moves:');
    expect(prompt).toContain('Take 3 gems');
    expect(prompt).toContain('white,blue,green');
    expect(prompt).toContain('Take 2 gems');
    expect(prompt).toContain('red');
    expect(prompt).toContain('Reserve visible');
    expect(prompt).toContain('Reserve from deck');
    expect(prompt).toContain('tier 2');
  });
});

describe('buildSystemPrompt', () => {
  it('returns non-empty system prompt with JSON schema', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('reasoning');
    expect(prompt).toContain('action');
  });

  it('defaults to Player 2 for backward compatibility', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('Player 2');
    expect(prompt).not.toContain('Player 1');
  });

  it('uses Player 1 when playerIndex=0', () => {
    const prompt = buildSystemPrompt(0);
    expect(prompt).toContain('Player 1');
    expect(prompt).not.toContain('Player 2');
  });

  it('uses Player 2 when playerIndex=1', () => {
    const prompt = buildSystemPrompt(1);
    expect(prompt).toContain('Player 2');
    expect(prompt).not.toContain('Player 1');
  });
});

describe('buildDiscardPrompt', () => {
  it('includes gem counts and excess amount', () => {
    const gems = { white: 3, blue: 3, green: 3, red: 2, black: 0, gold: 1 };
    const prompt = buildDiscardPrompt(gems, 2);
    expect(prompt).toContain('discard exactly 2');
    expect(prompt).toContain('discardGems');
  });
});

describe('buildNobleSelectionPrompt', () => {
  it('lists noble options', () => {
    const nobles: NobleTile[] = [
      { id: 'N-01', prestigePoints: 3, requirement: { white: 3, blue: 3 } },
      { id: 'N-02', prestigePoints: 3, requirement: { green: 3, red: 3 } },
    ];
    const prompt = buildNobleSelectionPrompt(nobles);
    expect(prompt).toContain('N-01');
    expect(prompt).toContain('N-02');
    expect(prompt).toContain('3pts');
  });
});

// ── Response Parsing Tests ──────────────────────────────────

describe('parseAiResponse', () => {
  const state = makeSampleState();
  const legalActions = makeSampleActions(state);

  it('correctly extracts reasoning and action from well-formed JSON', () => {
    const response = JSON.stringify({
      reasoning: ['Good gems available', 'Need blue for tier 2 card', 'Opponent low on gems'],
      action: { type: 'takeGems', colors: ['white', 'blue', 'green'] },
    });

    const result = parseAiResponse(response, legalActions);
    expect(result.reasoning).toEqual([
      'Good gems available',
      'Need blue for tier 2 card',
      'Opponent low on gems',
    ]);
    expect(result.action).toEqual({ type: 'takeGems', colors: ['white', 'blue', 'green'] });
  });

  it('handles JSON wrapped in markdown code block', () => {
    const response = '```json\n' + JSON.stringify({
      reasoning: ['Reasoning here'],
      action: { type: 'take2Gems', color: 'red' },
    }) + '\n```';

    const result = parseAiResponse(response, legalActions);
    expect(result.action).toEqual({ type: 'take2Gems', color: 'red' });
  });

  it('falls back to first legal move when AI returns an illegal action', () => {
    const response = JSON.stringify({
      reasoning: ['I want to take gold gems'],
      action: { type: 'takeGems', colors: ['gold', 'blue', 'green'] },
    });

    const result = parseAiResponse(response, legalActions);
    // Should fallback — gold is not a legal takeGems color
    expect(result.reasoning).toContain('AI chose an illegal move — using fallback.');
    // Fallback is the first legal action converted to AiAction
    expect(result.action.type).toBe('takeGems');
    if (result.action.type === 'takeGems') {
      expect(result.action.colors).toEqual(['white', 'blue', 'green']);
    }
  });

  it('falls back when action is a purchase of non-existent card', () => {
    const response = JSON.stringify({
      reasoning: ['Buying this card'],
      action: { type: 'purchaseCard', cardId: 'FAKE-99' },
    });

    const result = parseAiResponse(response, legalActions);
    expect(result.reasoning).toContain('AI chose an illegal move — using fallback.');
  });

  it('handles completely malformed JSON gracefully', () => {
    const result = parseAiResponse('this is not json at all!!!', legalActions);
    expect(result.reasoning).toContain('AI returned malformed JSON — using fallback move.');
    expect(result.action.type).toBe('takeGems');
  });

  it('handles empty response', () => {
    const result = parseAiResponse('', legalActions);
    expect(result.reasoning).toContain('AI returned malformed JSON — using fallback move.');
  });

  it('handles response with missing action field', () => {
    const response = JSON.stringify({
      reasoning: ['Some thoughts'],
    });

    const result = parseAiResponse(response, legalActions);
    expect(result.reasoning).toContain('AI returned no action — using fallback move.');
  });

  it('validates take2Gems correctly', () => {
    const response = JSON.stringify({
      reasoning: ['Double red'],
      action: { type: 'take2Gems', color: 'red' },
    });

    const result = parseAiResponse(response, legalActions);
    expect(result.action).toEqual({ type: 'take2Gems', color: 'red' });
    expect(result.reasoning).not.toContain('AI chose an illegal move — using fallback.');
  });

  it('validates reserveCard from deck correctly', () => {
    const response = JSON.stringify({
      reasoning: ['Reserve from tier 2'],
      action: { type: 'reserveCard', fromDeck: 2 },
    });

    const result = parseAiResponse(response, legalActions);
    expect(result.action).toEqual({ type: 'reserveCard', fromDeck: 2 });
  });

  it('rejects reserveCard from wrong deck tier', () => {
    const response = JSON.stringify({
      reasoning: ['Reserve from tier 3'],
      action: { type: 'reserveCard', fromDeck: 3 },
    });

    // Our sample actions only include fromDeck: 2
    const result = parseAiResponse(response, legalActions);
    expect(result.reasoning).toContain('AI chose an illegal move — using fallback.');
  });

  it('validates takeGems regardless of color order', () => {
    const response = JSON.stringify({
      reasoning: ['Taking gems'],
      action: { type: 'takeGems', colors: ['green', 'white', 'blue'] },
    });

    const result = parseAiResponse(response, legalActions);
    // Should match ['white', 'blue', 'green'] regardless of order
    expect(result.action.type).toBe('takeGems');
    expect(result.reasoning).not.toContain('AI chose an illegal move — using fallback.');
  });
});
