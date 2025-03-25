from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, leave_room
import os
import random
import string

# basisinstellingen
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
CLIENT_DIR = os.path.abspath(os.path.join(BASE_DIR, "../client"))
GAMES_DIR = os.path.abspath(os.path.join(BASE_DIR, "../games"))

# flask instellen
app = Flask(__name__, static_folder=CLIENT_DIR, static_url_path="")
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# actieve lobby's (max 4 spelers)
MAX_PLAYERS = 4
active_lobbies = {}  # opgeslagen lobby's (spelers, keuzes, socket-IDs)
games_in_progress = {}  # actieve games (spelerlijst, return votes)

def generate_unique_code():
    """genereert unieke 6-letterige code"""
    while True:
        code = ''.join(random.choices(string.ascii_uppercase, k=6))
        if code not in active_lobbies:
            active_lobbies[code] = {
                "players_in_lobby": set(),
                "choices": {},
                "sids": {}
            }
            return code

# frontend bestanden serveren
@app.route("/")
def serve_index():
    """startpagina"""
    return send_from_directory(CLIENT_DIR, "index.html")

@app.route("/lobby.html")
def serve_lobby():
    """lobbypagina"""
    return send_from_directory(CLIENT_DIR, "lobby.html")

@app.route("/games/snake/<path:filename>")
def serve_snake_files(filename):
    """snake bestanden"""
    return send_from_directory(os.path.join(GAMES_DIR, "snake"), filename)

@app.route("/games/pong/<path:filename>")
def serve_pong_files(filename):
    """pong bestanden"""
    return send_from_directory(os.path.join(GAMES_DIR, "pong"), filename)

# lobby aanmaken
@app.route("/create_lobby", methods=["POST"])
def create_lobby():
    """maakt nieuwe lobby aan en geeft code terug"""
    code = generate_unique_code()
    return jsonify({"code": code})

# lobby joinen
@app.route("/join_lobby", methods=["POST"])
def join_lobby():
    """laat speler lobby joinen als die nog plaats heeft"""
    data = request.json
    code = data.get("code", "").upper()

    if code in active_lobbies:
        lobby = active_lobbies[code]
        in_lobby = len(lobby["players_in_lobby"])
        in_game = len(games_in_progress.get(code, {}).get("players_in_game", []))
        total = in_lobby + in_game
        if total >= MAX_PLAYERS:
            return jsonify({"success": False, "message": "lobby is vol"}), 403
        return jsonify({"success": True, "code": code})

    return jsonify({"success": False}), 404

# websockets events
@socketio.on("join_lobby")
def handle_join_lobby(data):
    """speler joint een lobby en krijgt updates"""
    code, username, sid = data["code"], data["username"], request.sid

    if code in active_lobbies:
        lobby = active_lobbies[code]
        in_lobby = len(lobby["players_in_lobby"])
        in_game = len(games_in_progress.get(code, {}).get("players_in_game", []))
        total = in_lobby + in_game
        if total > MAX_PLAYERS:
            socketio.emit("lobby_full", {}, room=sid)
            return

        lobby["players_in_lobby"].add(username)
        lobby["sids"][sid] = username
        join_room(code)
        broadcast_lobby_state(code)
        socketio.emit("game_choice_update", {
            "choices": lobby["choices"],
            "totalPlayers": len(lobby["players_in_lobby"])
        }, room=code)

@socketio.on("disconnect")
def handle_disconnect():
    """speler disconnect, lobby updaten"""
    sid = request.sid
    for code, lobby in active_lobbies.items():
        if sid in lobby["sids"]:
            username = lobby["sids"].pop(sid, None)  # verwijder speler-ID
            if username:
                lobby["players_in_lobby"].discard(username)
                lobby["choices"].pop(username, None)
                broadcast_lobby_state(code)
                if not lobby["players_in_lobby"] and code not in games_in_progress:
                    active_lobbies.pop(code, None)
            break

@socketio.on("choose_game")
def handle_choose_game(data):
    """speler kiest game en stuurt update naar iedereen"""
    code, username, game = data["code"], data["username"], data["game"]

    if code in active_lobbies:
        active_lobbies[code]["choices"][username] = game  # sla keuze op

        socketio.emit("game_choice_update", {
            "choices": active_lobbies[code]["choices"],
            "totalPlayers": len(active_lobbies[code]["players_in_lobby"])
        }, room=code)

        validate_game_start(code)

def validate_game_start(code):
    """controleert of een game gestart moet worden"""
    if code in active_lobbies:
        lobby = active_lobbies[code]
        choices = lobby["choices"]
        chosen_games = set(choices.values())
        total_players = len(lobby["players_in_lobby"])

        if len(chosen_games) == 1 and len(choices) == total_players and total_players > 1:
            game = chosen_games.pop()
            games_in_progress[code] = {
                "players_in_game": set(lobby["players_in_lobby"]),
                "ready_votes": set(),
                "rematch_votes": set(),
                "return_votes": set(),
                "current_game": game  # gekozen game opslaan
            }
            lobby["players_in_lobby"].clear()
            lobby["choices"] = {}
            broadcast_lobby_state(code)
            socketio.emit("start_game", {"game": game}, room=code)

@socketio.on("join_game")
def handle_join_game(data):
    """speler joint game en ontvangt huidige spelerslijst"""
    code, username = data["code"], data["username"]

    if code in games_in_progress:
        game = games_in_progress[code]
        game["players_in_game"].add(username)
        join_room(code)

        # stuur spelerslijst naar iedereen
        socketio.emit("update_game_players", {
            "players": list(game["players_in_game"]),
            "players_in_lobby": len(active_lobbies[code]["players_in_lobby"])
        }, room=code)

        # stuur teller update naar iedereen
        socketio.emit("update_ready_votes", {
            "votes": list(game["ready_votes"]),
            "totalPlayers": len(game["players_in_game"])
        }, room=code)

        broadcast_lobby_state(code)

