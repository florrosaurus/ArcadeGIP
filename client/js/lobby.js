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
    const playersInLobby = data.players_in_lobby.length;
    const playersInGame = data.players_in_game || 0;
    const combined = data.combined;

    document.getElementById("players").innerText = data.players.map(p => p === username ? `${p} (you)` : p).join(", ");
    document.getElementById("combinedCount").innerText = `${combined}/4 total`;
    document.getElementById("inLobbyOnly").innerText = `${playersInGame} in game`;

    const snakeBtn = document.querySelector('button[onclick="chooseGame(\'snake\')"]');
    const pongBtn = document.querySelector('button[onclick="chooseGame(\'pong\')"]');
    const gameBusyMessage = document.getElementById("gameBusyMessage");

    const youInGame = data.players_in_game[data.current_game]?.includes(username);
    if (data.games_in_progress?.length > 0) {
        const activeGames = data.games_in_progress;
    
        snakeBtn.disabled = activeGames.includes("snake") && !youInGame;
        pongBtn.disabled = activeGames.includes("pong") && !youInGame;
    
        const busyGames = activeGames.filter(game => !data.players_in_game[game]?.includes(username));
        if (busyGames.length > 0) {
            gameBusyMessage.innerText = `${busyGames.map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(", ")} is/zijn bezig...`;
            gameBusyMessage.style.display = "block";
        } else {
            gameBusyMessage.innerText = "";
            gameBusyMessage.style.display = "none";
        }
    } else {
        snakeBtn.disabled = false;
        pongBtn.disabled = false;
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
socket.on("game_choice_update", data => updateGameCounts(data.choices, data.totalPlayers));

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
function updateGameCounts(choices, totalPlayers) {
    let snakeCount = Object.values(choices).filter(c => c === "snake").length;
    let pongCount = Object.values(choices).filter(c => c === "pong").length;

    document.getElementById("snakeCount").innerText = `(${snakeCount}/${totalPlayers})`;
    document.getElementById("pongCount").innerText = `(${pongCount}/${totalPlayers})`;
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