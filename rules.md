# Splendor — Complete Game Rules Reference

**Purpose:** This document is a complete, implementation-ready rules reference for the Splendor board game. It is written for a coding agent implementing the game in TypeScript/React. Every rule, edge case, and constraint is specified explicitly to remove ambiguity.

---

## 1. Components

### 1.1 Gem Tokens
- 7 gem colors total: **white, blue, green, red, black** (colored gems) + **gold** (wildcard)
- Gem counts scale with player count:

| Players | Each Colored Gem | Gold |
|---------|-----------------|------|
| 2 | 4 | 5 |
| 3 | 5 | 5 |
| 4 | 7 | 5 |

> For v1 (2 players): `{ white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 5 }`

### 1.2 Development Cards
- **90 cards** split across 3 tiers:
  - **Tier 1:** 40 cards (cheaper, 0–1 prestige points)
  - **Tier 2:** 30 cards (mid-range, 1–3 prestige points)
  - **Tier 3:** 20 cards (expensive, 3–5 prestige points)
- Each card has:
  - A **tier** (1, 2, or 3)
  - A **prestige point value** (0–5, many tier-1 cards are worth 0)
  - A **gem bonus color** (one of: white, blue, green, red, black) — this is the permanent discount the card grants
  - A **cost** in gems (a combination of colored gems, never gold)

### 1.3 Noble Tiles
- **10 noble tiles** in total
- Each noble has:
  - **3 prestige points** (always exactly 3)
  - A **requirement** expressed as a number of card bonuses of specific colors (e.g., 4 red cards + 4 green cards)
  - Nobles are **never** purchased with gems — they are attracted by card bonuses only
- Nobles selected per game = number of players + 1:
  - 2 players → **3 nobles**
  - 3 players → **4 nobles**
  - 4 players → **5 nobles**

---

## 2. Setup

Execute in this order:

1. **Shuffle** each of the three card tiers separately into three face-down decks
2. **Deal** 4 cards face-up from each tier in a row next to its deck (3 rows × 4 cards = 12 face-up cards)
3. **Select nobles:** Randomly draw (players + 1) noble tiles and place them face-up; return unused nobles to the box
4. **Place gems** in the central supply according to the player count table above
5. **Determine first player** (randomly or by agreement); in a 2-player game, Player 1 goes first
6. All players start with 0 gems, 0 cards, 0 nobles, 0 prestige points

---

## 3. Turn Structure

On their turn, a player **must** perform **exactly one** of the following four actions. No action is optional — a player cannot pass.

---

### Action A: Take 3 Different Colored Gems

**Rules:**
- Choose exactly 3 **different** gem colors from the central supply
- Each chosen color must have **at least 1 gem** remaining in the supply
- Take 1 gem of each chosen color
- Gold gems cannot be taken with this action
- If fewer than 3 different colors are available in the supply, the player may take 1 or 2 gems (one of each available color) — they cannot take duplicates to make up the difference

**Edge case:** If only 1 or 2 colors have gems remaining, the player takes 1 gem of each available color (1 or 2 gems total). They cannot decline to take fewer.

---

### Action B: Take 2 Gems of the Same Color

**Rules:**
- Choose exactly 1 gem color
- That color must have **at least 4 gems** remaining in the central supply
- Take exactly 2 gems of that color
- Gold gems cannot be taken with this action

**Edge case:** If no color has 4 or more gems, this action is not available.

---

### Action C: Reserve a Card

**Rules:**
- The player may reserve **at most 3 cards** in total across the entire game (not 3 per turn — 3 total in hand at any time)
- If the player already has 3 reserved cards, this action is not available
- The player chooses one of the following to reserve:
  - Any of the **face-up cards** from any tier (the revealed cards on the table)
  - The **top card of any tier's face-down deck** (taken without looking at it by other players — the reserving player may look at it)
- The chosen card goes to the player's **hand** (reserved cards area), face-down from other players' view
- The player immediately receives **1 gold gem** from the central supply (if any gold gems remain)
- If no gold gems are available, the player still reserves the card but receives no gem
- After a card is taken from the face-up row, it is **immediately** replaced by the top card of the corresponding deck (if any cards remain in that deck)

---

### Action D: Purchase a Card

**Rules:**
- The player may purchase:
  - Any **face-up card** currently in the market (any tier)
  - Any card from their own **reserved cards** in hand
