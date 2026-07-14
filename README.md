# Hawkins Doubles Online
https://hawkinsdubs.stephengb.com

## Overview
Hawkins Doubles Online is a web application used to streamline running the Hawkins Doubles weekly disc golf league. 

League administrators can use it to check in players, create and manage teams and cards, and assist with payouts.

League members can use it to check teams, hole assignments, payout structure, ace pot value, etc.

## How teams are formed

- [frontend/src/cards/generateTeams.ts](frontend/src/cards/generateTeams.ts)
- [frontend/src/cards/generateCards.ts](frontend/src/cards/generateCards.ts)


## How payouts are calculated

- [frontend/src/cards/payouts.ts](frontend/src/cards/payouts.ts)

## TODO and Future Features
- People requesting to play together
- Make the fastest possible slow card
- Allow stragglers
- hard delete everything
- ask fable if there ia any bias or non randomness in team generation
- stragglers
- summary should tell me how many teams are gonna be paid out
- is expected version based on sqlite auto increment? if auto inc misses a number (which you have told me it could) does it mess things up
- link round on date in player summary
- analytics page
- "league" and "admin" sections of menu bar.
- player ranking dash uses frontend data
- update frontend readme to make sure that when editing "backend table schemas/projections or the frontend aggregate data that mirrors them (offline snapshots & reducers)" the models are consulted
- make a note in frontend agents.md indicating that client tokens are acached forever
