import type {
  GameState,
  Action,
  GemColor,
  NobleTile,
  DevelopmentCard,
} from '../game/types';
import type { AiAction, AiConfig, AiResponse, AiMoveResult } from './aiTypes';
import { COLORED_GEMS } from '../game/constants';
import { getPlayerBonuses, getPlayerPoints, getEffectiveCost, canAfford } from '../game/selectors';
import { getToken } from '../online/socketClient';

// ── Abbreviation Maps ───────────────────────────────────────

function compactGems(gems: Partial<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [color, count] of Object.entries(gems)) {
    if (count && count > 0) out[color] = count;
  }
  return out;
}

// ── Prompt Builders ─────────────────────────────────────────

export function buildSystemPrompt(playerIndex: 0 | 1 = 1): string {
  return `You are an expert Splendor board game AI playing as Player ${playerIndex + 1} in a 2-player game. Your goal is to win by reaching 15 or more prestige points.

GAME OVERVIEW:
Splendor is an engine-building card game. Players collect gem tokens, purchase development cards that provide permanent gem bonuses, and attract noble patrons. The first player to reach 15 prestige points triggers the end game, after which the round is completed so both players have taken an equal number of turns. The player with the most prestige points wins; ties are broken by fewest purchased cards.

COMPONENTS (2-player setup):
- 5 colored gem types: white, blue, green, red, black — 4 tokens each in the supply
- 1 wildcard gem type: gold — 5 tokens in the supply
- 90 development cards across 3 tiers:
  - Tier 1 (40 cards): cheaper, mostly 0–1 prestige points
  - Tier 2 (30 cards): mid-range, 1–3 prestige points
  - Tier 3 (20 cards): expensive, 3–5 prestige points
- Each card provides a permanent gem bonus (one of the 5 colors) and may award prestige points
- 3 noble tiles on the board, each worth 3 prestige points

TURN ACTIONS — you must perform exactly ONE per turn:

1. TAKE 3 DIFFERENT GEMS: Pick up to 3 gems of different colors from the supply (each chosen color must have at least 1 gem available). If fewer than 3 colors are available, take 1 of each available color. Gold cannot be taken this way.

2. TAKE 2 GEMS OF ONE COLOR: Pick 2 gems of a single color, but only if that color has 4 or more gems in the supply. Gold cannot be taken this way.

3. RESERVE A CARD: Take any face-up card or the top card of any tier's deck into your hand (hidden from opponent). You receive 1 gold gem from the supply if available. Maximum 3 reserved cards at a time.

4. PURCHASE A CARD: Buy any face-up card from the board or any card from your reserved hand.
   - Your permanent card bonuses reduce the cost (each bonus of color X reduces that color's cost by 1, minimum 0).
   - Any remaining cost is paid with gems from your hand.
   - Gold gems are wildcards: 1 gold can substitute for 1 gem of any color.
   - Paid gems return to the supply.
   - The purchased card's gem bonus is now permanent for all future purchases.

END-OF-TURN CHECKS (automatic, in order):
1. GEM LIMIT: Maximum 10 gems in hand (including gold). If over, you must discard gems of your choice back to the supply until you have exactly 10.
2. NOBLE VISIT: If your purchased card bonuses meet or exceed a noble's requirements, that noble automatically visits you (3 prestige points). If you qualify for multiple nobles simultaneously, you choose one. Only one noble can visit per turn.
3. WIN CHECK: If any player has 15+ prestige points, the end game is triggered. The current round is completed so both players have equal turns, then the player with the most points wins.

CARD REPLACEMENT: When a face-up card is purchased or reserved, the top card of that tier's deck immediately replaces it. If the deck is empty, the slot stays empty.

INFORMATION PROVIDED TO YOU:
- "you" section: your points, gems, bonuses, reserved cards, and purchased cards
- "opp" section: same information for your opponent
- Board state: gem supply, visible cards across all tiers, deck sizes, noble tiles
- PLANNING section: cards you cannot yet afford with exact remaining gem costs
- OPPONENT THREATS section: cards your opponent can afford or is close to buying, and nobles they are close to earning

STRATEGIC CONSIDERATIONS:
- Purchasing cards is the primary engine — each card permanently reduces future costs and may score points.
- Cheap tier-1 cards with useful bonuses build your engine early but score few points.
- Expensive tier-2/3 cards score more points but require a developed engine or many gems.
- Nobles provide 3 points each but require concentrated bonuses in specific colors.
- Reserving secures a card for later purchase and earns a gold wildcard, but uses one of your 3 reserve slots.
- Reserving can also deny your opponent a card they need.
- Gold gems are flexible but finite — they are the only way to cover gem shortfalls.
- The gem supply is shared — taking gems your opponent needs can slow them down.
- With only 4 gems per color, supply scarcity matters significantly in 2-player games.
- Balance between engine-building (bonuses), point scoring (high-tier cards + nobles), and tempo (acting before your opponent).
- Monitor your opponent's progress — if they are close to 15 points, prioritize points over long-term engine building.

RESPONSE FORMAT:
Respond with ONLY a raw JSON object. No markdown code blocks, no backticks, no explanation text.

{
  "reasoning": ["bullet 1", "bullet 2", "bullet 3"],
  "action": <one of the legal actions provided>
}

Action schemas:
- {"type":"purchaseCard","cardId":"1-K-01"} — buy a visible or reserved card by ID
- {"type":"takeGems","colors":["red","blue","green"]} — take 1-3 distinct colored gems
- {"type":"take2Gems","color":"red"} — take 2 of one color (supply must have 4+)
- {"type":"reserveCard","cardId":"1-K-01"} — reserve a visible card by ID
- {"type":"reserveCard","fromDeck":1} — reserve top card from deck tier (1/2/3)

CRITICAL: Output ONLY the JSON object. No markdown, no \`\`\`, no text before or after.`;
}

