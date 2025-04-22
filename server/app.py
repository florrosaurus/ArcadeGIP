from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, leave_room
import os
import random
import string
from database import init_db, register_user, verify_login
from database import change_username, change_password
from flask import session

logged_in_users = set()
init_db()

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

MAX_USERNAME_LENGTH = 20

@app.route("/register", methods=["POST"])
def handle_register():
    data = request.json
    name = data.get("username")
    pw = data.get("password")
    if not name or not pw or len(name) > MAX_USERNAME_LENGTH:
        return jsonify({"success": False, "message": "Ongeldige input"}), 400
    if register_user(name, pw):
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Naam al in gebruik"}), 409

@app.route("/login", methods=["POST"])
def handle_login():
    data = request.json
    name = data.get("username")
    pw = data.get("password")
    if not name or not pw or len(name) > MAX_USERNAME_LENGTH:
        return jsonify({"success": False, "message": "Ongeldige input"}), 400
    if name in logged_in_users:
        return jsonify({"success": False, "message": "Gebruiker al ingelogd"}), 403
    if verify_login(name, pw):
        logged_in_users.add(name)
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Foute login"}), 401

@app.route("/logout", methods=["POST"])
def handle_logout():
    data = request.json
    name = data.get("username")
    logged_in_users.discard(name)
    return jsonify({"success": True})

@app.route("/change_username", methods=["PATCH"])
def handle_change_username():
    data = request.json
    old = data.get("old_name")
    new = data.get("new_name")
    pw = data.get("password")
    if not old or not new or not pw or len(new) > MAX_USERNAME_LENGTH:
        return jsonify({"success": False, "message": "Ongeldige input"}), 400

    success, msg = change_username(old, new, pw)
    
    if success:
        logged_in_users.discard(old)
        logged_in_users.add(new)
    
    return jsonify({"success": success, "message": msg})

