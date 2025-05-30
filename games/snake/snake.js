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

// snake parameters
let snakes = {};
let playerList = [];
let readyVotes = [];
let totalPlayers = 0;
let gameStarted = false;
let countdown = null;
let countdownValue = null;
let moveInterval = null;
let canChangeDirection = true;
let isDead = false;
let winner = null;
let winnerEmitted = false;
let foodItems = [];
let scores = {};
let amIFoodMaster = false;

const colors = ["red", "blue", "green", "yellow"];
const keyMap = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right", z: "up", q: "left"
};

const currentGameName = "snake";
socket.emit("join_game", {
    code,
    username,
    game: currentGameName
});
socket.emit("trigger_sync", {
    code,
    game: "snake"
});

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
    
    snakes = {};
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
    scores = {};
    players.forEach(p => scores[p] = 0);
    updateScoreboard();
}

// canvas tekenen
function drawSnakes() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawFood();

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

    if (countdownValue !== null && !gameStarted) {
        ctx.fillStyle = "white";
        ctx.font = "40px 'Press Start 2P', monospace";
        ctx.textAlign = "center";
        ctx.fillText(countdownValue, canvas.width / 2, canvas.height / 2 - 60);
    }    

    if (winner && !gameStarted) {
        ctx.save();
        ctx.fillStyle = winner.color;
        ctx.font = "20px 'Press Start 2P', monospace";
        ctx.textAlign = "center";
        ctx.shadowColor = winner.color;
        ctx.shadowBlur = 15;
        ctx.fillText(`${winner.name} wins!`, canvas.width / 2, canvas.height / 2 + 30);
        ctx.restore();
    } else if (isDead && !gameStarted && !winner) {
        ctx.save();
        ctx.fillStyle = "red";
        ctx.font = "30px 'Press Start 2P', monospace";
        ctx.textAlign = "center";
        ctx.shadowColor = "red";
        ctx.shadowBlur = 15;
        ctx.fillText("GAME OVER", canvas.width / 2 - 80, canvas.height / 2 + 50); 
}};

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

window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", " "].includes(e.key)) {
        e.preventDefault(); // blokkeert scroll
    }
}, { passive: false });

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
    let ateFood = false;
    foodItems = foodItems.filter(food => {
        if (food.x === head.x && food.y === head.y) {
            ateFood = true;
            scores[player]++;
            return false;
        }
        return true;
    });
    
    if (ateFood) {
        spawnSingleFood();
        updateScoreboard();
    } else {
        snake.body.pop();
    }
    
    snake.body.unshift(head);    
}

// dood gaan
function handleDeath() {
    isDead = true;
    console.log(`[DEBUG] handleDeath() called by ${username}`);

    setTimeout(() => {
        const alive = Object.keys(snakes).filter(p => snakes[p].alive);
        console.log(`[DEBUG] Alive snakes after death:`, alive);

        if (!gameStarted && !winnerEmitted) {
            checkForWinner();
        } else {
            console.log(`[DEBUG] Winner already emitted, skipping checkForWinner`);
        }
    }, 50);
}

// winnaar checken
function checkForWinner() {
    const alive = Object.keys(snakes).filter(p => snakes[p].alive);
    console.log("[CHECKWINNER] Levende spelers:", alive);

    if (winnerEmitted) {
        console.log("[DEBUG] Winner already emitted, skipping checkForWinner");
        return;
    }

    if (alive.length === 1) {
        const last = alive[0];
        console.log("[CHECKWINNER] " + last + " is de enige overlevende");
    
        winner = { name: last, color: snakes[last].color };
        clearInterval(moveInterval);
        gameStarted = false;
        drawSnakes();
        rematchButton.style.display = "inline-block";
        rematchButton.disabled = false;
        returnButton.disabled = false;
        rematchCounter.innerText = `(0/${playerList.length})`;
    
        winnerEmitted = true;
    
        if (amIFoodMaster) {
            console.log("[WINNER_EMIT] Ik ben de foodmaster, emit winner_update");
            socket.emit("winner_update", {
                code,
                winner: last,
                color: snakes[last].color,
                scores,
                game: "snake"
            });
        } else {
            console.log("[WINNER_EMIT] Ik ben GEEN foodmaster, ik emit niet");
        }

    } else if (alive.length === 0) {
        console.log("[CHECKWINNER] niemand leeft nog");
        // evt: no winner
    } else {
        console.log("[CHECKWINNER] nog meerdere alive, geen winnaar");
    }
}

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

socket.on("update_snake_direction", data => {
    if (snakes[data.username]) {
        snakes[data.username].direction = data.direction;
    }
});

