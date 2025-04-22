const socket = io("http://127.0.0.1:51234");

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get("code");

document.getElementById("lobbyCode").innerText = code;

let username = sessionStorage.getItem("username") || `player${Math.floor(Math.random() * 1000)}`;
sessionStorage.setItem("username", username);

function triggerGameSync() {
    const games = ["snake", "pong"];
    games.forEach(game => socket.emit("trigger_sync", { code, game }));
}

// automatisch opnieuw lobby joinen bij pagina-lading
window.onload = () => {
    console.log("🔄 Terug in de lobby, opnieuw verbinden...");
    socket.emit("join_lobby", { code, username });
    triggerGameSync();
};

// speler join lobby
socket.emit("join_lobby", { code, username });
triggerGameSync();

// update lijst spelers
socket.on("update_lobby", data => {
    const playersInGameObject = data.players_in_game || {};
    const playersInGame = Object.values(playersInGameObject).reduce((sum, arr) => sum + arr.length, 0);
    const combined = data.combined;

    document.getElementById("players").innerText = data.players.map(p => p === username ? `${p} (you)` : p).join(", ");
    document.getElementById("combinedCount").innerText = `${combined}/4 total`;
    document.getElementById("inGameOnly").innerText = `${playersInGame} in game`;

    const snakeBtn = document.querySelector('button[onclick="chooseGame(\'snake\')"]');
    const pongBtn = document.querySelector('button[onclick="chooseGame(\'pong\')"]');
    const gameBusyMessage = document.getElementById("gameBusyMessage");

    const playersPerGame = data.players_in_game || {};
    const userInSnake = playersPerGame.snake?.includes(username);
    const userInPong = playersPerGame.pong?.includes(username);

    const snakeBusy = playersPerGame.snake && playersPerGame.snake.length > 0;
    const pongBusy = playersPerGame.pong && playersPerGame.pong.length > 0;

    snakeBtn.disabled = snakeBusy && !userInSnake;
    pongBtn.disabled = pongBusy && !userInPong;

    const messages = [];
    if (snakeBusy && !userInSnake) messages.push("Snake is al bezig");
    if (pongBusy && !userInPong) messages.push("Pong is al bezig");

    if (messages.length > 0) {
        gameBusyMessage.innerText = messages.join(" — ");
        gameBusyMessage.style.display = "block";
    } else {
        gameBusyMessage.innerText = "";
        gameBusyMessage.style.display = "none";
    }    
});

// ontvangt updates vanuit de game-room (game-side sync)
socket.on("update_game_players", data => {
    const playersInGame = data.players.length;
    const playersInLobby = data.players_in_lobby;
    const combined = playersInGame + playersInLobby;

    document.getElementById("combinedCount").innerText = `${combined}/4 total`;
    document.getElementById("inLobbyOnly").innerText = `${playersInGame} in game`;
});

// update gamekeuze tellers
socket.on("game_choice_update", data => {
    updateGameCounts(data.choices, data.totalPlayers, data.playersInGame || {});
});

// start game als iedereen dezelfde kiest
socket.on("start_game", data => {
    window.location.href = `/games/${data.game}/${data.game}.html?code=${code}&user=${username}`;
});

// speler kiest game
function chooseGame(game) {
    socket.emit("choose_game", { code, username, game });
    triggerGameSync();
}

// update tellers van spelkeuzes
function updateGameCounts(choices, totalPlayers, playersInGame = {}) {
    const snakeVotes = Object.values(choices).filter(c => c === "snake").length;
    const pongVotes = Object.values(choices).filter(c => c === "pong").length;

    const snakePlayers = playersInGame.snake?.length || 0;
    const pongPlayers = playersInGame.pong?.length || 0;

    const snakeTotal = snakeVotes + snakePlayers;
    const pongTotal = pongVotes + pongPlayers;

    document.getElementById("snakeCount").innerText = `(${snakeTotal}/${totalPlayers + snakePlayers})`;
    document.getElementById("pongCount").innerText = `(${pongTotal}/${totalPlayers + pongPlayers})`;
}

// error handlers
socket.on("lobby_full", () => {
    alert("⚠️ lobby zit vol (max 4)");
    window.location.href = "/";
});

socket.on("redirect_to_home", () => {
    window.location.href = "/";
});

// lobby verlaten
function leaveLobby() {
    socket.emit("leave_lobby", { code, username });
    triggerGameSync();
}

window.addEventListener("load", () => {
    const loginBox = document.getElementById("loginStatus");
    if (loginBox) {
        const name = sessionStorage.getItem("username");
        const loggedIn = sessionStorage.getItem("loggedIn") === "true";
        loginBox.innerText = loggedIn ? `Logged in as ${name}` : "Not logged in";
    }
});