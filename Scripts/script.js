"use strict";

const screens = document.querySelectorAll(".screen");
const navigationButtons = document.querySelectorAll("[data-screen]");
const highScoreValue = document.querySelector("#high-score-value");
const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");

const keys = new Set();
const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    width: 18,
    height: 24,
    speed: 220
};

let animationFrameId = null;
let previousTime = 0;
let gameIsRunning = false;

const allowedMovementKeys = new Set([
    "w",
    "a",
    "s",
    "d",
    "arrowup",
    "arrowleft",
    "arrowdown",
    "arrowright"
]);

function showScreen(screenId) {
    screens.forEach((screen) => {
        const isSelected = screen.id === screenId;
        screen.hidden = !isSelected;
        screen.classList.toggle("screen--active", isSelected);
    });

    if (screenId === "high-scores") {
        displayHighScore();
    }

    if (screenId === "gameplay") {
        startGame();
    } else {
        stopGame();
    }
}

function displayHighScore() {
    let savedScore = 0;

    try {
        savedScore = Number.parseInt(localStorage.getItem("biohazardHighScore") || "0", 10);
    } catch (error) {
        console.warn("High scores are unavailable in this browser context.", error);
    }

    highScoreValue.textContent = String(savedScore).padStart(6, "0");
}

function startGame() {
    player.x = canvas.width / 2;
    player.y = canvas.height / 2;
    gameIsRunning = true;
    previousTime = 0;

    if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

function stopGame() {
    gameIsRunning = false;
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function gameLoop(currentTime) {
    if (!gameIsRunning) {
        animationFrameId = null;
        return;
    }

    const deltaTime = previousTime === 0 ? 0 : Math.min((currentTime - previousTime) / 1000, 0.1);
    previousTime = currentTime;
    updatePlayer(deltaTime);
    drawGame();
    animationFrameId = requestAnimationFrame(gameLoop);
}

function updatePlayer(deltaTime) {
    let horizontalDirection = 0;
    let verticalDirection = 0;

    if (keys.has("a") || keys.has("arrowleft")) {
        horizontalDirection -= 1;
    }
    if (keys.has("d") || keys.has("arrowright")) {
        horizontalDirection += 1;
    }
    if (keys.has("w") || keys.has("arrowup")) {
        verticalDirection -= 1;
    }
    if (keys.has("s") || keys.has("arrowdown")) {
        verticalDirection += 1;
    }

    if (horizontalDirection !== 0 && verticalDirection !== 0) {
        const diagonalLength = Math.sqrt(2);
        horizontalDirection /= diagonalLength;
        verticalDirection /= diagonalLength;
    }

    player.x += horizontalDirection * player.speed * deltaTime;
    player.y += verticalDirection * player.speed * deltaTime;

    const halfWidth = player.width / 2;
    const halfHeight = player.height / 2;
    player.x = Math.max(halfWidth, Math.min(canvas.width - halfWidth, player.x));
    player.y = Math.max(halfHeight, Math.min(canvas.height - halfHeight, player.y));
}

function drawGame() {
    drawUrbanEnvironment();
    drawPlayer();
}

function drawUrbanEnvironment() {
    const { width, height } = canvas;

    context.fillStyle = "#111814";
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#1b2520";
    context.fillRect(0, 0, width, 78);
    context.fillRect(0, height - 78, width, 78);
    context.fillRect(0, 0, 74, height);
    context.fillRect(width - 74, 0, 74, height);

    context.fillStyle = "#28322a";
    context.fillRect(74, 78, width - 148, height - 156);

    context.strokeStyle = "rgba(151, 164, 120, 0.15)";
    context.lineWidth = 2;
    for (let x = 100; x < width - 74; x += 48) {
        context.beginPath();
        context.moveTo(x, 78);
        context.lineTo(x, height - 78);
        context.stroke();
    }
    for (let y = 100; y < height - 78; y += 48) {
        context.beginPath();
        context.moveTo(74, y);
        context.lineTo(width - 74, y);
        context.stroke();
    }

    drawRoadMarkings();
    drawBuilding(16, 16, 42, 42);
    drawBuilding(width - 58, 16, 42, 42);
    drawBuilding(16, height - 58, 42, 42);
    drawBuilding(width - 58, height - 58, 42, 42);
    drawStreetLight(108, 48);
    drawStreetLight(width - 108, height - 48);
    drawDebris(230, 160);
    drawDebris(width - 250, height - 175);
}

function drawRoadMarkings() {
    context.fillStyle = "#687254";
    for (let x = 124; x < canvas.width - 124; x += 70) {
        context.fillRect(x, canvas.height / 2 - 2, 34, 4);
    }
    for (let y = 116; y < canvas.height - 116; y += 70) {
        context.fillRect(canvas.width / 2 - 2, y, 4, 34);
    }
}

function drawBuilding(x, y, width, height) {
    context.fillStyle = "#0a0e0c";
    context.fillRect(x, y, width, height);
    context.strokeStyle = "#53614b";
    context.strokeRect(x + 2, y + 2, width - 4, height - 4);
    context.fillStyle = "#9b563f";
    context.fillRect(x + 10, y + 12, 6, 6);
    context.fillRect(x + 26, y + 24, 6, 6);
}

function drawStreetLight(x, y) {
    context.fillStyle = "#69765b";
    context.fillRect(x - 2, y, 4, 28);
    context.fillRect(x - 8, y - 2, 16, 4);
    context.fillStyle = "rgba(214, 193, 108, 0.5)";
    context.fillRect(x - 4, y - 6, 8, 5);
}

function drawDebris(x, y) {
    context.fillStyle = "#72745a";
    context.fillRect(x, y, 14, 5);
    context.fillRect(x + 8, y - 5, 5, 10);
}

function drawPlayer() {
    const { x, y, width, height } = player;
    context.fillStyle = "rgba(0, 0, 0, 0.35)";
    context.fillRect(x - width / 2 - 3, y + height / 2 - 1, width + 6, 5);
    context.fillStyle = "#c8c59d";
    context.fillRect(x - 6, y - 13, 12, 9);
    context.fillStyle = "#63745c";
    context.fillRect(x - 9, y - 4, 18, 19);
    context.fillStyle = "#9b3b32";
    context.fillRect(x - 9, y + 8, 18, 5);
    context.fillStyle = "#1b211a";
    context.fillRect(x - 8, y + 15, 6, 7);
    context.fillRect(x + 2, y + 15, 6, 7);
    context.fillStyle = "#c8c59d";
    context.fillRect(x + 8, y - 1, 8, 5);
}

window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (allowedMovementKeys.has(key)) {
        event.preventDefault();
        keys.add(key);
    }
});

window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
});

window.addEventListener("blur", () => {
    keys.clear();
});

window.addEventListener("resize", () => {
    if (gameIsRunning) {
        drawGame();
    }
});

drawUrbanEnvironment();
drawPlayer();

navigationButtons.forEach((button) => {
    button.addEventListener("click", () => {
        showScreen(button.dataset.screen);
    });
});

displayHighScore();
