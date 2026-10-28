# Acquire — Rules Specification for the BGS Engine

The rules the engine implements, written so each one can be coded and tested. Where the
original 1976 rules were silent or ambiguous, the choice made here is marked
**[DECISION]**. Tests cite these section numbers.

---

## 1. Components

- **Board:** 12 columns × 9 rows. Columns are numbered 1–12, rows lettered A–I.
  A square is written as number then letter, e.g. `1A`, `12I`.
- **Tiles:** 108 hotel tiles, exactly one per square. A tile can only ever be placed on
  its own square.
- **Chains:** 7 hotel chains, each with a name and a price tier (see §8).
- **Stock:** 25 shares per chain, held by the bank until bought or awarded.
- **Money:** The bank's money is unlimited. All money is integer dollars, always a
  multiple of $100. Never use floating point.
- **Players:** 2 to 6. Each starts with **$6,000**.

## 2. Definitions

- **Adjacent:** Two squares are adjacent if they share an edge (same row and
  neighbouring column, or same column and neighbouring row). Diagonals are never adjacent.
- **Loose tile:** A tile on the board that is not part of any chain.
- **Chain:** A connected group of two or more tiles (connected via adjacency) that has
  been assigned a chain name. Its **size** is the number of tiles in it.
- **Active chain:** A chain currently on the board.
- **Safe chain:** An active chain of size **11 or more**. A safe chain can never be
  taken over.
- **Open chain:** An active chain of size 10 or less.
- **Defunct chain:** A chain that has just been taken over in a merger. Its name
  becomes available again immediately after the merger resolves.

## 3. Setup

1. Shuffle all 108 tiles into a face-down draw pool using the game's seeded PRNG.
2. **Turn order:** Each player draws one tile and places it on the board. These tiles
   stay on the board as loose tiles. They never form a chain at this point, even if
   adjacent to one another.
3. The player who placed the **lowest** tile goes first. Compare by number first, then
   letter: `2B` beats `2E` and `3A`. Play then proceeds clockwise (in seat order) from
   that player. **[DECISION]** "Clockwise" means ascending seat order, wrapping around.
4. Each player then draws **6** tiles into their private hand.
5. **[DECISION]** Options are never rejected at setup. An option that does not apply to
   the player count (see §15) is ignored, and the game log records that it was ignored.

## 4. Turn Structure

A turn is a sequence of phases. Model it as a state machine; several phases need input
from a player, and the merger phase needs input from players *other than* the active
player.

1. **Place tile** (§5). May trigger **Found chain** (§6) or **Merger** (§7), which fully
   resolve before continuing.
2. **Buy stock** (§9). Optional, up to 3 shares.
3. **End-of-game announcement** (§11). Optional. **[DECISION]** Allowed at exactly two
   points: before placing a tile, and during the buy step (§11.1).
4. **Replace dead tiles** (§5.3).
5. **Draw** one tile to bring the hand back to 6, if the pool is not empty.

If the game was announced as over during this turn, run final scoring (§11.2) after
the turn completes instead of passing to the next player.

**[DECISION]** Steps where a player has nothing to decide are skipped automatically, but
an announcement point is never skipped. If an end condition (§11.1) holds before placing,
the player gets the placement step even with no playable tile (they may announce, then
pass). If an end condition holds at the buy step, the player gets the buy step even if
they cannot buy anything.

### 4.1 Two tiles per turn (house rule)

With `twoTiles` enabled (§15), hands hold **8** tiles instead of 6 (at setup and when
drawing), and each turn places two tiles:

1. At the start of the turn, the active seat discards its permanently unplayable tiles
   (§5.2) and draws replacements. They are not replaced at the end of the turn.
2. Place the first tile and resolve everything it causes, including a full merger with
   every player's disposal decisions and, in two-player bank mode, the bank's tiles
   (§12.1.4), before the second tile.
3. Place the second tile if any tile in hand is playable now; otherwise go straight to
   buying. A tile that became permanently unplayable during this turn cannot be placed and
   is replaced at the start of the seat's next turn.
4. A turn founds at most one chain, and never both founds a chain and causes a merger, in
   either order. It may cause two mergers, one per tile. Mergers caused by bank tiles do
   not count towards these limits.