socket.on("start_countdown", data => {
    if (data.game !== currentGameName) return;
    if (playerList.length < 2) return resetToLobbyState();

    readyButton.style.display = "none";
    rematchButton.style.display = "none";
    returnButton.disabled = true;
    winner = null;
    winnerEmitted = false;
    isDead = false;
    gameStarted = false;
    clearInterval(moveInterval);
    clearInterval(countdown);

    spawnSnakes(playerList);

    scores = {};
    playerList.forEach(p => scores[p] = 0);
    updateScoreboard();

    spawnFood();

    let counter = 3;
    countdownValue = counter;
    countdown = setInterval(() => {
        countdownValue = counter;
        drawSnakes();
        counter--;
        if (counter < 0) {
            clearInterval(countdown);
            countdownValue = null;
            gameStarted = true;
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

socket.on("update_game_players", data => {
    playerList = data.players;
    amIFoodMaster = playerList[0] === username;

    const inLobby = data.players_in_lobby || 0;
    const inOtherGames = data.players_in_other_games || 0;
    const combined = data.total || (playerList.length + inLobby + inOtherGames);

    document.getElementById("players").innerText = playerList.map(p => p === username ? `${p} (you)` : p).join(", ");
    document.getElementById("playersInGameCount").innerText = `(${combined}/4 total)`;
    document.getElementById("inLobbyOnly").innerText = `${inLobby} in lobby`;
    document.getElementById("inOtherGames").innerText = `${inOtherGames} in other games`;

    if (playerList.length < 2 && (gameStarted || countdown !== null)) {
        resetToLobbyState();
    }

    updateGameSize(playerList.length);
    spawnSnakes(playerList);

    if (amIFoodMaster && foodItems.length === 0) spawnFood(); // alleen speler 1 spawnt voedsel
    
    if (playerList.length < 2) {
        warningIcon.style.display = "inline";
        warningIcon.innerText = "!";
        warningIcon.title = "te weinig spelers voor snake";

        // lock knoppen
        readyButton.disabled = true;
        rematchButton.disabled = true;
        returnButton.disabled = false;
    } else {
        warningIcon.style.display = "none";
        // unlock knoppen
        if (!gameStarted && !winner && countdown === null) {
            readyButton.disabled = false;
            rematchButton.disabled = false;
            returnButton.disabled = false;
        }
    }

    if (!gameStarted) drawSnakes();
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

socket.on("sync_food", data => {
    foodItems = data.foodItems;
    drawSnakes();
});

function updateGameSize(playerCount) {
    canvasSize = Math.min(300 + (playerCount - 1) * 100, 600);
    canvas.width = canvasSize;
    canvas.height = canvasSize;
}

function resetToLobbyState() {
    clearInterval(countdown);
    clearInterval(moveInterval);
    countdownValue = null;
    gameStarted = false;
    isDead = false;
    winner = null;
    readyButton.style.display = "inline-block";
    rematchButton.style.display = "none";
    readyButton.disabled = false;
    rematchButton.disabled = false;
    returnButton.disabled = false;
    drawSnakes();
}

// voedsel spawnen, niet op snakes
function spawnFood() {
    foodItems = [];
    const gridSize = canvas.width / 20;

    while(foodItems.length < playerList.length) {
        const food = {
            x: Math.floor(Math.random() * gridSize),
            y: Math.floor(Math.random() * gridSize)
        };
        if (!foodInSnake(food)) foodItems.push(food);
    }
    socket.emit("food_update", {code, foodItems});
}

// check of voedsel in snake
function foodInSnake(food) {
    return Object.values(snakes).some(snake => 
        snake.body.some(seg => seg.x === food.x && seg.y === food.y));
}

// voedsel tekenen
function drawFood() {
    ctx.fillStyle = "orange";
    foodItems.forEach(food => ctx.fillRect(food.x * 20, food.y * 20, 20, 20));
}

// nieuw voedselstuk spawnen
function spawnSingleFood() {
    if (!amIFoodMaster) return;
    const gridSize = canvas.width / 20;
    let newFood;

    do {
        newFood = {
            x: Math.floor(Math.random() * gridSize),
            y: Math.floor(Math.random() * gridSize)
        };
    } while(foodInSnake(newFood) || foodOnFood(newFood));

    foodItems.push(newFood);
    socket.emit("food_update", {code, foodItems});
}

// check voedsel collision met bestaande voedselstukken
function foodOnFood(food) {
    return foodItems.some(f => f.x === food.x && f.y === food.y);
}

// scorebord
function updateScoreboard() {
    const scoresUl = document.getElementById("scores");
    scoresUl.innerHTML = "";
    playerList.forEach(player => {
        const li = document.createElement("li");
        li.style.color = snakes[player].color;
        li.innerText = `${player}: ${scores[player] || 0}`;
        scoresUl.appendChild(li);
    });
}

socket.on("return_lobby", (data) => {
    const username = sessionStorage.getItem("username");
    if (username) {
        fetch("/get_stats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.stats) {
                // sla stats tijdelijk op in sessionStorage
                sessionStorage.setItem("userStats", JSON.stringify(data.stats));
            }
        });
    }

    window.location.href = "/lobby.html?code=" + data.code;
});

socket.on("winner_update", data => {
    if (amIFoodMaster) return;

    console.log("[WINNER_RECEIVED] update ontvangen:", data);

    winner = {
        name: data.winner,
        color: data.color
    };
    scores = data.scores || {};
    isDead = true;
    gameStarted = false;
    clearInterval(moveInterval);
    winnerEmitted = false;
    drawSnakes();

    rematchButton.style.display = "inline-block";
    rematchButton.disabled = false;
    returnButton.disabled = false;
    rematchCounter.innerText = `(0/${playerList.length})`;
});

socket.on("disconnect", reason => {
    console.warn(`⚡ Verbinding verbroken: ${reason}`);
});