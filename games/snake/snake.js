const socket = io("http://127.0.0.1:51234");

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get("code");

let username = sessionStorage.getItem("username") || `player${Math.floor(Math.random() * 1000)}`;
sessionStorage.setItem("username", username);

console.log(`🔗 Verbonden met server als ${username} in game ${code}`);

// speler joint game-room
socket.emit("join_game", { code, username });

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