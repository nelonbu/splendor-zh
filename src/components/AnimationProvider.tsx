import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, type LastMove } from '../store/gameStore';
import type { GemColor, DevelopmentCard, CardTier } from '../game/types';
import CardFace from './CardFace';
import GemArt from './GemArt';
import AssetImage from './AssetImage';
import { deckArt } from './gameArt.generated';
import { compactPoints, copy } from '../i18n/zhCN';

/** Phases: 'highlight' → golden glow at source, then 'fly' → move to destination */
type FlyPhase = 'highlight' | 'fly';

interface FlyingItem {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  type: 'gem' | 'card';
  label?: string;
  phase: FlyPhase;
  /** Full card dimensions from the source element (cards only) */
  cardWidth?: number;
  cardHeight?: number;
  /** Cached card data for rendering full card content in overlay */
  cardData?: DevelopmentCard;
  /** Blind reservation keeps its tier back in flight, never its card face. */
  deckTier?: CardTier;
}

interface AnimationContextValue {
  registerGemSource: (color: GemColor, el: HTMLElement | null) => void;
  registerCardSource: (cardId: string, el: HTMLElement | null, cardData?: DevelopmentCard) => void;
  /** Gems currently animating toward a player — key: `${playerIndex}-${color}`, value: count */
  inFlightGems: Map<string, number>;
  /** Card IDs that should be hidden (invisible placeholder) until fly animation completes */
  suppressedCardIds: Set<string>;
}

const AnimationContext = createContext<AnimationContextValue>({
  registerGemSource: () => {},
  registerCardSource: () => {},
  inFlightGems: new Map(),
  suppressedCardIds: new Set(),
});

export const useAnimation = () => useContext(AnimationContext);

let nextId = 0;

const HIGHLIGHT_DURATION_NORMAL = 550; // ms golden glow before flying
const FLY_DURATION_NORMAL = 0.7; // seconds for the fly animation
const GEM_STAGGER_NORMAL = 100; // ms between each gem starting its highlight

const HIGHLIGHT_DURATION_FAST = 400; // ms — shortened for AI vs AI
const FLY_DURATION_FAST = 0.4; // seconds — shortened for AI vs AI
const GEM_STAGGER_FAST = 80; // ms — shortened for AI vs AI

