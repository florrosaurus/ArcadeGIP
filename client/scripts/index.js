// script.js

// debug: controleer of de script runt of niet
console.log("Script is gelinkt en runt");

// game selector
document.addEventListener("DOMContentLoaded", () => {
    // selecteer alle game-blokken
    const gameBlocks = document.querySelectorAll(".game-block");

    // voeg een klikfunctionaliteit toe aan elk blok
    gameBlocks.forEach(block => {
        block.addEventListener("click", () => {
            const gameName = block.textContent; // haal de naam van de game op
            loadGame(gameName);
        });
    });
});

// dynamische playerlist
const socket = io.connect("http://localhost:5000");

socket.on("player_list", players => {
    const playerList = document.getElementById("player-list");
    const list = playerList.querySelector("ul");
    list.innerHTML = ""; // wis huidige lijst

    players.forEach(player => {
        const li = document.createElement("li");
        li.textContent = player;
        list.appendChild(li);
    });
});

// voorbeeld om een speler toe te voegen
socket.emit("join_lobby", { lobby_id: "XXXXXX", username: "Gast 1" });

document.addEventListener("keydown", event => {
    const action = { key: event.key }; // bv pijltjes of toetsen
    socket.emit("game_action", { lobby_id: "XXXXXX", action });
});
