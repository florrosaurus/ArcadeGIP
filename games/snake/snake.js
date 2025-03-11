const socket = io("http://127.0.0.1:51234");

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get("code");

let username = sessionStorage.getItem("username") || `player${Math.floor(Math.random() * 1000)}`;
sessionStorage.setItem("username", username);

console.log(`🔗 Verbonden met server als ${username} in game ${code}`);

// speler joint game-room
socket.emit("join_game", { code, username });

// update spelerslijst bij game join
socket.on("update_game_players", data => {
    if (!data.players || data.players.length === 0) {
        return;
    }

    let playerList = data.players.map(p => p === username ? `${p} (you)` : p);
    playerList[playerList.length - 1] += ` (${data.players.length})`; // laatste speler krijgt het totaal

    document.getElementById("players").innerText = playerList.join(", ");

    // toon waarschuwing
    let warningIcon = document.getElementById("warningIcon");
    if (data.players.length < 2) { // pas dit aan voor andere spelregels :)
        warningIcon.style.display = "inline";
        warningIcon.innerText = "⚠️";
        warningIcon.title = "te weinig spelers voor snake";
    } else {
        warningIcon.style.display = "none";
    }
});

// luisteren naar terugkeer event
socket.on("return_lobby", data => {
    window.location.assign(`/lobby.html?code=${data.code}`);
});

// speler stemt om terug te keren naar lobby
document.getElementById("returnButton").addEventListener("click", () => {
    console.log(`⬅️ ${username} keert terug naar lobby ${code}`);
    socket.emit("return_to_lobby", { code, username });
});

// debugging disconnects
socket.on("disconnect", reason => {
    console.warn(`⚡ Verbinding verbroken: ${reason}`);
});