export function buildGameStatePrompt(state: GameState, aiPlayerIndex: 0 | 1 = 1): string {
  const me = state.players[aiPlayerIndex];
  const them = state.players[aiPlayerIndex === 0 ? 1 : 0];
  const myBonuses = getPlayerBonuses(me);
  const theirBonuses = getPlayerBonuses(them);
  const myLabel = `You (P${aiPlayerIndex + 1})`;
  const oppLabel = `Opponent (P${aiPlayerIndex === 0 ? 2 : 1})`;

  const serializePlayer = (p: typeof me, bonuses: typeof myBonuses, label: string) => ({
    name: label,
    pts: getPlayerPoints(p),
    gems: compactGems(p.gems),
    bonuses: compactGems(bonuses),
    reserved: p.reserved.map(c => ({
      id: c.id,
      tier: c.tier,
      pts: c.prestigePoints,
      bonus: c.gemBonus,
      cost: compactGems(c.cost),
    })),
    purchased: p.purchased.map(c => ({
      pts: c.prestigePoints,
      bonus: c.gemBonus,
    })),
  });

  const serializeCard = (c: DevelopmentCard) => ({
    id: c.id,
    pts: c.prestigePoints,
    bonus: c.gemBonus,
    cost: compactGems(c.cost),
  });

  const gameState = {
    you: serializePlayer(me, myBonuses, myLabel),
    opp: serializePlayer(them, theirBonuses, oppLabel),
    board: {
      gems: compactGems(state.board.gemSupply),
      tier1: state.board.visibleCards[0].map(serializeCard),
      tier2: state.board.visibleCards[1].map(serializeCard),
      tier3: state.board.visibleCards[2].map(serializeCard),
      deckSizes: [
        state.board.decks[0].length,
        state.board.decks[1].length,
        state.board.decks[2].length,
      ],
      nobles: state.board.nobles.map(n => ({
        id: n.id,
        pts: n.prestigePoints,
        req: compactGems(n.requirement),
      })),
    },
  };

  // Build planning section: cards not yet affordable with remaining cost
  const planning = buildPlanningSection(state, me);
  const threats = buildOpponentThreatsSection(state, them);

  return `Current game state:\n${JSON.stringify(gameState)}${planning}${threats}`;
}

