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
const currentGameName = "pong";

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

let ball = null;
let ballInterval = null;
let isHost = false;

let scores = {};
let winner = null;
let winnerEmitted = false;
let isDead = false;

const keyMap = {
    ArrowUp: -1, ArrowDown: 1,
    z: -1, s: 1,
    ArrowLeft: -1, ArrowRight: 1,
    q: -1, d: 1
};

// speler joint game room
socket.emit("join_game", { code, username, game: currentGameName });
socket.emit("trigger_sync", { code, game: currentGameName });

socket.on("update_game_players", data => {
    playerList = data.players;
    isHost = playerList[0] === username;
    const inLobby = data.players_in_lobby || 0;
    const inOtherGames = data.players_in_other_games || 0;
    const combined = data.total || (playerList.length + inLobby + inOtherGames);

    document.getElementById("players").innerText = playerList.map(p => p === username ? `${p} (you)` : p).join(", ");
    document.getElementById("playersInGameCount").innerText = `(${combined}/4 total)`;
    document.getElementById("inLobbyOnly").innerText = `${inLobby} in lobby`;
    document.getElementById("inOtherGames").innerText = `${inOtherGames} in other games`;
    
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
    if (data.game !== currentGameName) return;
    readyVotes = data.votes;
    totalPlayers = data.totalPlayers;
    readyCounter.innerText = `(${readyVotes.length}/${totalPlayers})`;
});

socket.on("update_rematch_votes", data => {
    if (data.game !== currentGameName) return;
    rematchCounter.innerText = `(${data.votes.length}/${data.totalPlayers})`;
});

socket.on("start_countdown", data => {
    if (data.game !== currentGameName) return;
    if (![2, 4].includes(playerList.length)) return resetToLobbyState();

    setupPaddles();
    setupBall();
    readyButton.style.display = "none";
    rematchButton.style.display = "none";
    returnButton.disabled = true;
    gameStarted = false;
    winner = null;
    isDead = false;

    clearInterval(countdown);

    let counter = 3;
    countdownValue = counter;
    countdown = setInterval(() => {
        countdownValue = counter;
        drawPaddles();
        counter--;
        if (counter < 0) {
            clearInterval(countdown);
            countdownValue = null;
            startGame();
        }
    }, 1000);
});

readyButton.addEventListener("click", () => {
    socket.emit("player_ready", { code, username, game: currentGameName });
    readyButton.disabled = true;
});

rematchButton.addEventListener("click", () => {
    socket.emit("player_rematch_vote", { code, username, game: currentGameName });
    rematchButton.disabled = true;
});

returnButton.addEventListener("click", () => {
    socket.emit("return_to_lobby", { code, username, game: currentGameName });
});

socket.on("return_lobby", data => {
    window.location.assign(`/lobby.html?code=${data.code}`);
});

socket.on("disconnect", reason => {
    console.warn(`⚡ Verbinding verbroken: ${reason}`);
});

// canvas
function updateGameSize(playerCount) {
    if (playerCount === 2) {
        canvas.width = 700;
        canvas.height = 400;
        paddleSpeed = 5;
    } else {
        canvas.width = 600;
        canvas.height = 600;
        paddleSpeed = 6.5;
    }
}

function handleElimination(side) {
    const target = Object.entries(paddles).find(([_, p]) => p.side === side);
    if (!target) return;
    const [name, paddle] = target;

    paddle.alive = false;

    const aliveCount = Object.values(paddles).filter(p => p.alive).length;
    if (aliveCount === 1) {
        const lastPlayer = Object.entries(paddles).find(([_, p]) => p.alive)?.[0];
        if (lastPlayer) {
            scores[lastPlayer] = (scores[lastPlayer] || 0) + 1;
            winner = {
                name: lastPlayer,
                color: paddles[lastPlayer].color
            };
        }
        isDead = true;
        gameStarted = false;
        clearInterval(ballInterval);
        drawPaddles();

        if (isHost && !winnerEmitted && winner) {
            socket.emit("winner_update", {
                code,
                winner: winner.name,
                color: winner.color,
                scores,
                game: currentGameName
            });
            winnerEmitted = true;
        }           

        rematchButton.style.display = "inline-block";
        rematchButton.disabled = false;
        returnButton.disabled = false;
        rematchCounter.innerText = `(0/${playerList.length})`;
    }
}

function resetToLobbyState() {
    clearInterval(countdown);
    clearInterval(ballInterval);
    countdownValue = null;
    gameStarted = false;
    ball = null;
    isDead = false;
    winner = null;

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
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, ball?.radius || 8, 0, 2 * Math.PI);
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.fillText(countdownValue, canvas.width / 2, canvas.height / 2);
    }
}