5. Buy (§9, including §9.1 swaps) once, after both tiles, then draw back up to 8.

The end may also be announced between the two tiles, if an end condition holds at that
moment. Dropped seats place their first two playable tiles by the §16 default.

## 5. Placing a Tile

### 5.1 Effects of a placement

When a tile is placed, look at the chains and loose tiles adjacent to it:

- **No adjacent tiles:** It becomes a loose tile.
- **Adjacent only to loose tiles:** It **founds a new chain** (§6), if legal.
- **Adjacent to exactly one chain:** It joins that chain. **All loose tiles connected
  to the placed tile also join the chain.**
- **Adjacent to two or more different chains:** It causes a **merger** (§7).

### 5.2 Legality

A tile in hand is **playable** unless one of these applies:

- **Permanently unplayable:** Placing it would merge two or more **safe** chains. This
  is true even if it would also touch an open chain.
- **Temporarily unplayable:** Placing it would found a new chain (§5.1, adjacent only to
  loose tiles) while all 7 chains are already active. A tile that touches an existing
  chain is *not* blocked by this rule, even if it also touches loose tiles.

Legality must be recomputed every time it is needed. A tile's status changes as the board
changes (e.g. a temporarily unplayable tile becomes playable when a merger frees a name).

### 5.3 Dead and stuck hands

- If **none** of a player's tiles are playable, they skip the placement phase but may
  still buy stock.
- At the end of their turn, a player discards all **permanently** unplayable tiles from
  their hand (removed from the game) and draws replacements. Temporarily unplayable tiles
  are never replaced. **[DECISION]** This is automatic, not a player choice.
- If the draw pool is empty, no replacement or regular draw happens; hands simply shrink.

## 6. Founding a Chain

1. The active player (the **founder**) chooses the name of any chain not currently on
   the board.
2. The new chain consists of the placed tile plus **all loose tiles connected to it**.
3. The founder receives **1 free share** of that chain from the bank (the **founder's
   bonus**). If the bank has no shares left in that chain, no bonus is given.
4. A previously defunct chain can be founded again. Players still holding its stock
   from an earlier merger now hold stock in the new chain.

## 7. Mergers

### 7.1 Determining the survivor

1. Sizes are measured **before** the merging tile is placed.
2. The largest chain survives and takes over all others simultaneously.
3. If two or more chains tie for largest, the active player (the **mergermaker**)
   chooses the survivor from among them.
4. A safe chain can take over open chains. Two safe chains can never merge (§5.2).

### 7.2 Resolving each defunct chain

Defunct chains are resolved one at a time, **largest first** (by pre-merger size). If
defunct chains tie in size, the mergermaker chooses the order. **[DECISION]** The full
order is chosen once, up front, right after the survivor is known and before any bonuses
are paid; it cannot be changed partway through the merger.

For each defunct chain, in that order:

1. **Pay majority bonuses** (§10), using the defunct chain's pre-merger size for prices.
2. **Stock disposal:** Starting with the mergermaker and going clockwise through **all**
   players, each player holding stock in the defunct chain decides what to do with it.
   They may split their holding among these options in any amounts:
   - **Sell** shares to the bank at the defunct chain's pre-merger share price.
   - **Trade** shares 2-for-1 for shares of the **survivor**. The number of trades is
     limited by the survivor shares left in the bank.
   - **Hold** the rest. Held shares keep no value unless the chain is founded again.
   - Players holding no stock in the defunct chain are skipped automatically.

### 7.3 Board update

After all defunct chains are resolved, the survivor absorbs every tile from every
defunct chain, the merging tile, and all loose tiles connected to the merging tile.
Defunct chain names return to the pool of available names.

**[DECISION]** The disposal decisions of one defunct chain are fully completed (all
players) before the next defunct chain's bonuses are paid.

## 8. Price Table

Taken from the official Information Card. Chains fall into three tiers:

| Tier | Chains |
|---|---|
| Minor | Tower, Luxor |
| Medium | Worldwide, American, Festival |
| Major | Imperial, Continental |

Find the chain's size in its tier's column; that row gives the share price and bonuses.

