from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, leave_room
import os
import random
import string

# basis instellingen
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
CLIENT_DIR = os.path.abspath(os.path.join(BASE_DIR, "../client"))

# flask-app instellen
app = Flask(__name__, static_folder=CLIENT_DIR, static_url_path="")
CORS(app)  # cors inschakelen voor frontend requests
socketio = SocketIO(app, cors_allowed_origins="*")  # websockets inschakelen

# actieve lobby's opslaan (max 4 spelers per lobby)
MAX_PLAYERS = 4
active_lobbies = {}  # { "CODE123": {"players": set(), "choices": {}} }

def generate_unique_code():
    """genereert unieke 6-letterige code"""
    while True:
        code = ''.join(random.choices(string.ascii_uppercase, k=6))  # 6 random hoofdletters
        if code not in active_lobbies:
            active_lobbies[code] = {"players": set(), "choices": {}}  # nieuwe lobby opslaan
            return code

# **frontend bestanden serveren**
@app.route("/")
def serve_index():
    """stuurt startpagina (index.html)"""
    return send_from_directory(CLIENT_DIR, "index.html")

@app.route("/lobby.html")
def serve_lobby():
    """stuurt lobbypagina (lobby.html)"""
    return send_from_directory(CLIENT_DIR, "lobby.html")

# **lobby aanmaken**
@app.route("/create_lobby", methods=["POST"])
def create_lobby():
    """maakt een nieuwe lobby en stuurt code terug"""
    code = generate_unique_code()
    return jsonify({"code": code})

# **lobby joinen**
@app.route("/join_lobby", methods=["POST"])
def join_lobby():
    """checkt of lobby bestaat, laat speler joinen als geldig"""
    data = request.json
    code = data.get("code", "").upper()  # altijd hoofdletters

    if code in active_lobbies:
        if len(active_lobbies[code]["players"]) >= MAX_PLAYERS:
            return jsonify({"success": False, "message": "lobby is full"}), 403
        return jsonify({"success": True, "code": code})

    return jsonify({"success": False}), 404  # fout als lobby niet bestaat

# **websockets events**
@socketio.on("join_lobby")
def handle_join_lobby(data):
    """speler joint een lobby, krijgt updates"""
    code = data["code"]
    username = data["username"]

    if code in active_lobbies:
        if len(active_lobbies[code]["players"]) >= MAX_PLAYERS:
            socketio.emit("lobby_full", {}, room=request.sid)
            return

        join_room(code)
        active_lobbies[code]["players"].add(username)

        # stuur update naar alle spelers
        socketio.emit("update_lobby", {
            "players": list(active_lobbies[code]["players"])
        }, room=code)

@socketio.on("leave_lobby")
def handle_leave_lobby(data):
    """speler verlaat lobby, update andere spelers"""
    code = data["code"]
    username = data["username"]

    if code in active_lobbies:
        leave_room(code)
        active_lobbies[code]["players"].discard(username)

        # verwijder spelkeuze als speler weggaat
        if username in active_lobbies[code]["choices"]:
            del active_lobbies[code]["choices"][username]

        socketio.emit("player_left", {"username": username}, room=code)

        if not active_lobbies[code]["players"]:  # als leeg, verwijder lobby
            del active_lobbies[code]
        else:
            socketio.emit("update_lobby", {"players": list(active_lobbies[code]["players"])}, room=code)

@socketio.on("choose_game")
def handle_choose_game(data):
    """speler kiest game, update alle spelers"""
    code = data["code"]
    username = data["username"]
    game = data["game"]

    if code in active_lobbies:
        active_lobbies[code]["choices"][username] = game

        socketio.emit("game_choice_update", {
            "username": username,
            "game": game,
            "choices": active_lobbies[code]["choices"],
            "totalPlayers": len(active_lobbies[code]["players"])
        }, room=code)

@socketio.on("request_game_choices")
def send_game_choices(data):
    """stuurt spelkeuzes naar nieuwe spelers die joinen"""
    code = data["code"]

    if code in active_lobbies:
        socketio.emit("game_choice_update", {
            "choices": active_lobbies[code]["choices"],
            "totalPlayers": len(active_lobbies[code]["players"])
        }, room=request.sid)

# start server
if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=51234, debug=True)