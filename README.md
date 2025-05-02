# Multiplayer Arcade Platform

Welkom bij het Multiplayer Arcade Platform, een webapplicatie waarmee je met vrienden klassieke arcadegames zoals Snake en Pong kunt spelen binnen een gezamenlijke online lobby.

---

## Features

- Realtime multiplayer via WebSockets
- Games starten via gezamenlijke keuze in de lobby
- Countdown- en ready-up systeem per spel
- Rematch-systeem met stemmen
- Optioneel accountsysteem met login, registratie en statistieken
- Spectator-modus per spel
- Dynamische sterrenachtergrond voor visuele flair
- Scorebord en winnaar-overlay in elk spel
- Responsive design voor desktop

---

## Architectuur en Projectstructuur

- Iedere game draait onafhankelijk binnen een gedeelde lobby
- WebSocket-communicatie wordt aangestuurd via Flask-SocketIO
- Frontend wordt geladen via HTML-bestanden per spel

---

## Installatie

1. Clone deze repository:
```bash
git clone https://github.com/jouw-gebruiker/arcade-platform.git
cd arcade-platform 
```

2. Installeer Python packages:
```bash
pip install -r requirements.txt
```

3. Start Python server:
```bash
python app.py
```

4. Open je browser op:
http://127.0.0.1:51234

---

## Accountsysteem

- Accounts zijn optioneel
- Inloggen vervangt 'playerXXX' door je gebruikersnaam
- Wachtwoord en naam kunnen aangepast worden via account.html
- Statistieken per spel: wins, losses, highscore, totalscore

---

## Technologiën & Toepassingen

| Technologie     | Toepassing                     |
| --------------- | ------------------------------ |
| Flask           | Backend / routes               |
| Flask-SocketIO  | Realtime communicatie          |
| HTML / CSS / JS | Frontend / game rendering      |
| SQLite3         | Persistentie gebruikers        |
| sessionStorage  | Client-side sessie             |
| Canvas API      | Spelvisualisatie + achtergrond |

---

## Styling & Sterrenachtergrond

- Lettertype: Press Start 2P
- Kleuren: blauw, geel, groen, rood
- Elk spel heeft een canvas-achtergrond met sterren
    - Bij Snake & Pong is de snelheid en variatie van sterren iets anders dan bij index/lobby/login
- Alle knoppen gebruiken glow-effects en schaduw
- Layout is gecentreerd met vaste pixelstijl

---

## Websocket eventverkeer (samengevat)

Belangrijkste events:
- join_lobby / leave_lobby
- join_game / trigger_sync / return_to_lobby
- player_ready / player_rematch_vote
- start_countdown / winner_update
- snake_move / food_update / sync_food
- pong_move / ball_update / sync_ball
- update_game_players / update_ready_votes / update_rematch_votes

Events worden gestuurd via socket.emit() en ontvangen via socket.on() per speltype.

---

## Moeilijkheden

- Games volledig loskoppelen binnen gedeelde lobbystructuur
- Ready-up, rematch en synchronisatie apart per spel correct beheren
- Snake dynamisch laten schalen bij meerdere spelers
- Ball-fysica in Pong na rematch herstellen zonder bugs
- Spectators uitsluiten van input zonder side-effects
- Winnaars correct bepalen bij simultane dood van snakes

---

## Bronnen per onderdeel

WebSockets / Flask-SocketIO

- https://flask-socketio.readthedocs.io/en/latest/
- https://stackoverflow.com/questions/45529594/flask-socketio-and-multiple-rooms

Canvas / HTML games

- https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- https://stackoverflow.com/questions/67346215/how-to-make-canvas-full-screen-and-responsive
- https://codepen.io/z-/pen/jOMQWpN

Login / Accountsysteem

- https://stackoverflow.com/questions/64960506/flask-login-register-using-sqlite
- https://www.sqlitetutorial.net/sqlite-python/

Styling en design

- https://fonts.google.com/specimen/Press+Start+2P
- https://css-tricks.com/almanac/properties/b/box-shadow/
- https://stackoverflow.com/questions/21277972/css-text-glow-effect

Game Logica inspiratie

- https://github.com/CodeExplainedRepo/Classic-Snake-Game-JavaScript
- https://gamedevelopment.tutsplus.com/tutorials/pong-4-ways-html5-canvas-javascript-and-css--cms-23350

---

## Requirements (requirements.txt)

- Flask==2.2.5
- Flask-SocketIO==5.3.4
- python-socketio==5.8.0
- eventlet==0.33.3

--- 

## Auteur

Gemaakt door Flor Loomans in 2025
Dit project werd ontwikkeld in het kader van een GIP-opdracht

Bekijk het project op:  
https://github.com/florrosaurus/ArcadeGIP