| Minor size | Medium size | Major size | Share price | 1st (majority) bonus | 2nd (minority) bonus |
|---|---|---|---|---|---|
| 2 | — | — | $200 | $2,000 | $1,000 |
| 3 | 2 | — | $300 | $3,000 | $1,500 |
| 4 | 3 | 2 | $400 | $4,000 | $2,000 |
| 5 | 4 | 3 | $500 | $5,000 | $2,500 |
| 6–10 | 5 | 4 | $600 | $6,000 | $3,000 |
| 11–20 | 6–10 | 5 | $700 | $7,000 | $3,500 |
| 21–30 | 11–20 | 6–10 | $800 | $8,000 | $4,000 |
| 31–40 | 21–30 | 11–20 | $900 | $9,000 | $4,500 |
| 41+ | 31–40 | 21–30 | $1,000 | $10,000 | $5,000 |
| — | 41+ | 31–40 | $1,100 | $11,000 | $5,500 |
| — | — | 41+ | $1,200 | $12,000 | $6,000 |

Equivalently: the medium tier's price is the minor price for the same size plus $100, and
the major tier's is plus $200. The 1st bonus is always 10 × the share price and the 2nd
bonus is 5 × the share price. The engine may compute prices from this formula, but tests
must check every row of the table above.

**[DECISION]** Chain names and tier assignments live in a single config table so they
can be renamed later without touching game logic.

## 9. Buying Stock

1. After placing (or skipping placement), the active player may buy **0 to 3 shares**
   in total, across one, two, or three active chains.
2. Shares can only be bought in chains that are on the board and have shares left in the
   bank.
3. The price of each share is based on the chain's size **after** this turn's placement
   and any merger. Prices do not change partway through the buy phase.
4. A player cannot buy shares they cannot afford. There is no borrowing.
5. Players can never sell stock except during merger disposal (§7.2) and final scoring
   (§11.2). There is no trading between players.
6. **[DECISION]** The buy step is skipped automatically only for public reasons: no chain
   is on the board, or the bank has no shares left in any active chain. When
   `publicHoldings` is off (§13), it is never skipped because the player cannot afford a
   share, since that would reveal their cash; they get the step and may buy nothing. When
   `publicHoldings` is on, it is also skipped when the player cannot afford any share.

### 9.1 Optional stock swaps (house rule)

With `stockSwap` enabled, after placement (or a skipped placement) and **all** merger
and bank-tile resolution, the active seat may exchange shares with the bank before buying.
Each exchange gives N shares of one active chain for N of a different active chain.
Pay N × (receiving price − giving price), or receive the difference if negative, at current
post-merger prices. The seat must hold the shares, the bank must have the receiving stock,
and the seat must afford any payment. No borrowing or direct player trades.

Off is the default. Limits 3, 5 or 7 count shares **given** across all exchanges that turn;
Unlimited has no share-count cap. Allowances reset for each seat's turn, including four hands.
Normal purchases of up to 3 shares remain separate and end the turn. An exchange may fund
those purchases. A swap-enabled buy step is not skipped for lack of cash or secret holdings
when at least two chains are active and the bank has stock in one. Dropped players skip swaps.
Swaps and their cash differences are public once committed. Until buying ends the turn,
swap choices can be undone through the normal private turn draft without extra history or time.

## 10. Majority Bonuses

Bonuses are paid by the bank, based on how many shares each player holds in the chain
being scored.

- **Single holder:** They receive both the majority and minority bonus.
- **Clear first and clear second:** First gets the majority bonus, second gets the
  minority bonus.
- **Tie for first:** Add majority + minority bonuses together and split equally among
  the tied players. No minority bonus is paid to anyone else.
- **Clear first, tie for second:** First gets the majority bonus. The minority bonus is
  split equally among the players tied for second.
- **Rounding:** Any split share that is not a multiple of $100 is rounded **up** to the
  next $100. **[DECISION]** The original rules only specify rounding for a first-place
  tie; this applies the same rule to second-place ties.
- Players with zero shares never receive a bonus.

## 11. Ending the Game

### 11.1 Announcement

The game may be ended when either condition is true:

- **Any** active chain has size **41 or more**, or
- There is at least one active chain and **every** active chain is safe.

During their own turn, once a condition holds, the active player may announce the end
of the game. Announcing is **optional**; a player may keep playing if it benefits them.
After announcing, they finish the rest of their turn normally.

