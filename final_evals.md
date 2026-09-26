# Splendor AI Eval Metrics

| # | Metric | What it calculates |
|---|---|---|
| | **Win / Outcome** | |
| 1 | Won | Whether this player won the game |
| 2 | Point differential | Player's score minus opponent's score at game end |
| 3 | Tiebreak win | Whether the win was decided by the fewer-cards tiebreaker |
| 4 | Total turns | Total turns in the game (both players) |
| 5 | Game duration | Wall-clock time from game start to end (ms) |
| | **Efficiency** | |
| 6 | Turns played | Number of turns this player took |
| 7 | Scoring pace | Points earned per turn played |
| 8 | Point milestones | Turn number when player first reached 5 / 10 / 15 points |
| 9 | First purchase turn | Turn number of the player's first card purchase |
| 10 | Purchase cadence | Average gap (in own turns) between consecutive purchases |
| 11 | Longest purchase drought | Max turns between consecutive purchases |
| | **Action Quality** | |
| 12 | Action distribution | Count of each action type (purchase, takeGems, take2Gems, reserve) |
| 13 | Purchase rate | Purchases divided by total turns played |
| 14 | Points per purchase | Average prestige points gained per purchase |
| 15 | Zero-point purchase rate | Fraction of purchases that were 0-prestige engine cards |
| 16 | Tier distribution | Count of purchases broken down by card tier (1/2/3) |
| 17 | Gem hoarding rate | Fraction of turns holding 8+ gems without purchasing within next 2 own turns |
| 18 | Reserve efficiency | Fraction of reserved cards that were eventually purchased |
| 19 | Wasted reserves | Count of reserved cards never purchased by game end |
| 20 | Gold efficiency | Gold gems spent divided by gold gems acquired (spend rate) |
| 21 | Gold hoarded at end | Gold gems still held on the player's final turn |
| | **Format Compliance** | |
| 22 | Fallback rate | Fraction of turns that used a fallback action |
| 23 | Malformed JSON rate | Fraction of turns where the AI returned unparseable JSON |
| 24 | Illegal move rate | Fraction of turns where the AI proposed an illegal action |
| 25 | Fallbacks by phase | Fallback counts split into early (turns 1-10), mid (11-20), late (21+) |
| | **Latency** | |
| 26 | Mean response time | Average API response time per turn (ms) |
| 27 | Median response time | Median API response time |
| 28 | P95 response time | 95th percentile API response time |
| 29 | Min / Max response time | Fastest and slowest single-turn response |
| 30 | Total AI time | Sum of all API response times for this player |
| | **Strategy** | |
| 31 | Bonus diversity | Number of gem colors (0-5) with at least 1 card bonus at game end |
| 32 | Bonus spread | Shannon entropy of the final bonus distribution across colors |
| 33 | Noble count | Number of nobles claimed during the game |
| 34 | Noble-aligned purchase rate | Fraction of purchases whose bonus color matches a remaining board noble's requirement |
| 35 | Blocking reserve rate | Fraction of reserves where the opponent could have afforded the card |
| 36 | Urgency shift | Change in average purchase prestige after opponent crosses 12 points vs before |
| | **Head-to-Head** | |
| 37 | Lead changes | Number of times the leading player switched during the game |
| 38 | Longest lead streak | Max consecutive turns one player held the lead |
| 39 | Comeback occurred | Whether either player overcame a 5+ point deficit to win |
| 40 | Max deficit overcome | Largest point deficit the winner recovered from |
| | **Composite** | |
| 41 | Composite score | Weighted score (win 30%, efficiency 20%, action quality 20%, compliance 15%, strategy 15%) |
| 42 | Tier rating | Letter grade (S/A/B/C/D/F) based on composite score and fallback rate thresholds |

Metrics 1-36 and 41-42 are per-player. Metrics 37-40 are per-game.
