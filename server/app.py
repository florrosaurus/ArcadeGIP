from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, leave_room, disconnect
import os
import random
import string

# basis instellingen
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
CLIENT_DIR = os.path.abspath(os.path.join(BASE_DIR, "../client"))
GAMES_DIR = os.path.abspath(os.path.join(BASE_DIR, "../games"))

# flask-app instellen
app = Flask(__name__, static_folder=CLIENT_DIR, static_url_path="")
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# actieve lobby's opslaan (max 4 spelers per lobby)
MAX_PLAYERS = 4
active_lobbies = {}  # { "CODE123": {"players": set(), "choices": {}, "sids": {sid: username}}}
games_in_progress = {}  # { "CODE123": {"players_in_game": set(), "return_votes": set()} }

def generate_unique_code():
    """genereert unieke 6-letterige code"""
    while True:
        code = ''.join(random.choices(string.ascii_uppercase, k=6))
        if code not in active_lobbies:
            active_lobbies[code] = {"players": set(), "choices": {}, "sids": {}}
            return code

# **frontend bestanden serveren**
@app.route("/")
def serve_index():
    return send_from_directory(CLIENT_DIR, "index.html")

@app.route("/lobby.html")
def serve_lobby():
    return send_from_directory(CLIENT_DIR, "lobby.html")

@app.route("/games/snake/snake.html")
def serve_snake():
    print("✅ Snake gamepagina opgevraagd")
    return send_from_directory(os.path.join(GAMES_DIR, "snake"), "snake.html")

@app.route("/games/pong/pong.html")
def serve_pong():
    print("✅ Pong gamepagina opgevraagd")
    return send_from_directory(os.path.join(GAMES_DIR, "pong"), "pong.html")

# **lobby aanmaken**
@app.route("/create_lobby", methods=["POST"])
def create_lobby():
    code = generate_unique_code()
    return jsonify({"code": code})

# **lobby joinen**
@app.route("/join_lobby", methods=["POST"])
def join_lobby():
    data = request.json
    code = data.get("code", "").upper()

    if code in active_lobbies:
        if len(active_lobbies[code]["players"]) >= MAX_PLAYERS:
            return jsonify({"success": False, "message": "lobby is full"}), 403
        return jsonify({"success": True, "code": code})

    return jsonify({"success": False}), 404

# **websockets events**
@socketio.on("join_lobby")
def handle_join_lobby(data):
    """speler joint een lobby en krijgt updates"""
    code = data["code"]
    username = data["username"]
    sid = request.sid

    if code in active_lobbies:
        # voorkomen van dubbele joins bij refresh
        if username not in active_lobbies[code]["players"]:
            active_lobbies[code]["players"].add(username)
            active_lobbies[code]["sids"][sid] = username
            join_room(code)
            print(f"✅ {username} is gejoined in lobby {code}")
        else:
            print(f"⚠️ {username} probeerde dubbel te joinen.")

        # stuur update naar lobby
        socketio.emit("update_lobby", {
            "players": list(active_lobbies[code]["players"])
        }, room=code)

        # Stuur huidige game keuzes
        socketio.emit("game_choice_update", {
            "choices": active_lobbies[code]["choices"],
            "totalPlayers": len(active_lobbies[code]["players"])
        }, room=code)

@socketio.on("disconnect")
def handle_disconnect():
    """detecteer wanneer een speler disconnect"""
    sid = request.sid
    for code, lobby in active_lobbies.items():
        if sid in lobby["sids"]:
            username = lobby["sids"][sid]
            print(f"⚠️ {username} disconnected van lobby {code}")

            # speler verwijderen
            lobby["players"].discard(username)
            del lobby["sids"][sid]

            # verwijder keuze van gebruiker
            if username in lobby["choices"]:
                del lobby["choices"][username]

            # update lobby
            socketio.emit("update_lobby", {
                "players": list(lobby["players"])
            }, room=code)

            # stuur game keuze updates
            socketio.emit("game_choice_update", {
                "choices": lobby["choices"],
                "totalPlayers": len(lobby["players"])
            }, room=code)

            # verwijder lobby als leeg
            if not lobby["players"]:
                print(f"🗑️ Lobby {code} is leeg en wordt verwijderd")
                del active_lobbies[code]

            break

@socketio.on("leave_lobby")
def handle_leave_lobby(data):
    """speler verlaat lobby"""
    code = data["code"]
    username = data["username"]
    sid = request.sid

    if code in active_lobbies:
        leave_room(code)
        active_lobbies[code]["players"].discard(username)
        active_lobbies[code]["sids"].pop(sid, None)

        # verwijder keuze van gebruiker
        if username in active_lobbies[code]["choices"]:
            del active_lobbies[code]["choices"][username]

        # update lobby
        socketio.emit("update_lobby", {"players": list(active_lobbies[code]["players"])}, room=code)

        # stuur game keuze updates
        socketio.emit("game_choice_update", {
            "choices": active_lobbies[code]["choices"],
            "totalPlayers": len(active_lobbies[code]["players"])
        }, room=code)

        if not active_lobbies[code]["players"]:
            del active_lobbies[code]
            print(f"🗑️ Lobby {code} is verwijderd")

        print(f"🚪 {username} heeft lobby {code} verlaten.")

@socketio.on("choose_game")
def handle_choose_game(data):
    """speler kiest game en stuurt update naar iedereen"""
    code = data["code"]
    username = data["username"]
    game = data["game"]

    if code in active_lobbies:
        active_lobbies[code]["choices"][username] = game

        # stuur live update van keuzes
        socketio.emit("game_choice_update", {
            "choices": active_lobbies[code]["choices"],
            "totalPlayers": len(active_lobbies[code]["players"])
        }, room=code)

        print(f"✅ Lobby {code}: {active_lobbies[code]['choices']}")

        validate_game_start(code)

def validate_game_start(code):
    """Controleert of een game gestart moet worden (voor Snake/Pong)"""
    if code in active_lobbies:
        choices = active_lobbies[code]["choices"]
        chosen_games = set(choices.values())
        total_players = len(active_lobbies[code]["players"])

        if len(chosen_games) == 1 and len(choices) == total_players and total_players > 1:
            game = chosen_games.pop()
            if game == "pong" and total_players in [2, 4]:
                print(f"✅ Pong start met {total_players} spelers in lobby {code}")
                games_in_progress[code] = {"players_in_game": set(active_lobbies[code]["players"]), "return_votes": set()}
                socketio.emit("start_game", {"game": game}, room=code)
            elif game == "snake":
                print(f"✅ Snake start met {total_players} spelers in lobby {code}")
                games_in_progress[code] = {"players_in_game": set(active_lobbies[code]["players"]), "return_votes": set()}
                socketio.emit("start_game", {"game": game}, room=code)
            else:
                print(f"⚠️ Ongeldige configuratie voor {game}")

# start server
if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=51234, debug=True)