**[DECISION]** The announcement can be made before placing a tile or during the buy step,
and the end condition is checked at the moment of announcing. A condition that held at
the start of the turn but no longer holds (e.g. a newly founded chain is not safe) does
not allow an announcement. With the `autoEnd` option (§15), the condition is checked at
the end of the turn instead.

**[DECISION] Stall rule:** If a full round passes in which no tile was placed, the game
ends automatically at the end of the turn that completes that round, even if no end
condition has been met. A full round means as many consecutive turns as there are seats,
counted from any turn (not only from the first player). This covers both an empty draw
pool and hands that hold only unplayable tiles.

### 11.2 Final scoring

1. Pay majority bonuses (§10) for every active chain.
2. Every player sells all stock in active chains to the bank at current prices.
3. Stock in chains that are not on the board is worthless.
4. The player with the most money wins. **[DECISION]** Ties are shared victories.

## 12. Two-Player Rules

With exactly 2 players, the bank acts as a third shareholder whenever bonuses are paid.

### 12.1 At each merger

1. Before paying bonuses for a defunct chain, draw one tile from the pool. The bank is
   treated as holding a number of shares equal to that tile's **column number**
   (e.g. `9F` means 9 shares).
2. Pay bonuses (§10) as if the bank were a player. Any bonus the bank "wins" is simply
   not paid out. **[DECISION]** If the bank ties with a player, the split is computed
   normally and the bank's portion is not paid out.