- The player pays the card's cost, reduced by their permanent card bonuses, using their gems
- **Card bonuses reduce cost:** For each card the player has previously purchased that provides a gem bonus of color X, the cost of X is reduced by 1 (minimum 0 per color — costs never go negative)
- **Gold gems are wildcards:** After applying card bonuses, any remaining cost can be paid with gold gems (1 gold = 1 gem of any color)
- Paid gems (including gold) go back to the central supply
- The purchased card goes to the player's tableau (purchased cards area) face-up
- The purchased card's gem bonus is now permanent and applies to all future purchases
- The purchased card's prestige points are added to the player's total immediately
- If bought from the face-up market, it is replaced from the deck immediately

**Cost calculation — step by step:**
1. Start with the card's printed cost (e.g., `{ white: 2, blue: 1, red: 3 }`)
2. For each color, subtract the player's bonus count for that color (floor at 0)
3. The remainder is what must be paid in actual gems + gold
4. Count how many gems the player has of each required color
5. Any shortfall in a color must be covered by gold gems (1 gold per 1 missing gem)
6. If total gold needed > gold gems in player's hand → player cannot afford the card

**Example:**
- Card costs: `{ red: 3, white: 2 }`
- Player has: 2 red card bonuses, 1 white card bonus
- Effective cost: `{ red: 1, white: 1 }`
- Player pays 1 red gem + 1 white gem (or substitutes gold for either)

---

## 4. After the Action — End of Turn Checks

After the player completes their chosen action, perform these checks **in order**:

### 4.1 Gem Hand Limit

- A player may hold a **maximum of 10 gems** at the end of their turn (gold counts toward the limit)
- If the player has more than 10 gems after their action, they **must** discard gems back to the central supply until they have exactly 10
- The player chooses which gems to discard (any color, including gold)
- This is mandatory — the player cannot skip the discard

### 4.2 Noble Acquisition (Automatic)

- Check each remaining noble tile on the board
- If the player's **purchased card bonuses** (not gems) meet or exceed a noble's requirements, that noble **visits** the player
- This is automatic and not an action — the player does not choose to take a noble
- The noble tile is moved to the player's area and its 3 prestige points are added immediately
- If the player qualifies for **multiple nobles** simultaneously (rare but possible), the player **chooses** which one to receive (only 1 noble per turn)
- A noble that has already been taken by any player is no longer available

### 4.3 Win Condition Check

- After noble acquisition, check if any player has **15 or more prestige points**
- If yes, the **end game is triggered** (see Section 6)
- If no, the turn passes to the next player

---

## 5. Card Replacement Rules

Whenever a face-up card is taken from the market (by purchasing or reserving):
- Immediately flip the top card of that tier's deck face-up to fill the empty slot
- If the deck is empty, the slot remains empty for the rest of the game
- Empty slots in the market cannot be filled from other tiers' decks

---

## 6. End Game

### 6.1 Triggering the End Game

- The end game is triggered at the end of a turn in which **any player reaches 15 or more prestige points**
- "End of a turn" means after the player's action, gem discard (if any), and noble acquisition
- **Important:** The round must be completed so all players have taken an **equal number of turns**
- In a 2-player game: if Player 1 triggers the end game, Player 2 gets one final turn. If Player 2 triggers it, the game ends immediately (both players have had equal turns)
- More generally: complete the current round so the player who went first has the same number of turns as everyone else

### 6.2 Final Scoring

After the final round is complete, count each player's prestige points:
- Points from **purchased development cards** (printed on each card)
- Points from **noble tiles** (3 points each)
- Reserved cards in hand that were **not** purchased: worth 0 points

### 6.3 Determining the Winner

1. **Most prestige points wins**
2. **Tiebreaker:** If two players are tied on prestige points, the player with **fewer purchased development cards** wins
3. If still tied after tiebreaker: the rules do not specify a further tiebreaker — implementation may declare a draw or use a secondary tiebreaker (e.g., fewest reserved cards remaining)

---

## 7. Complete Card Data — Tier 1 (40 Cards)

Each card is listed as: `[id, prestigePoints, gemBonus, cost]`
Cost format: `W=white, U=blue, G=green, R=red, K=black`

