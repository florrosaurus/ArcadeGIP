from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, leave_room, disconnect
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
    """serveert startpagina"""
    return send_from_directory(CLIENT_DIR, "index.html")

@app.route("/lobby.html")
def serve_lobby():
    """serveert lobbypagina"""
    return send_from_directory(CLIENT_DIR, "lobby.html")

@app.route("/games/snake/snake.html")
def serve_snake():
    """serveert snake gamepagina"""
    return send_from_directory(os.path.join(GAMES_DIR, "snake"), "snake.html")

@app.route("/games/pong/pong.html")
def serve_pong():
    """serveert pong gamepagina"""
    return send_from_directory(os.path.join(GAMES_DIR, "pong"), "pong.html")

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

                # als lobby leeg is, verwijderen
                if not lobby["players"]:
                    games_in_progress.pop(code, None)  # stop lopende game
                    active_lobbies.pop(code, None)  # verwijder lobby
            break

@socketio.on("choose_game")
def handle_choose_game(data):
    """speler kiest game en stuurt update naar iedereen"""
    code, username, game = data["code"], data["username"], data["game"]

    if code in active_lobbies:
        active_lobbies[code]["choices"][username] = game  # sla keuze op

        # stuur geüpdatete keuzes naar alle spelers
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

        # als alle spelers hetzelfde spel kiezen, start het
        if len(chosen_games) == 1 and len(choices) == total_players and total_players > 1:
            game = chosen_games.pop()
            games_in_progress[code] = {"players_in_game": set(active_lobbies[code]["players"]), "return_votes": set()}
            socketio.emit("start_game", {"game": game}, room=code)

@socketio.on("return_to_lobby")
def handle_return_to_lobby(data):
    """stuurt individuele speler terug naar lobby"""
    code, username = data["code"], data["username"]

    if code in games_in_progress:
        game_info = games_in_progress[code]

        # verwijder speler uit actieve game
        game_info["players_in_game"].discard(username)
        game_info["return_votes"].discard(username)

        # stuur alleen deze speler terug
        socketio.emit("return_lobby", {"code": code}, room=request.sid)

        # als laatste speler vertrekt, verwijder game
        if not game_info["players_in_game"]:
            del games_in_progress[code]

# start server
if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=51234, debug=True)