function buildPlanningSection(state: GameState, player: typeof state.players[0]): string {
  const lines: string[] = ['\n\nPLANNING — cards you CANNOT yet afford (effective remaining cost after your bonuses):'];
  let count = 0;

  for (let tier = 0; tier < 3; tier++) {
    for (const card of state.board.visibleCards[tier]) {
      if (canAfford(card, player)) continue;
      const eff = getEffectiveCost(card, player);
      const stillNeed: Record<string, number> = {};
      for (const color of COLORED_GEMS) {
        const need = eff[color] ?? 0;
        const have = player.gems[color];
        if (need > have) {
          stillNeed[color] = need - have;
        }
      }
      if (Object.keys(stillNeed).length === 0) continue;
      const needStr = Object.entries(stillNeed).map(([k, v]) => `${k}:${v}`).join(', ');
      lines.push(`  ${card.id} (${card.prestigePoints}pts, bonus=${card.gemBonus}, still need: {${needStr}})`);
      count++;
    }
  }

  // Also include reserved cards that aren't affordable
  for (const card of player.reserved) {
    if (canAfford(card, player)) continue;
    const eff = getEffectiveCost(card, player);
    const stillNeed: Record<string, number> = {};
    for (const color of COLORED_GEMS) {
      const need = eff[color] ?? 0;
      const have = player.gems[color];
      if (need > have) {
        stillNeed[color] = need - have;
      }
    }
    if (Object.keys(stillNeed).length === 0) continue;
    const needStr = Object.entries(stillNeed).map(([k, v]) => `${k}:${v}`).join(', ');
    lines.push(`  ${card.id} [RESERVED] (${card.prestigePoints}pts, bonus=${card.gemBonus}, still need: {${needStr}})`);
    count++;
  }

  if (count === 0) return '';
  lines.push('TIP: Take gems matching these "still need" costs to buy these cards in upcoming turns.');
  return lines.join('\n');
}

function buildOpponentThreatsSection(state: GameState, opponent: typeof state.players[0]): string {
  const canBuy: string[] = [];
  const closeLines: string[] = [];

  const allVisible = [
    ...state.board.visibleCards[0],
    ...state.board.visibleCards[1],
    ...state.board.visibleCards[2],
  ];

  for (const card of allVisible) {
    if (canAfford(card, opponent)) {
      canBuy.push(`  ${card.id} (${card.prestigePoints}pts, bonus=${card.gemBonus})`);
    } else {
      const eff = getEffectiveCost(card, opponent);
      const stillNeed: Record<string, number> = {};
      let totalNeeded = 0;
      for (const color of COLORED_GEMS) {
        const need = eff[color] ?? 0;
        const have = opponent.gems[color];
        if (need > have) {
          stillNeed[color] = need - have;
          totalNeeded += need - have;
        }
      }
      // "Close" = needs 1-2 more gems total
      if (totalNeeded > 0 && totalNeeded <= 2) {
        const needStr = Object.entries(stillNeed).map(([k, v]) => `${k}:${v}`).join(', ');
        closeLines.push(`  ${card.id} (${card.prestigePoints}pts, bonus=${card.gemBonus}, needs: {${needStr}})`);
      }
    }
  }

  // Also check opponent's reserved cards
  for (const card of opponent.reserved) {
    if (canAfford(card, opponent)) {
      canBuy.push(`  ${card.id} [RESERVED] (${card.prestigePoints}pts, bonus=${card.gemBonus})`);
    } else {
      const eff = getEffectiveCost(card, opponent);
      const stillNeed: Record<string, number> = {};
      let totalNeeded = 0;
      for (const color of COLORED_GEMS) {
        const need = eff[color] ?? 0;
        const have = opponent.gems[color];
        if (need > have) {
          stillNeed[color] = need - have;
          totalNeeded += need - have;
        }
      }
      if (totalNeeded > 0 && totalNeeded <= 2) {
        const needStr = Object.entries(stillNeed).map(([k, v]) => `${k}:${v}`).join(', ');
        closeLines.push(`  ${card.id} [RESERVED] (${card.prestigePoints}pts, bonus=${card.gemBonus}, needs: {${needStr}})`);
      }
    }
  }

  // Check which nobles the opponent is close to
  const nobleThreats: string[] = [];
  for (const noble of state.board.nobles) {
    const oppBonuses = getPlayerBonuses(opponent);
    let totalMissing = 0;
    const missing: Record<string, number> = {};
    for (const [color, required] of Object.entries(noble.requirement)) {
      const have = oppBonuses[color as keyof typeof oppBonuses] ?? 0;
      if (required && have < required) {
        missing[color] = required - have;
        totalMissing += required - have;
      }
    }
    if (totalMissing <= 2) {
      const label = totalMissing === 0 ? 'QUALIFIES NOW' : `needs: {${Object.entries(missing).map(([k, v]) => `${k}:${v}`).join(', ')}}`;
      nobleThreats.push(`  ${noble.id} (${noble.prestigePoints}pts, ${label})`);
    }
  }

  if (canBuy.length === 0 && closeLines.length === 0 && nobleThreats.length === 0) return '';

  const lines: string[] = ['\n\nOPPONENT THREATS — what your opponent can do:'];
  if (canBuy.length > 0) {
    lines.push('Cards opponent CAN AFFORD right now (consider reserving high-value ones to block):');
    lines.push(...canBuy);
  }
  if (closeLines.length > 0) {
    lines.push('Cards opponent is CLOSE to buying (1-2 gems away):');
    lines.push(...closeLines);
  }
  if (nobleThreats.length > 0) {
    lines.push('Nobles opponent is close to earning (0-2 bonuses away):');
    lines.push(...nobleThreats);
  }
  const oppPts = getPlayerPoints(opponent);
  if (oppPts >= 12) {
    lines.push(`WARNING: Opponent has ${oppPts} points — they are close to winning! Prioritize points over engine-building.`);
  }
  return lines.join('\n');
}