### Tier 1 — Black Bonus Cards (8 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 1-K-01 | 0 | black | W:1, U:1, G:1, R:1 |
| 1-K-02 | 0 | black | U:2, G:2 |
| 1-K-03 | 0 | black | G:2, R:1 |
| 1-K-04 | 0 | black | U:1, R:2 |
| 1-K-05 | 0 | black | U:2, R:1 |
| 1-K-06 | 0 | black | G:3 |
| 1-K-07 | 1 | black | G:1, R:3, W:1 |
| 1-K-08 | 0 | black | R:2, W:2 |

### Tier 1 — White Bonus Cards (8 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 1-W-01 | 0 | white | U:1, G:1, R:1, K:1 |
| 1-W-02 | 0 | white | U:1, R:2 |
| 1-W-03 | 0 | white | R:2, K:2 |
| 1-W-04 | 0 | white | U:2, K:1 |
| 1-W-05 | 0 | white | K:3 |
| 1-W-06 | 0 | white | G:2, R:1 |
| 1-W-07 | 0 | white | G:1, R:1, K:3 |
| 1-W-08 | 1 | white | K:4 |

### Tier 1 — Blue Bonus Cards (8 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 1-U-01 | 0 | blue | W:1, G:1, R:1, K:1 |
| 1-U-02 | 0 | blue | W:1, G:2 |
| 1-U-03 | 0 | blue | W:2, R:2 |
| 1-U-04 | 0 | blue | W:2, G:1 |
| 1-U-05 | 0 | blue | W:3 |
| 1-U-06 | 0 | blue | R:1, K:2 |
| 1-U-07 | 0 | blue | W:1, K:1, R:3 |
| 1-U-08 | 1 | blue | W:4 |

### Tier 1 — Green Bonus Cards (8 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 1-G-01 | 0 | green | W:1, U:1, R:1, K:1 |
| 1-G-02 | 0 | green | W:2, U:1 |
| 1-G-03 | 0 | green | U:1, K:2 |
| 1-G-04 | 0 | green | W:1, U:2 |
| 1-G-05 | 0 | green | R:3 |
| 1-G-06 | 0 | green | W:2, K:2 |
| 1-G-07 | 0 | green | U:1, R:1, K:3 |
| 1-G-08 | 1 | green | U:4 |

### Tier 1 — Red Bonus Cards (8 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 1-R-01 | 0 | red | W:1, U:1, G:1, K:1 |
| 1-R-02 | 0 | red | W:2, U:2 |
| 1-R-03 | 0 | red | W:1, U:1 |
| 1-R-04 | 0 | red | G:2, K:1 |
| 1-R-05 | 0 | red | U:3 |
| 1-R-06 | 0 | red | G:2, W:1 |
| 1-R-07 | 0 | red | G:2, W:1, K:1 |
| 1-R-08 | 1 | red | G:4 |

---

## 8. Complete Card Data — Tier 2 (30 Cards)

### Tier 2 — Black Bonus Cards (6 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 2-K-01 | 1 | black | G:3, R:2, W:2 |
| 2-K-02 | 1 | black | U:3, R:2 |
| 2-K-03 | 2 | black | U:1, R:4 |
| 2-K-04 | 2 | black | G:5 |
| 2-K-05 | 2 | black | R:5 |
| 2-K-06 | 3 | black | W:5, K:3 |

### Tier 2 — White Bonus Cards (6 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 2-W-01 | 1 | white | U:2, G:2, K:3 |
| 2-W-02 | 1 | white | G:1, R:1, K:3 |
| 2-W-03 | 2 | white | G:1, R:4 |
| 2-W-04 | 2 | white | R:5 |
| 2-W-05 | 2 | white | K:5 |
| 2-W-06 | 3 | white | K:5, U:3 |

### Tier 2 — Blue Bonus Cards (6 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 2-U-01 | 1 | blue | W:3, G:2, K:2 |
| 2-U-02 | 1 | blue | W:2, R:2, K:1 |
| 2-U-03 | 2 | blue | W:4, K:1 |
| 2-U-04 | 2 | blue | W:5 |
| 2-U-05 | 2 | blue | G:5 |
| 2-U-06 | 3 | blue | G:5, R:3 |

### Tier 2 — Green Bonus Cards (6 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 2-G-01 | 1 | green | W:2, U:3, K:2 |
| 2-G-02 | 1 | green | W:3, U:1, R:1 |
| 2-G-03 | 2 | green | U:4, W:1 |
| 2-G-04 | 2 | green | U:5 |
| 2-G-05 | 2 | green | K:5 |
| 2-G-06 | 3 | green | U:5, K:3 |

