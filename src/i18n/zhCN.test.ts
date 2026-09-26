import { describe, expect, it } from 'vitest';
import { cardActionAria, deckAria, discardConfirm, formatLastMove, gemShortNames, takeGemsLabel, turnMessage } from './zhCN';

describe('local Chinese game messages', () => {
  it('keeps all six gem labels distinct and localizes action prompts', () => {
    expect(new Set(Object.values(gemShortNames)).size).toBe(6);
    expect(deckAria(3, 16)).toBe('三级牌堆，剩余 16 张；预留牌堆顶卡牌');
    expect(cardActionAria('reserve', 'blue', 2)).toBe('预留蓝色发展卡，2 点声望');
    expect(takeGemsLabel(['blue', 'blue'])).toBe('拿取 2 枚蓝色宝石');
    expect(takeGemsLabel(['white', 'red', 'black'])).toBe('拿取 3 枚宝石');
    expect(discardConfirm(2)).toBe('确认弃置（2 枚）');
  });

  it('reports turn subphases and every last-move type without exposing color enums', () => {
    expect(turnMessage('玩家一', true, false, true)).toBe('轮到玩家一 — 请弃置宝石（最后一轮）');
    expect(turnMessage('玩家二', false, true, false)).toBe('轮到玩家二 — 请选择贵族');
    expect(formatLastMove({ type: 'takeGems', colors: ['white', 'blue', 'white'] })).toBe('拿取 2 枚白色宝石、1 枚蓝色宝石');
    expect(formatLastMove({ type: 'take2Gems', color: 'black' })).toBe('拿取 2 枚黑色宝石');
    expect(formatLastMove({ type: 'reserveCard', gemBonus: 'red', prestigePoints: 1 })).toBe('从牌堆预留发展卡');
    expect(formatLastMove({ type: 'reserveCard', cardId: '1-U-01', gemBonus: 'blue', prestigePoints: 0 })).toBe('预留蓝色发展卡');
    expect(formatLastMove({ type: 'purchaseCard', cardId: '1-U-01', gemBonus: 'blue', prestigePoints: 1, cost: { white: 2, red: 1 } })).toBe('购买蓝色发展卡（1 点），标价：2 枚白色宝石、1 枚红色宝石');
  });
});