export function buildLegalMovesPrompt(actions: Action[]): string {
  const takeGems: string[] = [];
  const take2: string[] = [];
  const reserve: string[] = [];
  const reserveDeck: string[] = [];
  const purchase: string[] = [];

  for (const a of actions) {
    switch (a.type) {
      case 'takeGems':
        takeGems.push(a.colors.join(','));
        break;
      case 'take2Gems':
        take2.push(a.color);
        break;
      case 'reserveCard':
        if ('fromDeck' in a.source) {
          reserveDeck.push(`tier ${a.source.fromDeck}`);
        } else {
          reserve.push(a.source.id);
        }
        break;
      case 'purchaseCard': {
        const c = a.card;
        const costStr = Object.entries(c.cost)
          .filter(([, v]) => v && v > 0)
          .map(([k, v]) => `${k}:${v}`)
          .join(', ');
        purchase.push(`${c.id} (${c.prestigePoints}pts, bonus=${c.gemBonus}, cost={${costStr}})`);
        break;
      }
    }
  }

  const lines: string[] = ['Legal moves:'];

  if (purchase.length > 0) {
    lines.push(`Purchase — YOU CAN AFFORD these cards (buy one with {"type":"purchaseCard","cardId":"<id>"}):`);
    for (const p of purchase) {
      lines.push(`  ${p}`);
    }
  }
  if (takeGems.length > 0) {
    lines.push(`Take 3 gems — combos: ${takeGems.join(' | ')}`);
  }
  if (take2.length > 0) {
    lines.push(`Take 2 gems — colors: ${take2.join(', ')}`);
  }
  if (reserve.length > 0) {
    lines.push(`Reserve visible — cards: ${reserve.join(', ')}`);
  }
  if (reserveDeck.length > 0) {
    lines.push(`Reserve from deck — ${reserveDeck.join(', ')}`);
  }

  return lines.join('\n');
}

export function buildDiscardPrompt(
  playerGems: Record<GemColor, number>,
  excessCount: number,
): string {
  // Show gems with full color names so the AI uses them in the response
  const gemsList = Object.entries(playerGems)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return `You have too many gems (max 10). Current gems: {${gemsList}}
You must discard exactly ${excessCount} gem(s).

Respond with ONLY a JSON object (no markdown, no explanation):
{"reasoning":["why you chose these gems to discard"],"action":{"type":"discardGems","gems":{"<color>":<count>}}}

Example: {"reasoning":["Discard excess red"],"action":{"type":"discardGems","gems":{"red":2}}}

Use FULL color names: white, blue, green, red, black, gold.`;
}

export function buildNobleSelectionPrompt(nobles: NobleTile[]): string {
  const listed = nobles.map(n => `${n.id} (${n.prestigePoints}pts)`).join(', ');
  return `You qualify for multiple nobles. Choose one: ${listed}

Respond with ONLY a JSON object (no markdown, no explanation):
{"reasoning":["why you chose this noble"],"action":{"type":"selectNoble","nobleId":"<id>"}}

Example: {"reasoning":["Higher point value"],"action":{"type":"selectNoble","nobleId":"N-01"}}`;
}