def broadcast_lobby_state(code):
    if code in active_lobbies:
        lobby = active_lobbies[code]
        players_lobby = list(lobby["players_in_lobby"])
        players_in_game = len(games_in_progress[code]["players_in_game"]) if code in games_in_progress else 0
        current_game = None

        # haal gamenaam uit games_in_progress als bezig
        if code in games_in_progress and players_in_game > 0:
            current_game = games_in_progress[code].get("current_game", "game")
        else:
            current_game = None

        socketio.emit("update_lobby", {
            "players": players_lobby,
            "players_in_lobby": players_lobby,
            "players_in_game": players_in_game,
            "combined": players_in_game + len(players_lobby),
            "current_game": current_game,
        }, room=code)

@socketio.on("trigger_sync")
def handle_trigger_sync(data):
    """sync spelers in de game als iemand lobby betreedt of verlaat"""
    code = data["code"]

    if code in games_in_progress:
        game_info = games_in_progress[code]
        socketio.emit("update_game_players", {
            "players": list(game_info["players_in_game"]),
            "players_in_lobby": len(active_lobbies.get(code, {}).get("players_in_lobby", []))
        }, room=code)

        socketio.emit("update_ready_votes", {
            "votes": list(game_info["ready_votes"]),
            "totalPlayers": len(game_info["players_in_game"])
        }, room=code)

@socketio.on("player_ready")
def handle_player_ready(data):
    code = data["code"]
    username = data["username"]

    if code in games_in_progress:
        game = games_in_progress[code]
        game.setdefault("ready_votes", set())
        game["ready_votes"].add(username)

        socketio.emit("update_ready_votes", {
            "votes": list(game["ready_votes"]),
            "totalPlayers": len(game["players_in_game"])
        }, room=code)

        if game["ready_votes"] == game["players_in_game"]:
            socketio.emit("start_countdown", {}, room=code)

@socketio.on("player_rematch_vote")
def handle_player_rematch_vote(data):
    code = data["code"]
    username = data["username"]

    if code in games_in_progress:
        game = games_in_progress[code]
        game.setdefault("rematch_votes", set())
        game["rematch_votes"].add(username)

        socketio.emit("update_rematch_votes", {
            "votes": list(game["rematch_votes"]),
            "totalPlayers": len(game["players_in_game"])
        }, room=code)

        if game["rematch_votes"] == game["players_in_game"]:
            game["ready_votes"] = set()
            game["rematch_votes"] = set()
            socketio.emit("start_countdown", {}, room=code)

# sync tussen browsers voor snake movements
@socketio.on("snake_move")
def handle_snake_move(data):
    """update richting van een speler en broadcast naar anderen"""
    code, username, direction = data["code"], data["username"], data["direction"]
    if code in games_in_progress:
        socketio.emit("update_snake_direction", {"username": username, "direction": direction}, room=code)

@socketio.on("pong_move")
def handle_pong_move(data):
    """ontvang paddle-positie van speler en broadcast naar anderen"""
    code = data["code"]
    username = data["username"]
    x = data["x"]
    y = data["y"]

    if code in games_in_progress:
        # Stuur enkel de gewijzigde paddle info door
        socketio.emit("update_paddles", {
            username: {"x": x, "y": y}
        }, room=code)

@socketio.on("return_to_lobby")
def handle_return_to_lobby(data):
    """stuurt individuele speler terug naar lobby"""
    code, username = data["code"], data["username"]

    if code in games_in_progress:
        game_info = games_in_progress[code]
        game_info["players_in_game"].discard(username)
        game_info["return_votes"].discard(username)

        players_in_lobby = len(active_lobbies.get(code, {}).get("players_in_lobby", []))

        socketio.emit("update_game_players", {
            "players": list(game_info["players_in_game"]),
            "players_in_lobby": players_in_lobby
        }, room=code)
        # ready teller meegeven
        socketio.emit("update_ready_votes", {
            "votes": list(game_info["ready_votes"]),
            "totalPlayers": len(game_info["players_in_game"])
        }, room=code)

        # stuur alleen deze speler terug
        socketio.emit("return_lobby", {"code": code}, room=request.sid)

        # als laatste speler vertrekt, verwijder game
        if not game_info["players_in_game"]:
            del games_in_progress[code]

    if code in active_lobbies:
        lobby = active_lobbies[code]
        lobby["players_in_lobby"].add(username)
        join_room(code)
        broadcast_lobby_state(code)

@socketio.on("leave_lobby")
def handle_leave_lobby(data):
    """laat speler lobby verlaten"""
    code, username = data["code"], data["username"]

    if code in active_lobbies:
        lobby = active_lobbies[code]
        lobby["players_in_lobby"].discard(username)
        lobby["choices"].pop(username, None)
        broadcast_lobby_state(code)

        if not lobby["players_in_lobby"] and code not in games_in_progress:
            active_lobbies.pop(code, None)

    socketio.emit("redirect_to_home", {}, room=request.sid)

@socketio.on("food_update")
def handle_food_update(data):
    code = data["code"]
    food_items = data["foodItems"]
    socketio.emit("sync_food", {"foodItems": food_items}, room=code)

@socketio.on("ball_update")
def handle_ball_update(data):
    """Ontvang balpositie en broadcast naar alle clients"""
    code = data["code"]
    x = data["x"]
    y = data["y"]
    socketio.emit("sync_ball", {"x": x, "y": y}, room=code)

# start server
if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=51234, debug=True)