@app.route("/change_password", methods=["PATCH"])
def handle_change_password():
    data = request.json
    name = data.get("username")
    old = data.get("old_password")
    new = data.get("new_password")
    if not name or not old or not new:
        return jsonify({"success": False, "message": "Ongeldige input"}), 400
    success, msg = change_password(name, old, new)
    return jsonify({"success": success, "message": msg})

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

        players_per_game = {
            game: list(info.get("players_in_game", []))
            for game, info in games_in_progress.get(code, {}).items()
        }

        socketio.emit("game_choice_update", {
            "choices": active_lobbies[code]["choices"],
            "totalPlayers": len(active_lobbies[code]["players_in_lobby"]),
            "playersInGame": players_per_game
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

            # check of game al bezig is in deze lobby
            if game in games_in_progress.get(code, {}):
                socketio.emit("game_already_running", {
                    "game": game,
                    "message": f"{game} is al bezig"
                }, room=code)
                return

            # start game
            games_in_progress.setdefault(code, {})
            games_in_progress[code][game] = {
                "players_in_game": set(lobby["players_in_lobby"]),
                "ready_votes": set(),
                "rematch_votes": set(),
                "return_votes": set()
            }
            lobby["players_in_lobby"].clear()
            lobby["choices"] = {}
            broadcast_lobby_state(code)
            socketio.emit("start_game", {"game": game}, room=code)

@socketio.on("join_game")
def handle_join_game(data):
    code = data["code"]
    username = data["username"]
    game = data["game"]
    room = f"{code}-{game}"

    if code in games_in_progress and game in games_in_progress[code]:
        game_info = games_in_progress[code][game]
        game_info.setdefault("players_in_game", set()).add(username)
        join_room(room)

        # aantal spelers in lobby
        players_in_lobby = len(active_lobbies.get(code, {}).get("players_in_lobby", []))
        # aantal spelers in andere games
        players_in_other_games = sum(
            len(g.get("players_in_game", []))
            for g_name, g in games_in_progress[code].items()
            if g_name != game
        )
        # totaal (deze game + lobby + anderen)
        total = len(game_info["players_in_game"]) + players_in_lobby + players_in_other_games

        socketio.emit("update_game_players", {
            "players": list(game_info["players_in_game"]),
            "players_in_lobby": players_in_lobby,
            "players_in_other_games": players_in_other_games,
            "total": total
        }, room=room)

        socketio.emit("update_ready_votes", {
            "votes": list(game_info.get("ready_votes", [])),
            "totalPlayers": len(game_info["players_in_game"]),
            "game": game
        }, room=room)

        socketio.emit("update_rematch_votes", {
            "votes": list(game_info.get("rematch_votes", [])),
            "totalPlayers": len(game_info["players_in_game"]),
            "game": game
        }, room=room)

        broadcast_lobby_state(code)

def broadcast_lobby_state(code):
    if code in active_lobbies:
        lobby = active_lobbies[code]
        players_lobby = list(lobby["players_in_lobby"])
        players_in_game_total = sum(len(g.get("players_in_game", [])) for g in games_in_progress.get(code, {}).values())

        players_in_game_per_game = {
            game: list(info.get("players_in_game", []))
            for game, info in games_in_progress.get(code, {}).items()
        }

        socketio.emit("update_lobby", {
            "players": players_lobby,
            "players_in_lobby": players_lobby,
            "players_in_game": players_in_game_per_game,
            "combined": players_in_game_total + len(players_lobby),
            "games_in_progress": list(players_in_game_per_game.keys()),
        }, room=code)

@socketio.on("trigger_sync")
def handle_trigger_sync(data):
    """sync spelers in de game als iemand lobby betreedt of verlaat"""
    code = data["code"]
    game = data["game"]

    if code in games_in_progress and game in games_in_progress[code]:
        game_info = games_in_progress[code][game]
        players_in_lobby = len(active_lobbies.get(code, {}).get("players_in_lobby", []))
        players_in_other_games = sum(
            len(g.get("players_in_game", [])) for g_name, g in games_in_progress[code].items()
            if g_name != game
        )

        socketio.emit("update_game_players", {
            "players": list(game_info["players_in_game"]),
            "players_in_lobby": players_in_lobby,
            "players_in_other_games": players_in_other_games,
            "total": len(game_info["players_in_game"]) + players_in_lobby + players_in_other_games
        }, room=f"{code}-{game}")

        socketio.emit("update_ready_votes", {
            "votes": list(game_info.get("ready_votes", [])),
            "totalPlayers": len(game_info.get("players_in_game", [])),
            "game": game
        }, room=f"{code}-{game}")

        socketio.emit("update_rematch_votes", {
            "votes": list(game_info.get("rematch_votes", [])),
            "totalPlayers": len(game_info.get("players_in_game", [])),
            "game": game
        }, room=f"{code}-{game}")

@socketio.on("player_ready")
def handle_player_ready(data):
    code = data["code"]
    username = data["username"]
    game = data["game"]
    room = f"{code}-{game}"

    if code in games_in_progress and game in games_in_progress[code]:
        game_info = games_in_progress[code][game]
        game_info.setdefault("ready_votes", set()).add(username)

        socketio.emit("update_ready_votes", {
            "votes": list(game_info["ready_votes"]),
            "totalPlayers": len(game_info["players_in_game"]),
            "game": game
        }, room=room)

        if game_info["ready_votes"] == game_info["players_in_game"]:
            socketio.emit("start_countdown", {"game": game}, room=room)

@socketio.on("player_rematch_vote")
def handle_player_rematch_vote(data):
    code = data["code"]
    username = data["username"]
    game = data["game"]
    room = f"{code}-{game}"

    if code in games_in_progress and game in games_in_progress[code]:
        game_info = games_in_progress[code][game]
        game_info.setdefault("rematch_votes", set()).add(username)

        socketio.emit("update_rematch_votes", {
            "votes": list(game_info["rematch_votes"]),
            "totalPlayers": len(game_info["players_in_game"]),
            "game": game
        }, room=room)

        if game_info["rematch_votes"] == game_info["players_in_game"]:
            game_info["ready_votes"] = set()
            game_info["rematch_votes"] = set()
            socketio.emit("start_countdown", {"game": game}, room=room)

# sync tussen browsers voor snake movements
@socketio.on("snake_move")
def handle_snake_move(data):
    """update richting van een speler en broadcast naar anderen"""
    code, username, direction = data["code"], data["username"], data["direction"]
    room = f"{code}-snake"  # juiste room gebruiken
    socketio.emit("update_snake_direction", {"username": username, "direction": direction}, room=room)

@socketio.on("pong_move")
def handle_pong_move(data):
    """ontvang paddle-positie van speler en broadcast naar anderen"""
    code = data["code"]
    username = data["username"]
    x = data["x"]
    y = data["y"]
    room = f"{code}-pong"
    socketio.emit("update_paddles", {username: {"x": x, "y": y}}, room=room)

@socketio.on("return_to_lobby")
def handle_return_to_lobby(data):
    code = data["code"]
    username = data["username"]
    game = data["game"]

    if code in games_in_progress and game in games_in_progress[code]:
        game_info = games_in_progress[code][game]
        game_info["players_in_game"].discard(username)
        game_info.get("return_votes", set()).discard(username)

        players_in_lobby = len(active_lobbies.get(code, {}).get("players_in_lobby", []))
        players_in_other_games = sum(
            len(g.get("players_in_game", [])) for g_name, g in games_in_progress[code].items()
            if g_name != game
        )

        socketio.emit("update_game_players", {
            "players": list(game_info["players_in_game"]),
            "players_in_lobby": players_in_lobby,
            "players_in_other_games": players_in_other_games,
            "total": len(game_info["players_in_game"]) + players_in_lobby + players_in_other_games
        }, room=f"{code}-{game}")

        socketio.emit("update_ready_votes", {
            "votes": list(game_info.get("ready_votes", [])),
            "totalPlayers": len(game_info.get("players_in_game", [])),
            "game": game
        }, room=f"{code}-{game}")

        socketio.emit("update_rematch_votes", {
            "votes": list(game_info.get("rematch_votes", [])),
            "totalPlayers": len(game_info.get("players_in_game", [])),
            "game": game
        }, room=f"{code}-{game}")

        socketio.emit("return_lobby", {"code": code}, room=request.sid)

        if not game_info["players_in_game"]:
            del games_in_progress[code][game]
            if not games_in_progress[code]:
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
    room = f"{code}-snake"
    socketio.emit("sync_food", {"foodItems": food_items}, room=room)

@socketio.on("ball_update")
def handle_ball_update(data):
    code = data["code"]
    x = data["x"]
    y = data["y"]
    room = f"{code}-pong"
    socketio.emit("sync_ball", {"x": x, "y": y}, room=room)

@socketio.on("winner_update")
def handle_winner_update(data):
    code = data["code"]
    winner = data["winner"]
    color = data["color"]
    scores = data.get("scores", {})
    game = data["game"]
    room = f"{code}-{game}"

    socketio.emit("winner_update", {
        "winner": winner,
        "color": color,
        "scores": scores
    }, room=room)

# start server
if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=51234, debug=True)