// ── Response Parsing ────────────────────────────────────────

export function parseAiResponse(
  responseText: string,
  legalActions: Action[],
): AiResponse {
  let parsed: { reasoning?: string[]; action?: AiAction };

  try {
    // Try to extract JSON from the response (handle markdown code blocks)
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      responseText.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : responseText.trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      reasoning: ['AI returned malformed JSON — using fallback move.'],
      action: legalActionToAiAction(legalActions[0]),
    };
  }

  const reasoning = Array.isArray(parsed.reasoning)
    ? parsed.reasoning.map(String).slice(0, 5)
    : ['No reasoning provided.'];

  if (!parsed.action || !parsed.action.type) {
    return {
      reasoning: [...reasoning, 'AI returned no action — using fallback move.'],
      action: legalActionToAiAction(legalActions[0]),
    };
  }

  // Validate the action is legal
  if (isActionLegal(parsed.action, legalActions)) {
    return { reasoning, action: parsed.action };
  }

  return {
    reasoning: [...reasoning, 'AI chose an illegal move — using fallback.'],
    action: legalActionToAiAction(legalActions[0]),
  };
}

function legalActionToAiAction(action: Action): AiAction {
  switch (action.type) {
    case 'takeGems':
      return { type: 'takeGems', colors: action.colors };
    case 'take2Gems':
      return { type: 'take2Gems', color: action.color };
    case 'purchaseCard':
      return { type: 'purchaseCard', cardId: action.card.id };
    case 'reserveCard':
      if ('fromDeck' in action.source) {
        return { type: 'reserveCard', fromDeck: action.source.fromDeck };
      }
      return { type: 'reserveCard', cardId: action.source.id };
    case 'discardGems':
      return { type: 'discardGems', gems: action.gems as Partial<Record<GemColor, number>> };
    case 'selectNoble':
      return { type: 'selectNoble', nobleId: action.noble.id };
  }
}

function isActionLegal(aiAction: AiAction, legalActions: Action[]): boolean {
  for (const legal of legalActions) {
    if (aiAction.type !== legal.type) continue;

    switch (aiAction.type) {
      case 'takeGems':
        if (legal.type === 'takeGems') {
          const aiSorted = [...aiAction.colors].sort();
          const legalSorted = [...legal.colors].sort();
          if (aiSorted.length === legalSorted.length &&
              aiSorted.every((c, i) => c === legalSorted[i])) {
            return true;
          }
        }
        break;
      case 'take2Gems':
        if (legal.type === 'take2Gems' && aiAction.color === legal.color) {
          return true;
        }
        break;
      case 'purchaseCard':
        if (legal.type === 'purchaseCard' && aiAction.cardId === legal.card.id) {
          return true;
        }
        break;
      case 'reserveCard':
        if (legal.type === 'reserveCard') {
          if ('cardId' in aiAction && !('fromDeck' in aiAction) &&
              !('fromDeck' in legal.source) && aiAction.cardId === legal.source.id) {
            return true;
          }
          if ('fromDeck' in aiAction && 'fromDeck' in legal.source &&
              aiAction.fromDeck === legal.source.fromDeck) {
            return true;
          }
        }
        break;
    }
  }
  return false;
}

// ── API Calls ───────────────────────────────────────────────

function buildMessages(systemPrompt: string, userPrompt: string, config: AiConfig) {
  if (config.provider === 'anthropic') {
    return {
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    };
  }
  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
}

async function callAiProxy(
  config: AiConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const body = {
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    ...buildMessages(systemPrompt, userPrompt, config),
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`AI API error (${res.status}): ${errText}`);
  }

  const data = await res.json();

  // Extract text from provider-specific response formats
  if (config.provider === 'anthropic') {
    // Anthropic: { content: [{ type: "text", text: "..." }] }
    return data.content?.[0]?.text ?? JSON.stringify(data);
  }
  if (config.provider === 'gemini') {
    // Gemini thinking models may return multiple parts: thought parts (thought:true)
    // followed by the actual answer. Find the last non-thought text part.
    const parts = data.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].text && !parts[i].thought) return parts[i].text;
      }
      // Fallback: return any text part
      for (const p of parts) {
        if (p.text) return p.text;
      }
    }
    return JSON.stringify(data);
  }
  // OpenAI / OpenRouter / custom: { choices: [{ message: { content: "..." } }] }
  return data.choices?.[0]?.message?.content ?? JSON.stringify(data);
}

