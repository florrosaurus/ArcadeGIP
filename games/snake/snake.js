const socket = io("http://127.0.0.1:51234");

const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get("code");

let username = sessionStorage.getItem("username") || `player${Math.floor(Math.random() * 1000)}`;
sessionStorage.setItem("username", username);

// game parameters
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const readyButton = document.getElementById("readyButton");
const readyCounter = document.getElementById("readyCounter");
const rematchButton = document.getElementById("rematchButton");
const rematchCounter = document.getElementById("rematchCounter");

// snake parameters
let snakes = {};
let playerList = []; // globale variabele om spelerslijst op te slaan
const colors = ["red", "blue", "green", "yellow"]; // kleuren per speler
let readyVotes = [];
let totalPlayers = 0;
let gameStarted = false;
let countdown = null;
let moveInterval = null;
let canChangeDirection = true;
let isDead = false;
let winner = null;

const keyMap = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right", z: "up", q: "left"
};

// speler joint game room
socket.emit("join_game", { code, username });

// snakes spawnen
function spawnSnakes(players) {
    const padding = 3; // afstand van de rand
    const gridSize = Math.floor(canvasSize / 20); // aantal cellen in grid

    const positions = [
        { x: padding, y: Math.floor(gridSize / 2), direction: "right" },  // links → rechts
        { x: gridSize - padding - 1, y: Math.floor(gridSize / 2), direction: "left" },  // rechts → links
        { x: Math.floor(gridSize / 2), y: padding, direction: "down" },  // boven → beneden
        { x: Math.floor(gridSize / 2), y: gridSize - padding - 1, direction: "up" }  // onder → boven
    ];

    players.forEach((player, index) => {
        if (index >= positions.length) return; // max 4
        const { x, y, direction } = positions[index];
        snakes[player] = {
            body: [
                { x, y },
                { x: x - (direction === "right" ? 1 : direction === "left" ? -1 : 0), y: y - (direction === "down" ? 1 : direction === "up" ? -1 : 0) },
                { x: x - (direction === "right" ? 2 : direction === "left" ? -2 : 0), y: y - (direction === "down" ? 2 : direction === "up" ? -2 : 0) }
            ],
            direction,
            color: colors[index],
            alive: true
        };
    });
    drawSnakes();
}

// canvas tekenen
function drawSnakes() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    Object.keys(snakes).forEach(player => {
        const snake = snakes[player];
        if (!snake.alive) return;
        ctx.fillStyle = snake.color;
        snake.body.forEach((seg, i) => {
            ctx.globalAlpha = (player === username && i % 2 === 0) ? 0.7 : 1;
            ctx.fillRect(seg.x * 20, seg.y * 20, 20, 20);
        });
        ctx.globalAlpha = 1;
    });
    if (winner) {
        ctx.fillStyle = winner.color;
        ctx.font = "30px Arial";
        ctx.fillText(`${winner.name} heeft gewonnen!`, canvas.width / 2 - 100, canvas.height / 2);
    } else if (isDead) {
        ctx.fillStyle = "red";
        ctx.font = "30px Arial";
        ctx.fillText("GAME OVER", canvas.width / 2 - 80, canvas.height / 2);
    }
}

// keyboard controls
window.addEventListener("keydown", e => {
    if (!gameStarted || !snakes[username] || !snakes[username].alive || !canChangeDirection || winner) return;
    const dir = keyMap[e.key];
    if (dir && isValidDirection(dir)) {
        snakes[username].direction = dir;
        canChangeDirection = false;
        socket.emit("snake_move", { code, username, direction: dir });
    }
});

// direction validatie
function isValidDirection(newDir) {
    const current = snakes[username].direction;
    return !(
        (current === "up" && newDir === "down") ||
        (current === "down" && newDir === "up") ||
        (current === "left" && newDir === "right") ||
        (current === "right" && newDir === "left")
    );
}

// snake verplaatsen
function moveSnake(player) {
    const snake = snakes[player];
    if (!snake.alive) return;
    const head = { ...snake.body[0] };
    if (snake.direction === "up") head.y--;
    if (snake.direction === "down") head.y++;
    if (snake.direction === "left") head.x--;
    if (snake.direction === "right") head.x++;
    if (head.x < 0 || head.x >= canvas.width / 20 || head.y < 0 || head.y >= canvas.height / 20) {
        if (player === username) handleDeath();
        snake.alive = false;
        checkForWinner();
        return;
    }
    for (let p in snakes) {
        if (!snakes[p].alive) continue;
        for (let seg of snakes[p].body) {
            if (seg.x === head.x && seg.y === head.y) {
                if (player === username) handleDeath();
                snake.alive = false;
                checkForWinner();
                return;
            }
        }
    }
    snake.body.unshift(head);
    snake.body.pop();
}

