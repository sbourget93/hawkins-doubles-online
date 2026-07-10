# Hawkins Doubles Online
https://hawkinsdubs.stephengb.com

## Overview
Hawkins Doubles Online is a web application used to streamline running the Hawkins Doubles weekly disc golf league. 

League administrators (Stephen) can use it to check in players, create and manage teams and cards, and assist with payouts.

League members can use it to check teams, hole assignments, payout structure, ace pot value, etc.

## TODO and Future Features
People requesting to play together
Make the fastest possible slow card
Stephen starts on hole 1
Allow stragglers
confirmation when deleting checkins
hard delete everything
editable event title, stored i db
scroll should reset when changing event states
start assigning holes in intentional order.
Remove the word "hole" from the green circle

## Workflow
admin makes league
admin clicks on league he just made
admin cheks in players, sets CTPs, then presses "generate teams" button
 - this button randomly generates teams and cards (with starting holes), moves the
   event to "forming_teams", and takes the admin to a new page with editable cards.
admin drags teams between holes to adjust the cards
admin presses ready to start button. event moves to "ready" and an event summary is shown. 
admin announces holes and stuff and presses begin, event moves to in progress

This workflow requires new event states

registration->forming_teams->ready->in_progress->complete