export default function AnimationProvider({ children }: { children: React.ReactNode }) {
  const aiVsAiMode = useGameStore(s => s.aiVsAiMode);
  const highlightDuration = aiVsAiMode ? HIGHLIGHT_DURATION_FAST : HIGHLIGHT_DURATION_NORMAL;
  const flyDuration = aiVsAiMode ? FLY_DURATION_FAST : FLY_DURATION_NORMAL;
  const flyDurationMs = flyDuration * 1000 + 200;
  const gemStagger = aiVsAiMode ? GEM_STAGGER_FAST : GEM_STAGGER_NORMAL;

  // Refs so the subscription closure always gets current timing values
  const timingRef = useRef({ highlightDuration, flyDuration, flyDurationMs, gemStagger });
  timingRef.current = { highlightDuration, flyDuration, flyDurationMs, gemStagger };

  const [flyingItems, setFlyingItems] = useState<FlyingItem[]>([]);
  const [inFlightGems, setInFlightGems] = useState<Map<string, number>>(new Map());
  const [suppressedCardIds, setSuppressedCardIds] = useState<Set<string>>(new Set());

  const gemSourceRefs = useRef<Map<string, HTMLElement>>(new Map());
  const cardSourceRefs = useRef<Map<string, HTMLElement>>(new Map());
  const cardPositionCache = useRef<Map<string, DOMRect>>(new Map());
  const cardDataCache = useRef<Map<string, DevelopmentCard>>(new Map());
  const prevLastMovesRef = useRef<[LastMove | null, LastMove | null]>([null, null]);
  const prevUndoRevisionRef = useRef(useGameStore.getState().undoRevision);
  const prevVisibleCardIdsRef = useRef<Set<string>>(new Set());
  /** Callbacks invoked when a flying item's fly phase completes */
  const flyCompleteCallbacks = useRef<Map<number, () => void>>(new Map());
  /** Track which items have already been removed (prevent double-cleanup) */
  const removedIds = useRef<Set<number>>(new Set());
  const scheduledTimeouts = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const scheduleTimeout = useCallback((callback: () => void, delay: number) => {
    const timeout = setTimeout(() => {
      scheduledTimeouts.current.delete(timeout);
      callback();
    }, delay);
    scheduledTimeouts.current.add(timeout);
  }, []);

  const clearScheduledTimeouts = useCallback(() => {
    scheduledTimeouts.current.forEach(clearTimeout);
    scheduledTimeouts.current.clear();
  }, []);

  useEffect(() => clearScheduledTimeouts, [clearScheduledTimeouts]);

  const registerGemSource = useCallback((color: GemColor, el: HTMLElement | null) => {
    if (el) gemSourceRefs.current.set(color, el);
    else gemSourceRefs.current.delete(color);
  }, []);

  const registerCardSource = useCallback((cardId: string, el: HTMLElement | null, cardData?: DevelopmentCard) => {
    if (el) {
      cardSourceRefs.current.set(cardId, el);
      cardPositionCache.current.set(cardId, el.getBoundingClientRect());
      if (cardData) cardDataCache.current.set(cardId, cardData);
    } else {
      cardSourceRefs.current.delete(cardId);
      // Keep cached position & data — we need them after the element is removed
    }
  }, []);

  // Periodically refresh card position cache for registered cards
  useEffect(() => {
    const interval = setInterval(() => {
      cardSourceRefs.current.forEach((el, cardId) => {
        if (el.isConnected) {
          cardPositionCache.current.set(cardId, el.getBoundingClientRect());
        }
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Initialize previous visible card IDs
  useEffect(() => {
    const state = useGameStore.getState();
    prevVisibleCardIdsRef.current = new Set(state.board.visibleCards.flat().map(c => c.id));
  }, []);

  const addFlyingItems = useCallback((items: Omit<FlyingItem, 'id'>[]) => {
    const newItems = items.map(item => ({ ...item, id: nextId++ }));
    setFlyingItems(prev => [...prev, ...newItems]);
    return newItems.map(i => i.id);
  }, []);

  const removeFlyingItem = useCallback((id: number) => {
    // Prevent double-removal (onAnimationComplete + timeout fallback can race)
    if (removedIds.current.has(id)) return;
    removedIds.current.add(id);
    // Clean up after a delay to prevent unbounded growth
    scheduleTimeout(() => removedIds.current.delete(id), 5000);

    // Fire the fly-complete callback (e.g. decrement in-flight gems, unsuppress cards)
    flyCompleteCallbacks.current.get(id)?.();
    flyCompleteCallbacks.current.delete(id);
    setFlyingItems(prev => prev.filter(item => item.id !== id));
  }, [scheduleTimeout]);

  const transitionToFly = useCallback((id: number) => {
    setFlyingItems(prev => prev.map(item =>
      item.id === id ? { ...item, phase: 'fly' } : item
    ));
  }, []);

  // Watch lastMoves for state changes and trigger animations
  useEffect(() => {
    const unsub = useGameStore.subscribe((state) => {
      const [prev0, prev1] = prevLastMovesRef.current;
      const [cur0, cur1] = state.lastMoves;
      const currentCardIds = new Set(state.board.visibleCards.flat().map(c => c.id));

      if (state.undoRevision !== prevUndoRevisionRef.current) {
        prevUndoRevisionRef.current = state.undoRevision;
        clearScheduledTimeouts();
        flyCompleteCallbacks.current.clear();
        removedIds.current.clear();
        setFlyingItems([]);
        setInFlightGems(new Map());
        setSuppressedCardIds(new Set());
        prevLastMovesRef.current = [cur0, cur1];
        prevVisibleCardIdsRef.current = currentCardIds;
        return;
      }

      const moved0 = cur0 && cur0 !== prev0;
      const moved1 = cur1 && cur1 !== prev1;

      // Only animate if exactly one player moved (prevents old moves from replaying).
      // In online mode, the server broadcasts the full lastMoves array which can contain
      // both players' moves, but only one is new per turn. This ensures we don't replay
      // the opponent's previous move when receiving our own move confirmation.
      if (moved0 && !moved1) {
        triggerAnimationsForMove(cur0, 0, currentCardIds);
      } else if (moved1 && !moved0) {
        triggerAnimationsForMove(cur1, 1, currentCardIds);
      } else if (moved0 && moved1) {
        // Both changed at once (e.g. online mode initial sync) — animate whichever is the current player
        const cp = state.currentPlayerIndex === 0 ? 1 : 0; // just moved = previous player
        if (cp === 0) triggerAnimationsForMove(cur0, 0, currentCardIds);
        else triggerAnimationsForMove(cur1, 1, currentCardIds);
      }

      prevLastMovesRef.current = [cur0, cur1];
      prevVisibleCardIdsRef.current = currentCardIds;
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function triggerAnimationsForMove(move: LastMove, playerIndex: 0 | 1, currentCardIds: Set<string>) {
    const items: Omit<FlyingItem, 'id'>[] = [];
    // Track gem keys that will be in-flight (one entry per flying item)
    const gemKeys: string[] = [];
    // Card IDs that are new (replacement cards) — captured once before prevVisibleCardIdsRef updates
    let newCardIdsToUnsuppress: string[] = [];

    if (move.type === 'takeGems') {
      for (const color of move.colors) {
        const sourceEl = gemSourceRefs.current.get(color);
        const destEl = document.querySelector(`[data-player="${playerIndex}"][data-gem-dest="${color}"]`);
        if (sourceEl && destEl) {
          const from = sourceEl.getBoundingClientRect();
          const to = destEl.getBoundingClientRect();
          items.push({
            fromX: from.left + from.width / 2,
            fromY: from.top + from.height / 2,
            toX: to.left + to.width / 2,
            toY: to.top + to.height / 2,
            color,
            type: 'gem',
            phase: 'highlight',
          });
          gemKeys.push(`${playerIndex}-${color}`);
        }
      }
    } else if (move.type === 'take2Gems') {
      const sourceEl = gemSourceRefs.current.get(move.color);
      const destEl = document.querySelector(`[data-player="${playerIndex}"][data-gem-dest="${move.color}"]`);
      if (sourceEl && destEl) {
        const from = sourceEl.getBoundingClientRect();
        const to = destEl.getBoundingClientRect();
        for (let i = 0; i < 2; i++) {
          items.push({
            fromX: from.left + from.width / 2 + (i === 0 ? -8 : 8),
            fromY: from.top + from.height / 2,
            toX: to.left + to.width / 2,
            toY: to.top + to.height / 2,
            color: move.color,
            type: 'gem',
            phase: 'highlight',
          });
          gemKeys.push(`${playerIndex}-${move.color}`);
        }
      }
    } else if (move.type === 'purchaseCard' || move.type === 'reserveCard') {
      const cardId = move.cardId;
      let from: DOMRect | undefined;

      if (cardId) {
        // Read the live source on the action itself so zoom/resize cannot leave a stale 500ms cache.
        const sourceEl = cardSourceRefs.current.get(cardId);
        from = sourceEl?.isConnected ? sourceEl.getBoundingClientRect() : cardPositionCache.current.get(cardId);
      }
      if (!from) {
        const boardMain = document.querySelector('.board-main');
        if (boardMain) {
          const rect = boardMain.getBoundingClientRect();
          from = new DOMRect(rect.left + rect.width / 2 - 30, rect.top + rect.height / 2 - 35, 60, 70);
        }
      }

      const destEl = document.querySelector(`[data-player="${playerIndex}"]`);
      if (from && destEl) {
        const to = destEl.getBoundingClientRect();
        items.push({
          fromX: from.left + from.width / 2,
          fromY: from.top + from.height / 2,
          toX: to.left + to.width / 2,
          toY: to.top + to.height / 2,
          color: move.gemBonus,
          type: 'card',
          label: move.type === 'purchaseCard'
            ? compactPoints(move.prestigePoints)
            : copy.reserve,
          phase: 'highlight',
          cardWidth: from.width,
          cardHeight: from.height,
          cardData: cardId ? cardDataCache.current.get(cardId) : undefined,
          deckTier: move.type === 'reserveCard' && !cardId
            ? useGameStore.getState().players[playerIndex].reserved.slice(-1)[0]?.tier
            : undefined,
        });
      }

      // Detect new cards that replaced the purchased/reserved one — suppress until animation ends
      newCardIdsToUnsuppress = [...currentCardIds].filter(id => !prevVisibleCardIdsRef.current.has(id));
      if (newCardIdsToUnsuppress.length > 0) {
        setSuppressedCardIds(prev => {
          const next = new Set(prev);
          newCardIdsToUnsuppress.forEach(id => next.add(id));
          return next;
        });
      }
    }

    // Mark gems as in-flight immediately (before staggered timeouts)
    if (gemKeys.length > 0) {
      setInFlightGems(prev => {
        const next = new Map(prev);
        for (const key of gemKeys) {
          next.set(key, (next.get(key) ?? 0) + 1);
        }
        return next;
      });
    }

    if (items.length > 0) {
      const { highlightDuration: hl, flyDurationMs: fdMs, gemStagger: gs } = timingRef.current;
      items.forEach((item, i) => {
        scheduleTimeout(() => {
          const ids = addFlyingItems([item]);

          // Register fly-complete callbacks
          ids.forEach(id => {
            if (item.type === 'gem') {
              const key = gemKeys[i];
              flyCompleteCallbacks.current.set(id, () => {
                setInFlightGems(prev => {
                  const next = new Map(prev);
                  const count = (next.get(key) ?? 1) - 1;
                  if (count <= 0) next.delete(key);
                  else next.set(key, count);
                  return next;
                });
              });
            } else if (item.type === 'card') {
              // Use pre-captured newCardIdsToUnsuppress — prevVisibleCardIdsRef is already stale by now
              flyCompleteCallbacks.current.set(id, () => {
                if (newCardIdsToUnsuppress.length > 0) {
                  setSuppressedCardIds(prev => {
                    const next = new Set(prev);
                    newCardIdsToUnsuppress.forEach(cid => next.delete(cid));
                    return next;
                  });
                }
              });
            }
          });

          // After highlight duration, transition to fly phase and schedule cleanup
          scheduleTimeout(() => {
            ids.forEach(id => {
              transitionToFly(id);
              // Timeout fallback: remove item after fly duration even if onAnimationComplete doesn't fire
              scheduleTimeout(() => removeFlyingItem(id), fdMs);
            });
          }, hl);
        }, i * gs);
      });
    }
  }

  return (
    <AnimationContext.Provider value={{ registerGemSource, registerCardSource, inFlightGems, suppressedCardIds }}>
      {children}
      {/* Flying items overlay */}
      <div className="fly-overlay">
        <AnimatePresence>
          {flyingItems.map(item => {
            const isCard = item.type === 'card';
            const cardStyle = isCard && item.cardWidth
              ? { width: item.cardWidth, height: item.cardHeight, borderRadius: 10 }
              : undefined;

            return item.phase === 'highlight' ? (
              <motion.div
                key={`h-${item.id}`}
                className={
                  isCard && item.cardData
                    ? `flying-item flying-card card card-color-${item.color} flying-highlight`
                    : isCard && item.deckTier
                      ? 'flying-item flying-card deck-flight flying-highlight'
                      : `flying-item flying-${item.type} gem-${item.color} flying-highlight`
                }
                style={cardStyle}
                initial={{
                  left: item.fromX,
                  top: item.fromY,
                  scale: 1,
                  opacity: 1,
                  x: '-50%',
                  y: '-50%',
                }}
                animate={{
                  scale: isCard
                    ? [1, 1.02, 1, 1.02, 1, 1.02, 1]
                    : [1, 1.2, 1, 1.2, 1, 1.2, 1],
                }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{
                  duration: highlightDuration / 1000,
                  ease: 'easeInOut',
                }}
              >
                {isCard && item.cardData ? (
                  <CardFace card={item.cardData} />
                ) : isCard && item.deckTier ? (
                  <><AssetImage src={deckArt[item.deckTier]} className="deck-art" /><span className="flying-card-label">{copy.reserve}</span></>
                ) : (
                  isCard ? item.label && <span className="flying-card-label">{item.label}</span> : <GemArt color={item.color as GemColor} />
                )}
              </motion.div>
            ) : (
              <motion.div
                key={`f-${item.id}`}
                className={
                  isCard && item.cardData
                    ? `flying-item flying-card card card-color-${item.color}`
                    : isCard && item.deckTier
                      ? 'flying-item flying-card deck-flight'
                      : `flying-item flying-${item.type} gem-${item.color}`
                }
                style={cardStyle}
                initial={{
                  left: item.fromX,
                  top: item.fromY,
                  scale: isCard ? 1.02 : 1.15,
                  opacity: 1,
                  x: '-50%',
                  y: '-50%',
                }}
                animate={{
                  left: item.toX,
                  top: item.toY,
                  scale: isCard ? 0.3 : 0.7,
                  opacity: 0.8,
                  x: '-50%',
                  y: '-50%',
                }}
                exit={{ opacity: 0, scale: 0.2, transition: { duration: 0.1 } }}
                transition={{
                  duration: flyDuration,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                onAnimationComplete={() => removeFlyingItem(item.id)}
              >
                {isCard && item.cardData ? (
                  <CardFace card={item.cardData} />
                ) : isCard && item.deckTier ? (
                  <><AssetImage src={deckArt[item.deckTier]} className="deck-art" /><span className="flying-card-label">{copy.reserve}</span></>
                ) : (
                  isCard ? item.label && <span className="flying-card-label">{item.label}</span> : <GemArt color={item.color as GemColor} />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </AnimationContext.Provider>
  );
}
