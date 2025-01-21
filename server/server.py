from flask import Flask, render_template
from flask_socketio import SocketIO, emit #type:ignore

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key'
socketio = SocketIO(app)

# Game state per lobby (bv)
lobbies = {
    "XXXXXX": {
        "players": [],
        "game_state": {}
    }
}

@app.route("/")
def index():
    return "Server is running"

@socketio.on("join_lobby")
def handle_join_lobby(data):
    lobby_id = data["lobby_id"]
    username = data["username"]
    if lobby_id in lobbies:
        lobbies[lobby_id]["players"].append(username)
        emit("player_list", lobbies[lobby_id]["players"], broadcast=True)

@socketio.on("game_action")
def handle_game_action(data):
    lobby_id = data["lobby_id"]
    action = data["action"]
    # update de game-state hier
    lobbies[lobby_id]["game_state"] = action
    emit("update_game", action, broadcast=True)

if __name__ == "__main__":
    socketio.run(app, debug=True)
