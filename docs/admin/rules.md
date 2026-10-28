# Acquire — Rules

## Goal

Finish with the most money. You earn it by buying stock in hotel chains early, collecting bonuses when chains are taken over, and selling your stock at the end.

## The board and the chains

The board has 108 squares in 12 columns (1–12) and 9 rows (A–I). Each square has exactly one tile, named after it: tile **5C** can only go on square 5C.

There are 7 hotel chains, in three price tiers:

- **Minor:** Tower, Luxor
- **Medium:** Worldwide, American, Festival
- **Major:** Imperial, Continental

Each chain has 25 shares. Everyone starts with $6,000 and a hand of 6 tiles. Before the game, each player places one tile from the pool; the lowest tile (by number, then letter) goes first, and play continues in seat order.

A chain of 11 or more tiles is **safe**: it can never be taken over.

## Your turn

1. **Place one tile** from your hand.
2. **Buy up to 3 shares**, in any active chains (optional).
3. **Draw** back up to 6 tiles.

### What a tile does

- **Next to nothing:** it stays on the board as a loose tile.
- **Next to loose tiles only:** it founds a new chain. You pick any chain not on the board, and you get one free share of it. The chain takes in all connected loose tiles.
- **Next to one chain:** it joins that chain, along with any loose tiles it connects.
- **Next to two or more chains:** it causes a **merger** (below).

### Tiles you can't play

- A tile that would merge two safe chains can never be played. At the end of your turn it is swapped for a new one automatically.
- A tile that would found an 8th chain can't be played while all 7 chains are on the board. You keep it; it becomes playable when a chain disappears.
- If none of your tiles can be played, you skip placing and may still buy stock.

### Two tiles per turn

If the game uses **Two tiles per turn**, each player holds 8 tiles instead of 6 and places two tiles every turn.

At the start of your turn, swap out any dead tiles. Then place your first tile and settle anything it causes, including a full merger with everyone's sell, trade or keep decisions, before placing your second. After both tiles, buy up to 3 shares at the prices on the board, then draw back up to 8.

You may found only one chain per turn, and you can't found a chain and cause a merger in the same turn, in either order. You can cause two mergers, one with each tile. Example: your first tile merges Luxor into Tower, so your second tile can merge again or grow a chain, but it can't found a new one.

You must play a second tile if any tile in your hand is legal after the first. If none is, go straight to buying. A tile that becomes dead during your turn, for example because your first tile made a chain safe, can't be your second tile; it's swapped out at the start of your next turn.

You can announce the end of the game before your first tile, between your two tiles, or while buying, as long as an end condition holds at that moment.

In a two-player game, the bank's tiles are placed right after the merger that drew them, so between your two tiles if your first tile caused it. Mergers caused by the bank's tiles don't count toward your two mergers or the founding rule. If a player leaves, the game places their first two legal tiles for them.

## Mergers

The **largest** chain survives and takes over the others. If chains tie for largest, the player who placed the tile chooses the survivor. Sizes are counted before the merging tile is placed.

Each chain being taken over is settled in turn, largest first (the merging player breaks ties, choosing the whole order up front):

1. **Bonuses.** The biggest shareholder gets the 1st bonus, the second biggest gets the 2nd bonus (see the price table).
   - Only one shareholder: they get both bonuses.
   - Tie for biggest: the 1st and 2nd bonuses are added together and split evenly among them; nobody else gets a bonus.
   - Tie for second: the 2nd bonus is split evenly among them.
   - Split amounts are rounded up to the next $100.
2. **Your shares.** Starting with the merging player and going round the table, everyone holding shares of that chain decides what to do with them, in any mix:
   - **Sell** them to the bank at the chain's price.
   - **Trade** them 2 for 1 for shares of the surviving chain, while the bank has some left.
   - **Keep** them. They are worth nothing unless the chain is founded again later.

