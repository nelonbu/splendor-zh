import type { CardTier, ColoredGem, GemColor } from '../game/types';
import type { LastMove } from '../store/gameStore';

/** Local two-player UI copy. Internal IDs, actions and state values stay in English. */
export const gemNames: Record<GemColor, string> = {
  white: '白色', blue: '蓝色', green: '绿色', red: '红色', black: '黑色', gold: '黄金',
};

export const gemShortNames: Record<GemColor, string> = {
  white: '白', blue: '蓝', green: '绿', red: '红', black: '黑', gold: '金',
};

export const copy = {
  title: '璀璨宝石',
  quitGame: '退出对局',
  localPlayers: '双人同机',
  howToPlay: '玩法说明',
  playerOneName: '玩家一名称',
  playerTwoName: '玩家二名称',
  defaultPlayerOne: '玩家一',
  defaultPlayerTwo: '玩家二',
  startGame: '开始游戏',
  buy: '购买',
  reserve: '预留',
  gemSupply: '宝石供应',
  nobles: '贵族',
  cancel: '取消',
  gems: '宝石',
  purchased: '已购买',
  reserved: '已预留',
  lastMove: '上一步',
  undoTurn: '撤回',
  discardGems: '弃置宝石',
  undo: '撤销',
  nobleVisit: '贵族到访',
  chooseNoble: '选择贵族',
  qualifiesNoble: '你已满足贵族的到访条件！',
  playAgain: '再玩一局',
  downloadLog: '下载对局记录',
  reviewEvaluation: '查看对局评估',
  closeRules: '关闭玩法说明',
  sampleBanner: '素材测试局：一级蓝卡可购买、白卡可预留；刷新页面可重置。',
  rules: {
    title: '璀璨宝石玩法说明',
    objectiveTitle: '目标',
    objective: '率先获得 15 点声望。声望来自购买的发展卡和获得的贵族。',
    componentsTitle: '游戏内容',
    gemImage: '宝石筹码示意图',
    cardImage: '发展卡示意图',
    gemTokens: '宝石筹码',
    developmentCards: '发展卡',
    components: [
      '宝石筹码：白、蓝、绿、红、黑五种颜色，以及可代替任意颜色的黄金。',
      '发展卡：共 90 张，分为三个等级。每张卡提供永久加成，部分卡还提供声望点。',
      '贵族：场上有 3 位。满足其发展卡加成要求后，贵族会到访。',
    ],
    actionsTitle: '你的回合：选择一项行动',
    actions: [
      '拿取 3 枚不同颜色的宝石：每种颜色各 1 枚，供应区至少需要有 3 种可拿取的颜色。',
      '拿取 2 枚同色宝石：只有该颜色在拿取前至少剩余 4 枚时才能这样做。',
      '预留发展卡：从场上或任一等级牌堆顶预留 1 张，并获得 1 枚黄金；最多预留 3 张。',
      '购买发展卡：购买场上或自己预留的发展卡。用宝石筹码和发展卡加成支付费用，黄金可代替任意颜色。',
    ],
    bonusesTitle: '发展卡加成',
    bonuses: '每张已购买的发展卡都会永久减免其颜色的 1 枚宝石费用。加成可以叠加；例如 3 张红色加成卡可为之后每次购买减免 3 枚红色宝石。',
    noblesTitle: '贵族到访',
    nobles: '回合结束时，若已购买发展卡的加成满足贵族要求，该贵族会到访并提供 3 点声望。如果同时满足多位贵族，可选择其中一位。',
    limitTitle: '宝石上限',
    limit: '手中最多保留 10 枚宝石筹码。拿取后若超过 10 枚，必须立即弃置到 10 枚。',
    endTitle: '对局结束',
    end: '任一玩家达到至少 15 点声望后，完成当前轮，让双方行动次数相同。声望较高者获胜；同分时，已购买发展卡较少者获胜；若仍相同，玩家二获胜。',
  },
} as const;