3. The bank never disposes of stock; its holding is fictional.
4. After all defunct chains are resolved, and **before** the active player's buy phase,
   place the bank's tile(s) on the board:
   - If it would cause another merger, resolve that merger fully (with a fresh bank
     draw), then place that tile too. Repeat until no further merger occurs.
   - If it is permanently unplayable, remove it from the game.
   - If it would found a chain, place it as a loose tile. No chain is founded until a
     player later adds an adjacent tile (and that player gets the founder's bonus).
   - **[DECISION]** For a merger caused by a bank tile, the active player is the
     mergermaker: they break survivor and defunct-order ties, and stock disposal starts
     with them.
   - **[DECISION]** Waiting bank tiles are placed in the order they were drawn. Tiles
     drawn during a merger caused by a bank tile join the back of that queue.
5. **[DECISION]** One bank tile is drawn per defunct chain (so a three-way merger draws
   twice). If the pool is empty, the bank holds 0 shares.

### 12.2 At final scoring

Draw a tile for each active chain to set the bank's holding as above, pay bonuses, and
set the tiles aside without placing them. Tiles set aside count as removed from the game.

## 13. Hidden Information

Each viewer must only receive information their player is entitled to.

- **Always private:** each player's hand of tiles, and the order of the draw pool.
- **Always public:** the board, chain names and sizes, current prices, and the number of
  shares left in the bank for each chain.
- **[DECISION] Game option `publicHoldings` (default: `false`):** When off, each player's
  current share holdings and cash are visible only to that player. When on, they are
  public.
- **[DECISION] The game log is public** unless `limitedLog` is on (below). It records
  every action: tile placements, stock purchases, bonuses paid, and each player's disposal
  choices. Only the *current* holdings and cash are hidden, even though they can be
  reconstructed from the log.
- **Game option `limitedLog` (default: `false`):** each player sees only the log from the
  start of their own last turn before the current one, so the current turn, including a
  merger in progress, is always shown. Spectators see as much as the active player.
  Setup entries (options, turn order) stay visible. Earlier entries are replaced by
  placeholders, keeping the log's length. The whole log is revealed when the game ends,
  and replay is only available after that.
- **[DECISION] Scores during play:** When `publicHoldings` is off, every player's score
  is 0 until the game ends. When it is on, the score is projected net worth: cash,
  current share sale values and majority/minority bonuses at current holdings (including
  ties and rounding). Future bonuses are excluded in two-player bank mode because the
  bank's holding is drawn only at payout. In-progress mergers never count paid bonuses
  twice; absorbed shares kept after disposal are worth zero, while outstanding disposal
  shares retain their sale value. The survivor uses its known post-merger size.
  Team scores combine both seats; four-hands scores use the richest controlled seat.
  These are estimates during play; final scores remain the actual settled cash.

Hidden information must be stripped on the engine side, not merely hidden in the viewer.

## 14. Required Invariants (for tests)

These must hold after every move in every game:

1. For each chain, bank shares + all players' shares = 25.
2. Every player's cash is a non-negative multiple of $100.
3. Each of the 108 tiles is in exactly one place: the pool, one hand, the board,
   removed from the game, or (two-player bank mode only) **[DECISION]** waiting to be
   placed as a bank tile (§12.1.4). Waiting bank tiles are public.
4. Every active chain has size ≥ 2 and is one connected group; no two active chains are
   adjacent to each other.
5. At most 7 chains are active, and no name is used twice.
6. The full game state is JSON-serializable.
7. Replaying the same moves from the same seed produces an identical state.
8. Random legal play always reaches a finished game (2–6 players).

## 15. Game Options

Options are chosen when a game is created and apply to every player. Implement them as
switches on one engine, not as separate code paths. Defaults reproduce the standard game.

| Option | Values | Default | Effect |
|---|---|---|---|
| `publicHoldings` | true / false | false | See §13. When false, share holdings and cash are private. |
| `teamPlay` | true / false | false | Only applies with exactly 4 players. Seats 1 and 3 form one team, seats 2 and 4 the other. All rules are unchanged; at final scoring each team's cash is added together and the team with more wins. **[DECISION]** With `publicHoldings` off, teammates still cannot see each other's holdings. |
| `twoPlayerMode` | `bank` / `fourHands` | `bank` | Only has an effect with exactly 2 players. `bank` uses §12. `fourHands` runs a normal 4-seat game where each player controls two seats (player A has seats 1 and 3, player B has seats 2 and 4), with no bank shareholder. **[DECISION]** The player who controls the single richest seat wins; seats are not combined. |
| `autoEnd` | true / false | false | When true, the game ends automatically at the end of the turn in which an end condition (§11.1) first holds, instead of waiting for an announcement. |
| `stockSwap` | `off` / 3 / 5 / 7 / `unlimited` | `off` | Optional 1:1 exchanges with the bank before buying, paying or receiving the price difference. See §9.1. |
| `twoTiles` | true / false | false | Hands of 8 tiles and two placements per turn (house rule). See §4.1. |
| `limitedLog` | true / false | false | The log shows only what happened since your last turn until the game ends (house rule). See §13. |
| `endSize` | 41 / 31 | 41 | The chain size that triggers the end condition in §11.1. Setting 31 gives a shorter game (house rule). Does not change the safe size (11) or the price table. |

**[DECISION]** Invalid combinations are never rejected. An option that does not apply to
the player count (e.g. `teamPlay` with 5 players, or `twoPlayerMode: fourHands` with 3
players) is ignored, and the game log records that it was ignored. The default
`twoPlayerMode: bank` is not logged as ignored, since it is always sent.

## 16. Dropped Players

**[DECISION]** When a player drops out (quits or runs out of time), the game continues
and the engine plays for them automatically. The dropped player's seat keeps its tiles,
stock and cash and is scored normally. For every decision it uses these defaults:

| Decision | Default |
|---|---|
| Place tile | The first playable tile in hand, with the hand in board order (§3.3: by number, then letter). If none is playable, skip placement. |
| Name a new chain | The first available chain in config order (§8). |
| Choose merger survivor (tie) | The first tied chain in config order. |
| Choose defunct order (tie) | Tied chains in config order. |
| Stock disposal | Hold all defunct stock. |
| Buy stock | Buy nothing. |
| Announce the end | Never. |

**[DECISION]** Auto-play applies only while two or more players remain who have not
dropped. As soon as a drop leaves one or none, the game ends at once, even in the middle
of a turn or a merger, and is scored as usual (§11.2). An unfinished merger is abandoned:
bonuses already paid stand, chains not yet taken over are scored as active chains, and
bank tiles still waiting to be placed (§12.1.4) are removed from the game. With two
players, including `fourHands`, any drop therefore ends the game; in `fourHands` the
dropping player loses both seats at once.

**[DECISION]** Dropped players always rank below every player who did not drop, whatever
their cash. Players who dropped share the rank just below the last remaining player.
Their cash is still shown as their score.