export async function getAiMove(
  state: GameState,
  legalActions: Action[],
  config: AiConfig,
  aiPlayerIndex: 0 | 1 = 1,
): Promise<AiMoveResult> {
  const systemPrompt = buildSystemPrompt(aiPlayerIndex);
  const userPrompt = buildGameStatePrompt(state, aiPlayerIndex) + '\n\n' + buildLegalMovesPrompt(legalActions);

  const start = Date.now();
  const responseText = await callAiProxy(config, systemPrompt, userPrompt);
  const responseTimeMs = Date.now() - start;

  return { ...parseAiResponse(responseText, legalActions), responseTimeMs };
}

export async function getAiDiscardDecision(
  playerGems: Record<GemColor, number>,
  excessCount: number,
  config: AiConfig,
  aiPlayerIndex: 0 | 1 = 1,
): Promise<AiMoveResult> {
  const systemPrompt = buildSystemPrompt(aiPlayerIndex);
  const userPrompt = buildDiscardPrompt(playerGems, excessCount);

  const start = Date.now();
  const responseText = await callAiProxy(config, systemPrompt, userPrompt);
  const responseTimeMs = Date.now() - start;

  let parsed: { reasoning?: string[]; action?: AiAction };
  try {
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      responseText.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : responseText.trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    // Fallback: discard evenly from highest counts
    return {
      reasoning: ['AI returned malformed JSON for discard — using fallback.'],
      action: buildFallbackDiscard(playerGems, excessCount),
      responseTimeMs,
    };
  }

  const reasoning = Array.isArray(parsed.reasoning)
    ? parsed.reasoning.map(String).slice(0, 5)
    : ['No reasoning provided.'];

  if (parsed.action?.type === 'discardGems' && parsed.action.gems) {
    return { reasoning, action: parsed.action, responseTimeMs };
  }

  return {
    reasoning: [...reasoning, 'Invalid discard action — using fallback.'],
    action: buildFallbackDiscard(playerGems, excessCount),
    responseTimeMs,
  };
}

function buildFallbackDiscard(
  playerGems: Record<GemColor, number>,
  excessCount: number,
): AiAction {
  const gems: Partial<Record<GemColor, number>> = {};
  const colors = ([...COLORED_GEMS, 'gold'] as GemColor[])
    .filter(c => playerGems[c] > 0)
    .sort((a, b) => playerGems[b] - playerGems[a]);

  let remaining = excessCount;
  for (const color of colors) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, playerGems[color]);
    if (take > 0) {
      gems[color] = take;
      remaining -= take;
    }
  }

  return { type: 'discardGems', gems };
}

export async function getAiNobleSelection(
  nobles: NobleTile[],
  config: AiConfig,
  aiPlayerIndex: 0 | 1 = 1,
): Promise<AiMoveResult> {
  const systemPrompt = buildSystemPrompt(aiPlayerIndex);
  const userPrompt = buildNobleSelectionPrompt(nobles);

  const start = Date.now();
  const responseText = await callAiProxy(config, systemPrompt, userPrompt);
  const responseTimeMs = Date.now() - start;

  let parsed: { reasoning?: string[]; action?: AiAction };
  try {
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      responseText.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : responseText.trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      reasoning: ['AI returned malformed JSON for noble selection — picking first.'],
      action: { type: 'selectNoble', nobleId: nobles[0].id },
      responseTimeMs,
    };
  }

  const reasoning = Array.isArray(parsed.reasoning)
    ? parsed.reasoning.map(String).slice(0, 5)
    : ['No reasoning provided.'];

  if (parsed.action?.type === 'selectNoble' && parsed.action.nobleId) {
    const valid = nobles.some(n => n.id === (parsed.action as { type: 'selectNoble'; nobleId: string }).nobleId);
    if (valid) {
      return { reasoning, action: parsed.action, responseTimeMs };
    }
  }

  return {
    reasoning: [...reasoning, 'Invalid noble selection — picking first eligible.'],
    action: { type: 'selectNoble', nobleId: nobles[0].id },
    responseTimeMs,
  };
}