### Tier 2 — Red Bonus Cards (6 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 2-R-01 | 1 | red | W:2, U:1, G:3, K:1 |
| 2-R-02 | 1 | red | U:1, G:2, K:2 |
| 2-R-03 | 2 | red | U:2, G:4 |
| 2-R-04 | 2 | red | U:5 |
| 2-R-05 | 2 | red | W:5 |
| 2-R-06 | 3 | red | W:3, K:5 |

---

## 9. Complete Card Data — Tier 3 (20 Cards)

### Tier 3 — Black Bonus Cards (4 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 3-K-01 | 3 | black | W:3, U:3, G:3, R:5 |
| 3-K-02 | 4 | black | U:7 |
| 3-K-03 | 4 | black | G:3, R:6, W:3 |
| 3-K-04 | 5 | black | U:7, R:3 |

### Tier 3 — White Bonus Cards (4 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 3-W-01 | 3 | white | U:3, G:3, R:3, K:5 |
| 3-W-02 | 4 | white | K:7 |
| 3-W-03 | 4 | white | U:3, G:6, K:3 |
| 3-W-04 | 5 | white | K:7, G:3 |

### Tier 3 — Blue Bonus Cards (4 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 3-U-01 | 3 | blue | W:3, G:3, R:3, K:3 |
| 3-U-02 | 4 | blue | W:7 |
| 3-U-03 | 4 | blue | W:6, R:3, K:3 |
| 3-U-04 | 5 | blue | W:7, K:3 |

### Tier 3 — Green Bonus Cards (4 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 3-G-01 | 3 | green | W:3, U:5, R:3, K:3 |
| 3-G-02 | 4 | green | R:7 |
| 3-G-03 | 4 | green | W:3, R:6, K:3 |
| 3-G-04 | 5 | green | R:7, W:3 |

### Tier 3 — Red Bonus Cards (4 cards)
| ID | Points | Bonus | Cost |
|----|--------|-------|------|
| 3-R-01 | 3 | red | W:3, U:3, G:5, K:3 |
| 3-R-02 | 4 | red | G:7 |
| 3-R-03 | 4 | red | U:3, G:6, W:3 |
| 3-R-04 | 5 | red | G:7, U:3 |

---

## 10. Complete Noble Tile Data (10 Nobles)

Noble requirements are expressed in **card bonuses** (purchased cards of that color), not gems.

| ID | Points | Requirement |
|----|--------|-------------|
| N-01 | 3 | red:4, green:4 |
| N-02 | 3 | red:4, black:4 |
| N-03 | 3 | white:4, blue:4 |
| N-04 | 3 | blue:4, green:4 |
| N-05 | 3 | white:3, blue:3, black:3 |
| N-06 | 3 | white:3, red:3, green:3 |
| N-07 | 3 | blue:3, red:3, black:3 |
| N-08 | 3 | white:4, black:4 |
| N-09 | 3 | green:3, red:3, black:3 |
| N-10 | 3 | white:3, blue:3, green:3 |

> **For 2-player games:** Randomly select 3 of the 10 nobles at setup. The other 7 are not used.

---

## 11. Edge Cases & Implementation Rules

This section captures every known ambiguity or edge case the engine must handle correctly.

### 11.1 Gem Taking Edge Cases
- **Empty supply:** A player cannot choose a color with 0 gems for Action A or B
- **Action A with fewer than 3 colors available:** If the supply has gems in only 1 or 2 colors, the player takes 1 gem from each available color. They cannot decline or take duplicates
- **Action A — cannot repeat a color:** Even if a color has 4+ gems, the player cannot take 2 of the same color with Action A. That requires Action B
- **Action B — exactly 4 minimum:** The supply must have ≥4 of the chosen color before taking. After taking 2, the supply will have ≥2 remaining

### 11.2 Gem Limit (10 gem cap)
- The cap applies **at the end of the player's turn**, after all gem gains are resolved
- Gold gems count toward the 10-gem limit
- If a player takes gems that push them over 10, they must discard **immediately** (before the next check)
- The player freely chooses which gems to discard — they can discard gold if they want
- Discarded gems return to the central supply

