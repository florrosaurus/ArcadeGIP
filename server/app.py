from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, leave_room
import os
import random
import string

# basis padinstellingen
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
CLIENT_DIR = os.path.abspath(os.path.join(BASE_DIR, "../client"))

# flask-app instellen
app = Flask(__name__, static_folder=CLIENT_DIR, static_url_path="")
CORS(app)  # CORS inschakelen voor frontend-requests
socketio = SocketIO(app, cors_allowed_origins="*")  # WebSockets inschakelen

# actieve lobbies worden opgeslagen in een dictionary
active_lobbies = {}  # { "CODE123": {"players": set()} }

def generate_unique_code():
    """Genereert een unieke 6-letterige code voor een nieuwe lobby."""
    while True:
        code = ''.join(random.choices(string.ascii_uppercase, k=6))  # 6 random hoofdletters
        if code not in active_lobbies:
            active_lobbies[code] = {"players": set()}  # Nieuwe lobby opslaan
            return code

# **Frontend Bestanden Serveren**
@app.route("/")
def serve_index():
    """Geeft de startpagina (index.html) terug."""
    return send_from_directory(CLIENT_DIR, "index.html")

@app.route("/lobby.html")
def serve_lobby():
    """Geeft de lobbypagina (lobby.html) terug."""
    return send_from_directory(CLIENT_DIR, "lobby.html")

# **Lobby Aanmaken**
@app.route("/create_lobby", methods=["POST"])
def create_lobby():
    """Maakt een nieuwe lobby en retourneert de code."""
    code = generate_unique_code()
    return jsonify({"code": code})

# **Lobby Joinen**
@app.route("/join_lobby", methods=["POST"])
def join_lobby():
    """Controleert of een lobby bestaat en laat de speler joinen als hij geldig is."""
    data = request.json
    code = data.get("code", "").upper()  # code in hoofdletters
    if code in active_lobbies:
        return jsonify({"success": True, "code": code})
    return jsonify({"success": False}), 404  # foutmelding als de lobby niet bestaat

# **WebSockets events**
@socketio.on("join_lobby")
def handle_join_lobby(data):
    """Speler joint een lobby en krijgt realtime updates."""
    code = data["code"]
    username = data["username"]

    if code in active_lobbies:
        join_room(code)  # Socket.IO functie om speler in een "room" te zetten
        active_lobbies[code]["players"].add(username)  # voeg de speler toe aan de lijst

        # stuur update naar alle spelers in de lobby
        socketio.emit("update_lobby", {
            "players": list(active_lobbies[code]["players"])
        }, room=code)

@socketio.on("leave_lobby")
def handle_leave_lobby(data):
    """Speler verlaat een lobby en de lobby wordt verwijderd als hij leeg is."""
    code = data["code"]
    username = data["username"]

    if code in active_lobbies:
        leave_room(code)  # speler verlaat de Socket.IO kamer
        active_lobbies[code]["players"].discard(username)  # verwijder speler uit lijst

        if not active_lobbies[code]["players"]:  # als er geen spelers meer zijn, verwijder lobby
            del active_lobbies[code]
        else:
            # stuur een update naar de resterende spelers
            socketio.emit("update_lobby", {
                "players": list(active_lobbies[code]["players"])
            }, room=code)

# start de server
if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=51234, debug=True)