export function tierName(tier: CardTier): string {
  return `${['', '一级', '二级', '三级'][tier]}牌堆`;
}

export const undoTurnAria = (name: string) => `撤回${name}的上一步操作`;

export function turnMessage(name: string, pendingDiscard: boolean, pendingNobles: boolean, finalRound: boolean): string {
  let message = `轮到${name}`;
  if (pendingDiscard) message += ' — 请弃置宝石';
  else if (pendingNobles) message += ' — 请选择贵族';
  if (finalRound) message += '（最后一轮）';
  return message;
}

export function takeGemsLabel(colors: ColoredGem[]): string {
  if (colors.length === 2 && colors[0] === colors[1]) return `拿取 2 枚${gemNames[colors[0]]}宝石`;
  return `拿取 ${colors.length} 枚宝石`;
}

export function formatLastMove(move: LastMove): string {
  switch (move.type) {
    case 'takeGems': {
      const counts: Partial<Record<ColoredGem, number>> = {};
      for (const color of move.colors) counts[color] = (counts[color] ?? 0) + 1;
      return `拿取 ${Object.entries(counts).map(([color, count]) => `${count} 枚${gemNames[color as ColoredGem]}宝石`).join('、')}`;
    }
    case 'take2Gems':
      return `拿取 2 枚${gemNames[move.color]}宝石`;
    case 'reserveCard':
      return move.cardId
        ? `预留${gemNames[move.gemBonus]}发展卡${move.prestigePoints ? `（${move.prestigePoints} 点）` : ''}`
        : '从牌堆预留发展卡';
    case 'purchaseCard': {
      const cost = (Object.entries(move.cost) as [ColoredGem, number][])
        .filter(([, count]) => count > 0)
        .map(([color, count]) => `${count} 枚${gemNames[color]}宝石`);
      return `购买${gemNames[move.gemBonus]}发展卡（${move.prestigePoints} 点），标价：${cost.join('、') || '免费'}`;
    }
  }
}

export const pointsLabel = (points: number) => `${points} 点声望`;
export const compactPoints = (points: number) => `${points}点`;
export const playerPointsLabel = (points: number) => `（${pointsLabel(points)}）`;
export const winnerLabel = (name: string) => `${name}获胜！`;
export const discardInstruction = (count: number, limit: number) => `你有 ${count} 枚宝石，请弃置到 ${limit} 枚。`;
export const discardConfirm = (count: number) => `确认弃置（${count} 枚）`;
export const nobleChoosing = (name: string) => `${name}正在选择贵族…`;
export const deckAria = (tier: CardTier, count: number) => `${tierName(tier)}，剩余 ${count} 张；预留牌堆顶卡牌`;
export const supplyGemAria = (color: GemColor, count: number) => `${gemNames[color]}宝石，剩余 ${count} 枚${color === 'gold' ? '，不能直接拿取' : ''}`;
export const playerGemAria = (color: GemColor, count: number) => `${gemNames[color]}宝石：${count} 枚`;
export const bonusAria = (color: ColoredGem, count?: number) => `${gemNames[color]}永久加成${count === undefined ? '' : `：${count}`}`;
export const costAria = (color: ColoredGem, count: number) => `费用：${count} 枚${gemNames[color]}宝石`;
export const requirementAria = (color: ColoredGem, count: number) => `需要 ${count} 个${gemNames[color]}永久加成`;
export const cardActionAria = (action: 'buy' | 'reserve', color: ColoredGem, points: number) => `${action === 'buy' ? copy.buy : copy.reserve}${gemNames[color]}发展卡，${pointsLabel(points)}`;
export const nobleChoiceAria = (points: number) => `选择贵族，${pointsLabel(points)}`;
export const discardGemAria = (color: GemColor, count: number) => `弃置 1 枚${gemNames[color]}宝石，当前选择弃置 ${count} 枚`;
export const undoDiscardAria = (color: GemColor) => `撤销弃置 1 枚${gemNames[color]}宝石`;