Then the survivor absorbs all the tiles. The names of the chains taken over are free to be founded again.

## Buying stock

After placing, you may buy up to 3 shares in total, in one or more chains on the board. Prices depend on each chain's current size and stay fixed for the rest of your turn. You can't borrow, and you can't sell stock except in a merger or at the end.

### Optional stock swaps

If the game uses **Stock swap**, after your tile and any mergers are fully resolved you
may exchange shares with the bank **one for one**, before buying. Both chains must be on
the board. Give shares you own and take the same number from the bank, paying the current
price difference or receiving cash if the new shares are cheaper. You must afford the
payment, and the bank must have enough stock.

For example, two Tower shares at $300 each exchanged for two Continental shares at $700
each cost $800. Reversing that exchange pays you $800.

The setting is **Off** (default), **3**, **5**, **7** or **Unlimited** shares per turn.
The allowance is shared across exchanges: giving three shares and receiving three uses
three of the allowance. You can still buy your usual **up to 3 shares** afterward.
Swaps can be undone until you finish buying. This is an optional house rule.

## Price table

Find a chain's size in the column for its tier.

| Tower, Luxor | Worldwide, American, Festival | Imperial, Continental | Share price | 1st bonus | 2nd bonus |
| --- | --- | --- | --- | --- | --- |
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

The game shows this table under **Price table**, with each chain marked in its current row.

## Ending the game

On your turn you may **announce the end** once either of these is true:

- a chain has 41 or more tiles, or
- every chain on the board is safe.

You can announce before placing your tile or while buying. Announcing is optional; you finish your turn, then the game ends. The game also ends by itself if a whole round goes by with nobody placing a tile.

**Final scoring:** bonuses are paid for every chain on the board, then everyone sells all their shares in those chains at current prices. Shares of chains not on the board are worthless. The most money wins; ties share the win.

## Two players

With two players, the bank also acts as a shareholder whenever bonuses are paid. For each chain being settled, a tile is drawn from the pool: the bank holds as many shares as the tile's column number (9F means 9 shares). Bonuses the bank wins aren't paid to anyone. After the merger, these bank tiles are placed on the board; one that would cause a merger triggers it, one that would found a chain stays loose, and one that can't be played is removed. At the end, a tile is drawn for each chain in the same way.

## What you can see

Your tiles are private. Unless the game was created with **public holdings**, each player's cash and shares are private too; the game log is public (unless the game uses a limited game log, below), so a careful player can work them out.

### Limited game log

Much of Acquire is remembering who bought what. If the game uses **Limited game log**, the log only shows what has happened since your last turn. During a merger, the log still shows everything about that merger, even if it started before your last turn. The full log opens up once the game ends.

Because replaying the game would show the full history, replay is only available after the game ends when this setting is on.

## Game options

- **Limited game log:** the log shows only what happened since your last turn, until the game ends (see above).
- **Two tiles per turn:** hands of 8 tiles and two tiles placed every turn (see above).
- **Stock swap:** optional 1:1 exchanges with the bank before buying; Off / 3 / 5 / 7 / Unlimited shares per turn (see above).
- **Public holdings:** everyone's cash and shares are visible.
- **Team play** (4 players only): seats 1 and 3 play against seats 2 and 4; each team's money is added together at the end.
- **Two-player mode:** *Bank as third shareholder* (above) or *Four hands*, where each player controls two seats in a normal four-seat game and the player with the single richest seat wins.
- **End automatically when an end condition is met:** the game ends at the end of that turn, with no announcement.
- **Chain size that ends the game:** 41 tiles (standard) or 31 tiles for a shorter game. Safe size and prices don't change.

Options that don't fit the number of players are ignored, and the log says so.

## Players who leave

If a player leaves, the game plays on for them with safe defaults: it places their first playable tile, holds their stock in mergers, buys nothing and never announces the end. They are ranked below every player who stayed. When only one player is left, the game ends at once.