### 11.3 Reserving Cards
- A player with 3 reserved cards **cannot** perform Action C at all
- When reserving a face-down deck card: the player looks at the card privately and adds it to their reserved cards. Other players do not see it until it is played or revealed
- Implementation note: in a local hot-seat game, reserved cards can be shown to the current player and hidden during the opponent's turn, or they can always be shown (simpler). Either is acceptable for v1
- If a player reserves the last card from a deck, the face-up row for that tier may have an empty slot that cannot be refilled

### 11.4 Purchase Edge Cases
- **Purchasing reserved cards:** Reserved cards in the player's hand can be bought at any time on their turn, regardless of whether the card is still in the market
- **Gold substitution:** Gold covers any shortfall after bonuses are applied. The player is never forced to use gold if they have sufficient colored gems
- **Zero-cost cards:** Some tier-1 cards cost nothing after bonuses — a player can purchase them for free. This is valid
- **Overpaying:** A player may not overpay. They pay exactly the effective cost, no more. If they have more gems than needed, they only pay what is required
- **Cannot purchase if any color is unaffordable:** If the effective cost in any color exceeds (player's gems of that color + player's gold gems available), the purchase is illegal

### 11.5 Noble Acquisition Edge Cases
- Nobles are awarded **after** the player's action and **after** gem discarding
- A player who qualifies for 2+ nobles **chooses** exactly 1 to receive this turn. They do not receive the others (they may qualify again on a future turn if the noble is still available, but in practice each noble is unique)
- Nobles are never "missed" permanently — if a noble is still on the board and a player meets its requirements, it will visit them on their next qualifying turn
- A noble cannot be reserved or purchased — only attracted automatically

### 11.6 End Game Edge Cases
- The end game trigger is checked **after noble acquisition** — if a noble pushes a player to 15+, the end game triggers
- "Completing the round" means every player gets the same number of turns total. In a 2-player game, this means Player 2 always gets a turn after Player 1 triggers the end game
- Multiple players can reach 15+ in the same final round — all of them do so, then the winner is determined by score (then tiebreaker)
- The game does **not** end immediately when a player hits 15 — play continues until the round is complete
- A player can exceed 15 points significantly — there is no cap

### 11.7 Empty Deck Handling
- When a tier's deck is empty, face-up cards from that tier can still be purchased or reserved
- When a face-up card from a tier with an empty deck is taken, the slot remains empty
- Players may still reserve from an empty deck — they simply cannot, as there are no cards to take from it (the option is unavailable)
- The game does not end when decks run out

### 11.8 Tiebreaker
- Primary: most prestige points
- Secondary (tie): fewest **purchased** development cards (reserved cards do not count)
- Tertiary (still tied): implementation may call it a draw

---

## 12. Legal Move Summary (for engine validation)

The engine should expose a function `getLegalActions(gameState, playerIndex)` that returns all currently legal actions. A move is illegal if any of the following apply:

| Action | Illegal When |
|--------|-------------|
| Take 3 gems | Fewer than 3 colors with ≥1 gem AND fewer than the available colors requested; OR colors not specified correctly |
| Take 2 gems | Chosen color has fewer than 4 gems in supply |
| Reserve card | Player already has 3 reserved cards; OR chosen card/deck slot is empty |
| Purchase card | Player cannot cover effective cost even with all gold; OR card is not in market or player's reserved hand |

A well-implemented engine will make it impossible for the UI to submit an illegal action. Validation should occur in `engine.ts` and the store should call it before applying any state change.

---

## 13. Scoring Reference

| Source | Points |
|--------|--------|
| Each purchased development card | Printed value (0–5) |
| Each noble tile | 3 |
| Reserved cards (not purchased) | 0 |
| Gems held | 0 |
| Card bonuses | 0 (discounts, not points) |

**Winning threshold:** 15 prestige points triggers the end game. The winner is determined after the final round is complete.

---

## 14. Quick Reference — 2-Player Game Constants

```typescript
const TWO_PLAYER_SETUP = {
  gemsPerColor: 4,          // white, blue, green, red, black
  goldGems: 5,
  nobleCount: 3,            // players + 1
  visibleCardsPerTier: 4,
  maxReservedCards: 3,
  maxGemHandSize: 10,
  winThreshold: 15,
  tier1CardCount: 40,
  tier2CardCount: 30,
  tier3CardCount: 20,
  totalNobles: 10,          // select 3 randomly
};
```