// dood gaan
function handleDeath() { isDead = true; }

// winnaar checken
function checkForWinner() {
    const alive = Object.keys(snakes).filter(p => snakes[p].alive);
    if (alive.length === 1) {
        const last = alive[0];
        winner = { name: last, color: snakes[last].color };
        clearInterval(moveInterval);
        drawSnakes();
        rematchButton.style.display = "inline-block";
        rematchCounter.style.display = "inline-block";
        rematchButton.disabled = false;
        rematchCounter.innerText = `(0/${playerList.length})`;

        document.getElementById("returnButton").disabled = false; // unlock hier
    }
}

// countdown starten + snakes opnieuw spawnen
socket.on("start_countdown", () => {
    rematchButton.style.display = "none";
    rematchCounter.style.display = "none";
    readyButton.style.display = "none";
    readyButton.disabled = false;

    rematchCounter.innerText = `(0/${playerList.length})`; // teller reset

    winner = null;
    isDead = false;
    gameStarted = false;
    clearInterval(moveInterval);

    spawnSnakes(playerList); // spawn nieuwe snakes

    let counter = 3;
    countdown = setInterval(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawSnakes(); // countdown overlay
        ctx.fillStyle = "black";
        ctx.font = "50px Arial";
        ctx.fillText(counter, canvas.width / 2 - 10, canvas.height / 2);
        counter--;
        if (counter < 0) {
            clearInterval(countdown);
            gameStarted = true;
            document.getElementById("returnButton").disabled = true; // disable hier!
            moveInterval = setInterval(gameLoop, 200);
        }
    }, 1000);
});

// snake loop
function gameLoop() {
    canChangeDirection = true;
    Object.keys(snakes).forEach(player => moveSnake(player));
    drawSnakes();
}

// ready knop
readyButton.addEventListener("click", () => {
    socket.emit("player_ready", { code, username });
    readyButton.disabled = true;
});

// rematch knop
rematchButton.addEventListener("click", () => {
    socket.emit("player_rematch_vote", { code, username });
    rematchButton.disabled = true;
});

// snake richting sync
socket.on("update_snake_direction", data => {
    if (snakes[data.username]) {
        snakes[data.username].direction = data.direction;
    }
});

// ready votes teller
socket.on("update_ready_votes", data => {
    readyVotes = data.votes;
    totalPlayers = data.totalPlayers;
    readyCounter.innerText = `(${readyVotes.length}/${totalPlayers})`;
});

// rematch votes teller
socket.on("update_rematch_votes", data => {
    rematchCounter.innerText = `(${data.votes.length}/${data.totalPlayers})`;
});

// terug naar lobby knop
socket.on("return_lobby", data => {
    window.location.assign(`/lobby.html?code=${data.code}`);
});

document.getElementById("returnButton").addEventListener("click", () => {
    socket.emit("return_to_lobby", { code, username });
});

// disconnect log
socket.on("disconnect", reason => {
    console.warn(`⚡ Verbinding verbroken: ${reason}`);
});

// spelers + warning updates
socket.on("update_game_players", data => {
    if (!data.players || data.players.length === 0) return;
    playerList = data.players;
    document.getElementById("players").innerText = data.players.map(p => p === username ? `${p} (you)` : p).join(", ") + ` (${data.players.length})`;
    updateGameSize(data.players.length);
    spawnSnakes(data.players);

    // toon waarschuwing
    let warningIcon = document.getElementById("warningIcon");
    if (data.players.length < 2) {
        warningIcon.style.display = "inline";
        warningIcon.innerText = "⚠️";
        warningIcon.title = "te weinig spelers voor snake";

        // lock knoppen
        readyButton.disabled = true;
        rematchButton.disabled = true;
    } else {
        warningIcon.style.display = "none";
        // unlock knoppen
        if (!gameStarted && !winner) {
            readyButton.disabled = false;
            rematchButton.disabled = false;
        }
    }
});


function updateGameSize(playerCount) {
    canvasSize = Math.min(300 + (playerCount - 1) * 100, 600); // schalen op basis van spelers
    canvas.width = canvasSize;
    canvas.height = canvasSize;
}

// terug naar lobby
socket.on("return_lobby", data => {
    window.location.assign(`/lobby.html?code=${data.code}`);
});

// lobby knop
document.getElementById("returnButton").addEventListener("click", () => {
    socket.emit("return_to_lobby", { code, username });
});

// debugging disconnects
socket.on("disconnect", reason => {
    console.warn(`⚡ Verbinding verbroken: ${reason}`);
});