// spel starten
function startGame() {
    setupPaddles();
    setupBall();
    gameStarted = true;
    isDead = false;
    winner = null;

    playerList.forEach(p => scores[p] ??= 0);

    rematchButton.style.display = "none";
    returnButton.disabled = true;
    rematchCounter.innerText = `(0/${playerList.length})`;

    if (isHost) {
        ballInterval = setInterval(() => {
            updateBall();
            socket.emit("ball_update", {
                code,
                x: ball.x,
                y: ball.y
            });
        }, 1000 / 60);
    }
}

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

        ctx.fillStyle = "white";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        if (paddle.side === 'left') {
            ctx.fillText(name, paddle.x + 20, paddle.y + paddle.height / 2);
        } else if (paddle.side === 'right') {
            ctx.fillText(name, paddle.x - 20, paddle.y + paddle.height / 2);
        } else if (paddle.side === 'top') {
            ctx.fillText(name, paddle.x + paddle.width / 2, paddle.y + 20);
        } else {
            ctx.fillText(name, paddle.x + paddle.width / 2, paddle.y - 10);
        }
    });

    if (ball) {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, 2 * Math.PI);
        ctx.fillStyle = "white";
        ctx.fill();
    }

    if (countdownValue !== null) {
        ctx.fillStyle = "white";
        ctx.font = "40px Arial";
        ctx.fillText(countdownValue, canvas.width / 2, canvas.height / 2);
    }

    if (winner) {
        ctx.fillStyle = winner.color;
        ctx.font = "30px Arial";
        ctx.fillText(`${winner.name} heeft gewonnen!`, canvas.width / 2, canvas.height / 2 + 40);
    } else if (isDead) {
        ctx.fillStyle = "red";
        ctx.font = "30px Arial";
        ctx.fillText(`GAME OVER`, canvas.width / 2, canvas.height / 2 + 40);
    }

    drawScoreboard();
}

function setupBall() {
    const angle = Math.random() * Math.PI * 2;
    const speed = 5;
    ball = {
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 8
    };
}

function updateBall() {
    if (!ball || !gameStarted) return;

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (playerList.length === 2) {
        if (ball.x < 0) return handleKill('left');
        if (ball.x > canvas.width) return handleKill('right');
        if (ball.y <= 0 || ball.y >= canvas.height) ball.vy *= -1;
    }

    if (playerList.length === 4) {
        const killZones = {
            left: ball.x < 0,
            right: ball.x > canvas.width,
            top: ball.y < 0,
            bottom: ball.y > canvas.height
        };

        for (const [side, condition] of Object.entries(killZones)) {
            if (condition) {
                const target = Object.entries(paddles).find(([_, p]) => p.side === side);
                if (target) {
                    const [name, paddle] = target;
                    if (paddle.alive) {
                        handleElimination(side);
                    }

                    // reflecteer en duw bal buiten muur
                    if (side === 'left') {
                        ball.vx *= -1;
                        ball.x = ball.radius;
                    } else if (side === 'right') {
                        ball.vx *= -1;
                        ball.x = canvas.width - ball.radius;
                    } else if (side === 'top') {
                        ball.vy *= -1;
                        ball.y = ball.radius;
                    } else if (side === 'bottom') {
                        ball.vy *= -1;
                        ball.y = canvas.height - ball.radius;
                    }

                    break;
                }
            }
        }
    }

    // paddle collision
    Object.values(paddles).forEach(p => {
        if (!p.alive) return;
        if (
            ball.x + ball.radius > p.x &&
            ball.x - ball.radius < p.x + p.width &&
            ball.y + ball.radius > p.y &&
            ball.y - ball.radius < p.y + p.height
        ) {
            if (p.side === 'left' || p.side === 'right') {
                ball.vx *= -1.05;
            } else {
                ball.vy *= -1.05;
            }

            // clamp snelheid
            ball.vx = Math.max(-10, Math.min(10, ball.vx));
            ball.vy = Math.max(-10, Math.min(10, ball.vy));
        }
    });

    drawPaddles();
}

function handleKill(side) {
    const loser = Object.entries(paddles).find(([_, p]) => p.side === side)?.[0];
    const winnerName = playerList.find(p => p !== loser);

    if (winnerName) {
        scores[winnerName]++;
        winner = {
            name: winnerName,
            color: paddles[winnerName].color
        };
    }

    isDead = true;
    gameStarted = false;
    clearInterval(ballInterval);
    drawPaddles();

    if (isHost) {
        socket.emit("winner_update", {
            code,
            winner: winnerName,
            color: paddles[winnerName]?.color,
            scores,
            game: currentGameName
        });        
    }

    rematchButton.style.display = "inline-block";
    rematchButton.disabled = false;
    returnButton.disabled = false;
    rematchCounter.innerText = `(0/${playerList.length})`;
}

function drawScoreboard() {
    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.textAlign = "left";

    let y = 20;
    playerList.forEach(p => {
        ctx.fillStyle = paddles[p].color;
        ctx.fillText(`${p}: ${scores[p] || 0}`, 10, y);
        y += 20;
    });
}

socket.on("sync_ball", data => {
    if (!isHost && ball) {
        ball.x = data.x;
        ball.y = data.y;
        drawPaddles();
    }
});

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

window.addEventListener("keyup", () => {
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

socket.on("winner_update", data => {
    if (!isHost) {
        winner = {
            name: data.winner,
            color: data.color
        };
        scores = data.scores;
        isDead = true;
        gameStarted = false;
        clearInterval(ballInterval);
        drawPaddles();
        rematchButton.style.display = "inline-block";
        rematchButton.disabled = false;
        returnButton.disabled = false;
        rematchCounter.innerText = `(0/${playerList.length})`;
    }
});