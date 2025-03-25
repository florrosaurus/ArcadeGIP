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
const returnButton = document.getElementById("returnButton");
const warningIcon = document.getElementById("warningIcon");

// pong parameters
let playerList = [];
let readyVotes = [];
let totalPlayers = 0;
let gameStarted = false;
let countdown = null;
let countdownValue = null;
let canvasSize = 500;
let paddles = {};
let playerPosition = null;
const paddleSize = 80;
let paddleSpeed = 5;
let direction = 0;

const keyMap = {
    ArrowUp: -1, ArrowDown: 1,
    z: -1, s: 1,
    ArrowLeft: -1, ArrowRight: 1,
    q: -1, d: 1
};

// speler joint game room
socket.emit("join_game", { code, username });

socket.on("update_game_players", data => {
    playerList = data.players;
    const inLobby = data.players_in_lobby;

    document.getElementById("players").innerText = playerList.map(p => p === username ? `${p} (you)` : p).join(", ");
    document.getElementById("playersInGameCount").innerText = `(${playerList.length + inLobby}/4 total)`;
    document.getElementById("inLobbyOnly").innerText = `${inLobby} in lobby`;

    updateGameSize(playerList.length);

    const valid = [2, 4].includes(playerList.length);
    if (!valid) {
        warningIcon.style.display = "inline";
        warningIcon.innerText = "⚠️";
        warningIcon.title = "pong kan alleen met 2 of 4 spelers gespeeld worden";
        readyButton.disabled = true;
        rematchButton.disabled = true;
    } else {
        warningIcon.style.display = "none";
        if (!gameStarted && countdown === null) {
            readyButton.disabled = false;
            rematchButton.disabled = false;
        }
    }

    if (!gameStarted) drawWaitingState();
});

socket.on("update_ready_votes", data => {
    readyVotes = data.votes;
    totalPlayers = data.totalPlayers;
    readyCounter.innerText = `(${readyVotes.length}/${totalPlayers})`;
});

socket.on("update_rematch_votes", data => {
    rematchCounter.innerText = `(${data.votes.length}/${data.totalPlayers})`;
});

socket.on("start_countdown", () => {
    if (![2, 4].includes(playerList.length)) return resetToLobbyState();

    readyButton.style.display = "none";
    rematchButton.style.display = "none";
    returnButton.disabled = true;
    gameStarted = false;

    clearInterval(countdown);

    let counter = 3;
    countdownValue = counter;
    countdown = setInterval(() => {
        countdownValue = counter;
        drawWaitingState();
        counter--;
        if (counter < 0) {
            clearInterval(countdown);
            countdownValue = null;
            gameStarted = true;
            startGame();
        }
    }, 1000);
});

readyButton.addEventListener("click", () => {
    socket.emit("player_ready", { code, username });
    readyButton.disabled = true;
});

rematchButton.addEventListener("click", () => {
    socket.emit("player_rematch_vote", { code, username });
    rematchButton.disabled = true;
});

returnButton.addEventListener("click", () => {
    socket.emit("return_to_lobby", { code, username });
});

socket.on("return_lobby", data => {
    window.location.assign(`/lobby.html?code=${data.code}`);
});

socket.on("disconnect", reason => {
    console.warn(`⚡ Verbinding verbroken: ${reason}`);
});

// canvas
function updateGameSize(playerCount) {
    canvasSize = Math.min(300 + (playerCount - 1) * 100, 600);
    canvas.width = canvasSize;
    canvas.height = canvasSize;
}

function resetToLobbyState() {
    clearInterval(countdown);
    countdownValue = null;
    gameStarted = false;
    readyButton.style.display = "inline-block";
    rematchButton.style.display = "none";
    readyButton.disabled = false;
    rematchButton.disabled = false;
    returnButton.disabled = false;
    drawWaitingState();
}

function drawWaitingState() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.textAlign = "center";

    if (countdownValue !== null) {
        ctx.fillText(countdownValue, canvas.width / 2, canvas.height / 2);
    } else if (!gameStarted) {
        pass
    }
}

// spel starten
function startGame() {
    setupPaddles();
    gameStarted = true;
    rematchButton.style.display = "inline-block";
    rematchButton.disabled = false;
    returnButton.disabled = false;
    rematchCounter.innerText = `(0/${playerList.length})`;
}

// paddles instellen
function setupPaddles() {
    const midY = canvas.height / 2;
    const midX = canvas.width / 2;
    paddles = {};
    const sides = ['left', 'right', 'top', 'bottom'];

    playerList.forEach((name, index) => {
        const side = sides[index];
        const isVertical = side === 'left' || side === 'right';

        paddles[name] = {
            side,
            x: side === 'left' ? 20 : side === 'right' ? canvas.width - 30 : midX - paddleSize / 2,
            y: side === 'top' ? 20 : side === 'bottom' ? canvas.height - 30 : midY - paddleSize / 2,
            width: isVertical ? 10 : paddleSize,
            height: isVertical ? paddleSize : 10,
            color: getColor(index),
            alive: true
        };

        if (name === username) playerPosition = side;
    });

    drawPaddles();
}

function drawPaddles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    Object.entries(paddles).forEach(([name, paddle]) => {
        if (!paddle.alive) return;
        ctx.fillStyle = paddle.color;
        ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    });

    if (countdownValue !== null) {
        ctx.fillStyle = "white";
        ctx.font = "40px Arial";
        ctx.fillText(countdownValue, canvas.width / 2, canvas.height / 2);
    }
}

function getColor(index) {
    return ['red', 'blue', 'green', 'yellow'][index] || 'white';
}

// beweging
function moveOwnPaddle() {
    const p = paddles[username];
    if (!p || !p.alive || direction === 0) return;

    if (p.side === 'left' || p.side === 'right') {
        p.y += direction * paddleSpeed;
        p.y = Math.max(0, Math.min(canvas.height - p.height, p.y));
    } else {
        p.x += direction * paddleSpeed;
        p.x = Math.max(0, Math.min(canvas.width - p.width, p.x));
    }

    socket.emit("pong_move", {
        code,
        username,
        x: p.x,
        y: p.y
    });

    drawPaddles();
}

// key handlers
window.addEventListener("keydown", e => {
    if (!gameStarted) return;
    const keys = Object.keys(keyMap);

    if (keys.includes(e.key)) {
        if (['left', 'right'].includes(playerPosition) && ['z', 's', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            direction = keyMap[e.key];
        }
        if (['top', 'bottom'].includes(playerPosition) && ['q', 'd', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            direction = keyMap[e.key];
        }
    }
});

window.addEventListener("keyup", e => {
    direction = 0;
});

// loop
setInterval(() => {
    if (gameStarted) moveOwnPaddle();
}, 1000 / 60);

// updates van andere spelers
socket.on("update_paddles", data => {
    Object.entries(data).forEach(([name, pos]) => {
        if (paddles[name]) {
            paddles[name].x = pos.x;
            paddles[name].y = pos.y;
        }
    });
    if (gameStarted) drawPaddles();
});