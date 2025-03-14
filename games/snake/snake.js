const socket = io("http://127.0.0.1:51234");

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get("code");

let username = sessionStorage.getItem("username") || `player${Math.floor(Math.random() * 1000)}`;
sessionStorage.setItem("username", username);

// game parameters
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// snake parameters
const snakes = {};
const colors = ["red", "blue", "green", "yellow"]; // kleuren per speler

// speler joint game-room
socket.emit("join_game", { code, username });

// functie om snakes te spawnen
function spawnSnakes(players) {
    const padding = 3; // afstand van de rand
    const gridSize = Math.floor(canvasSize / 20); // aantal cellen in grid

    const positions = [
        { x: padding, y: Math.floor(gridSize / 2), direction: "right" },  // links → rechts
        { x: gridSize - padding - 1, y: Math.floor(gridSize / 2), direction: "left" },  // rechts → links
        { x: Math.floor(gridSize / 2) - 1, y: padding, direction: "down" },  // boven → beneden
        { x: Math.floor(gridSize / 2) - 1, y: gridSize - padding - 1, direction: "up" }  // onder → boven
    ];

    players.forEach((player, index) => {
        if (index >= positions.length) return; // max 4 spelers

        let startX = positions[index].x;
        let startY = positions[index].y;
        let direction = positions[index].direction;

        snakes[player] = {
            body: [
                { x: startX, y: startY },
                { x: startX - (direction === "right" ? 1 : direction === "left" ? -1 : 0), 
                  y: startY - (direction === "down" ? 1 : direction === "up" ? -1 : 0) },
                { x: startX - (direction === "right" ? 2 : direction === "left" ? -2 : 0), 
                  y: startY - (direction === "down" ? 2 : direction === "up" ? -2 : 0) }
            ],
            direction: direction, // start richting afhankelijk van spawnpositie
            color: colors[index],
            alive: true
        };
    });
    drawSnakes();
}

// tekent de snakes joepie
function drawSnakes() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // canvas leegmaken

    Object.keys(snakes).forEach(player => {
        const snake = snakes[player];

        if (!snake) {
            return;
        }

        console.log(`teken snake van ${player}:`, snake.body);

        ctx.fillStyle = snake.color;
        snake.body.forEach((segment, index) => {
            if (player === username) {
                ctx.globalAlpha = index % 2 === 0 ? 0.7 : 1; // flikkerende blokjes, duid jouw slang aan
            } else {
                ctx.globalAlpha = 1;
            }
            ctx.fillRect(segment.x * 20, segment.y * 20, 20, 20); // schaalfix
        });

        ctx.globalAlpha = 1; // reset transparantie
    });
}

// update spelerslijst bij game join
socket.on("update_game_players", data => {
    if (!data.players || data.players.length === 0) {
        return;
    }

    let playerList = data.players.map(p => p === username ? `${p} (you)` : p);
    playerList[playerList.length - 1] += ` (${data.players.length})`; // laatste speler krijgt het totaal

    document.getElementById("players").innerText = playerList.join(", ");
    updateGameSize(data.players.length);

    spawnSnakes(data.players);

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

function updateGameSize(playerCount) {
    canvasSize = Math.min(300 + (playerCount - 1) * 100, 600); // schalen op basis van spelers
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    
    console.log(`speelveld aangepast: ${canvasSize} x ${canvasSize}`);
}

// luisteren naar terugkeer event
socket.on("return_lobby", data => {
    window.location.assign(`/lobby.html?code=${data.code}`);
});

// speler stemt om terug te keren naar lobby
document.getElementById("returnButton").addEventListener("click", () => {
    socket.emit("return_to_lobby", { code, username });
});

// debugging disconnects
socket.on("disconnect", reason => {
    console.warn(`⚡ Verbinding verbroken: ${reason}`);
});