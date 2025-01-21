// voorkom scrollen via arrow keys
window.addEventListener("keydown", function(e) {
    if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].indexOf(e.code) > -1) {
        e.preventDefault();
    }
}, false);

// algemene instellingen
const canvas1 = document.getElementById("snake-game1");
const canvas2 = document.getElementById("snake-game2");
const ctx1 = canvas1.getContext("2d");
const ctx2 = canvas2.getContext("2d");

const scorePlayer1 = document.getElementById("score-player1");
const scorePlayer2 = document.getElementById("score-player2");

const startButton1 = document.getElementById("start-player1");
const startButton2 = document.getElementById("start-player2");

let player1Ready = false;
let player2Ready = false;

// basis snake instellingen
function createGame(canvas, ctx, scoreElement, controls) {
    const game = {
        snake: [{ x: 200, y: 200 }],
        direction: { x: 0, y: -10 },
        food: { x: 100, y: 100 },
        score: 0,
        gameOver: false,
        controls: controls,
    };

    function drawFood() {
        ctx.fillStyle = "red";
        ctx.fillRect(game.food.x, game.food.y, 10, 10);
    }

    function drawSnake() {
        ctx.fillStyle = "lime";
        game.snake.forEach(segment => ctx.fillRect(segment.x, segment.y, 10, 10));
    }

    function moveSnake() {
        const head = {
            x: game.snake[0].x + game.direction.x,
            y: game.snake[0].y + game.direction.y,
        };

        if (
            head.x < 0 ||
            head.y < 0 ||
            head.x >= canvas.width ||
            head.y >= canvas.height ||
            game.snake.some(segment => segment.x === head.x && segment.y === head.y)
        ) {
            game.gameOver = true;
            return;
        }

        game.snake.unshift(head);

        if (head.x === game.food.x && head.y === game.food.y) {
            game.score += 1;
            scoreElement.textContent = game.score;
            generateFood();
        } else {
            game.snake.pop();
        }
    }

    function generateFood() {
        game.food = {
            x: Math.floor(Math.random() * (canvas.width / 10)) * 10,
            y: Math.floor(Math.random() * (canvas.height / 10)) * 10,
        };
    }

    function clearCanvas() {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function gameLoop() {
        if (game.gameOver) return;

        setTimeout(() => {
            clearCanvas();
            moveSnake();
            drawFood();
            drawSnake();
            gameLoop();
        }, 100);
    }

    document.addEventListener("keydown", event => {
        const { key } = event;
        if (key === game.controls.up && game.direction.y === 0) game.direction = { x: 0, y: -10 };
        if (key === game.controls.down && game.direction.y === 0) game.direction = { x: 0, y: 10 };
        if (key === game.controls.left && game.direction.x === 0) game.direction = { x: -10, y: 0 };
        if (key === game.controls.right && game.direction.x === 0) game.direction = { x: 10, y: 0 };
    });

    generateFood();
    return { start: gameLoop };
}

// configuratie voor beide spelers
const game1 = createGame(canvas1, ctx1, scorePlayer1, {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
});
// placeholder, wordt websocket
const game2 = createGame(canvas2, ctx2, scorePlayer2, {
    up: "w",
    down: "s",
    left: "a",
    right: "d",
});

// startknoppen logic
startButton1.addEventListener("click", () => {
    player1Ready = true;
    startButton1.disabled = true;
    if (player1Ready && player2Ready) startGames();
});

startButton2.addEventListener("click", () => {
    player2Ready = true;
    startButton2.disabled = true;
    if (player1Ready && player2Ready) startGames();
});

function startGames() {
    game1.start();
    game2.start();
}