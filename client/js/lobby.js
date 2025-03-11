const socket = io("http://127.0.0.1:51234");

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get("code");

document.getElementById("lobbyCode").innerText = code;

let username = sessionStorage.getItem("username") || `player${Math.floor(Math.random() * 1000)}`;
sessionStorage.setItem("username", username);

// automatisch opnieuw lobby joinen bij pagina-lading
window.onload = () => {
    console.log("🔄 Terug in de lobby, opnieuw verbinden...");
    socket.emit("join_lobby", { code, username });
};

// speler join lobby
socket.emit("join_lobby", { code, username });

// update lijst spelers
socket.on("update_lobby", data => {
    console.log("🔄 Update lobby ontvangen:", data);

    if (!data.players || data.players.length === 0) {
        console.warn("⚠️ Geen spelers in de lobby gedetecteerd!");
        return;
    }

    let players = data.players.map(p => p === username ? `${p} (you)` : p);
    document.getElementById("players").innerText = players.join(", ");

    updateGameCounts(data.choices, data.players.length);
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
}

// update tellers van spelkeuzes
function updateGameCounts(choices, totalPlayers) {
    let snakeCount = Object.values(choices).filter(c => c === "snake").length;
    let pongCount = Object.values(choices).filter(c => c === "pong").length;

    document.getElementById("snakeCount").innerText = `(${snakeCount}/${totalPlayers})`;
    document.getElementById("pongCount").innerText = `(${pongCount}/${totalPlayers})`;
}

// luister naar de redirect naar de homepage
socket.on("redirect_to_home", () => {
    window.location.href = "/";
});

// lobby verlaten
function leaveLobby() {
    socket.emit("leave_lobby", { code, username });
}