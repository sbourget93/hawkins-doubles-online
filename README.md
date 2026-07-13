# Hawkins Doubles Online
https://hawkinsdubs.stephengb.com

## Overview
Hawkins Doubles Online is a web application used to streamline running the Hawkins Doubles weekly disc golf league. 

League administrators (Stephen) can use it to check in players, create and manage teams and cards, and assist with payouts.

League members can use it to check teams, hole assignments, payout structure, ace pot value, etc.

## How teams are formed

- [frontend/src/cards/generateTeams.ts](frontend/src/cards/generateTeams.ts)
- [frontend/src/cards/generateCards.ts](frontend/src/cards/generateCards.ts)


## How payouts are calculated

- [frontend/src/cards/payouts.ts](frontend/src/cards/payouts.ts)

## TODO and Future Features
People requesting to play together
Make the fastest possible slow card
Allow stragglers
hard delete everything
ask fable if there ia any bias or non randomness in team generation
stragglers
summary should tell me how many teams are gonna be paid out
is expected version based on sqlite auto increment? if auto inc misses a number (which you have told me it could) does it mess things up
link round on date in player summary
analytics page
"league" and "admin" sections of menu bar.
player ranking dash uses frontend data

## Workflow
admin makes league
admin clicks on league he just made
admin cheks in players, sets CTPs, then presses "generate teams" button
 - this button randomly generates teams and cards (with starting holes), moves the
   event to "forming_teams", and takes the admin to a new page with editable cards.
admin drags teams between holes to adjust the cards
admin presses ready to start button. event moves to "ready" and an event summary is shown. 
admin announces holes and stuff and presses begin, event moves to in progress
nicknames for search and display purposes

This workflow requires new event states

registration->forming_teams->ready->in_progress->complete
