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
            active_lobbies[code] = {"players": set(), "choices": {}, "sids": {}}
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
        if len(active_lobbies[code]["players"]) >= MAX_PLAYERS:
            return jsonify({"success": False, "message": "lobby is vol"}), 403
        return jsonify({"success": True, "code": code})

    return jsonify({"success": False}), 404

# websockets events
@socketio.on("join_lobby")
def handle_join_lobby(data):
    """speler joint een lobby en krijgt updates"""
    code, username, sid = data["code"], data["username"], request.sid

    if code in active_lobbies:
        active_lobbies[code]["players"].add(username)  # voeg speler toe
        active_lobbies[code]["sids"][sid] = username  # link socket-ID aan speler
        join_room(code)  # voeg toe aan socket room

        socketio.emit("update_lobby", {"players": list(active_lobbies[code]["players"])}, room=code)
        socketio.emit("game_choice_update", {
            "choices": active_lobbies[code]["choices"],
            "totalPlayers": len(active_lobbies[code]["players"])
        }, room=code)

@socketio.on("disconnect")
def handle_disconnect():
    """speler disconnect, lobby updaten"""
    sid = request.sid
    for code, lobby in active_lobbies.items():
        if sid in lobby["sids"]:
            username = lobby["sids"].pop(sid, None)  # verwijder speler-ID
            if username:
                lobby["players"].discard(username)  # verwijder speler
                lobby["choices"].pop(username, None)  # verwijder keuze

                # stuur geüpdatete lobby naar overblijvende spelers
                socketio.emit("update_lobby", {"players": list(lobby["players"])}, room=code)

                # lobby alleen verwijderen als er geen actieve game meer is
                if not lobby["players"] and code not in games_in_progress:
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
            "totalPlayers": len(active_lobbies[code]["players"])
        }, room=code)

        validate_game_start(code)

def validate_game_start(code):
    """controleert of een game gestart moet worden"""
    if code in active_lobbies:
        choices = active_lobbies[code]["choices"]
        chosen_games = set(choices.values())  # unieke keuzes
        total_players = len(active_lobbies[code]["players"])

        if len(chosen_games) == 1 and len(choices) == total_players and total_players > 1:
            game = chosen_games.pop()
            games_in_progress[code] = {"players_in_game": set(active_lobbies[code]["players"]), "return_votes": set()}
            socketio.emit("start_game", {"game": game}, room=code)

@socketio.on("join_game")
def handle_join_game(data):
    """speler joint game en ontvangt huidige spelerslijst"""
    code, username = data["code"], data["username"]

    if code in games_in_progress:
        game = games_in_progress[code]
        game.setdefault("players_in_game", set())
        game.setdefault("ready_votes", set())
        game["players_in_game"].add(username)
        join_room(code)

        # stuur spelerslijst naar iedereen
        socketio.emit("update_game_players", {
            "players": list(game["players_in_game"])
        }, room=code)

        # stuur teller update naar iedereen
        socketio.emit("update_ready_votes", {
            "votes": list(game["ready_votes"]),
            "totalPlayers": len(game["players_in_game"])
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
            "totalPlayers": len(game["players_in_game"])  # hier voeg je hem toe
        }, room=code)

        if game["ready_votes"] == game["players_in_game"]:
            socketio.emit("start_countdown", {}, room=code)

@socketio.on("return_to_lobby")
def handle_return_to_lobby(data):
    """stuurt individuele speler terug naar lobby"""
    code, username = data["code"], data["username"]

    if code in games_in_progress:
        game_info = games_in_progress[code]
        game_info["players_in_game"].discard(username)
        game_info["return_votes"].discard(username)

        # stuur update naar overblijvende spelers
        socketio.emit("update_game_players", {
            "players": list(game_info["players_in_game"])
        }, room=code)

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
        active_lobbies[code]["players"].add(username)
        join_room(code)

        socketio.emit("update_lobby", {
            "players": list(active_lobbies[code]["players"]),
            "choices": active_lobbies[code]["choices"]
        }, room=code)

    if code in active_lobbies and not active_lobbies[code]["players"]:
        print(f"🗑️ lobby {code} wordt alsnog verwijderd na game")
        del active_lobbies[code]

@socketio.on("leave_lobby")
def handle_leave_lobby(data):
    """laat speler lobby verlaten"""
    code, username = data["code"], data["username"]

    if code in active_lobbies:
        active_lobbies[code]["players"].discard(username)
        active_lobbies[code]["choices"].pop(username, None)

        socketio.emit("update_lobby", {"players": list(active_lobbies[code]["players"])}, room=code)

        if not active_lobbies[code]["players"] and code not in games_in_progress:
            print(f"🗑️ lobby {code} verwijderd (geen spelers, geen game)")
            active_lobbies.pop(code, None)

    socketio.emit("redirect_to_home", {}, room=request.sid)

# start server
if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=51234, debug=True)