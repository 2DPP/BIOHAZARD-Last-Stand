"use strict";

const screens = document.querySelectorAll(".screen");
const navigationButtons = document.querySelectorAll("[data-screen]");
const highScoreValue = document.querySelector("#high-score-value");
const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");

const keys = new Set();
const world = {
    width: 3200,
    height: 2200
};
const player = {
    x: world.width / 2,
    y: world.height / 2,
    width: 18,
    height: 24,
    speed: 220,
    maxHealth: 100,
    health: 100,
    damageCooldown: 0
};
const camera = {
    x: 0,
    y: 0
};
const enemies = [];
const projectiles = [];
const handgun = {
    damage: 20,
    cooldown: 0.55,
    range: 560,
    projectileSpeed: 520
};

let animationFrameId = null;
let previousTime = 0;
let gameIsRunning = false;
let enemySpawnTimer = 0;
let nextEnemyId = 1;
let handgunCooldown = 0;

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
    player.x = world.width / 2;
    player.y = world.height / 2;
    player.health = player.maxHealth;
    player.damageCooldown = 0;
    enemies.length = 0;
    projectiles.length = 0;
    enemySpawnTimer = 0;
    nextEnemyId = 1;
    handgunCooldown = 0;
    updateCamera();
    updateHealthBar();
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
    updateEnemies(deltaTime);
    updateCombat(deltaTime);
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
    player.x = Math.max(halfWidth, Math.min(world.width - halfWidth, player.x));
    player.y = Math.max(halfHeight, Math.min(world.height - halfHeight, player.y));
    updateCamera();
}

function updateCamera() {
    camera.x = Math.max(0, Math.min(world.width - canvas.width, player.x - canvas.width / 2));
    camera.y = Math.max(0, Math.min(world.height - canvas.height, player.y - canvas.height / 2));
}

function updateEnemies(deltaTime) {
    enemySpawnTimer -= deltaTime;
    if (enemySpawnTimer <= 0) {
        spawnEnemy();
        enemySpawnTimer = 1.8;
    }

    player.damageCooldown = Math.max(0, player.damageCooldown - deltaTime);

    enemies.forEach((enemy) => {
        const distanceX = player.x - enemy.x;
        const distanceY = player.y - enemy.y;
        const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

        if (distance > 0) {
            enemy.x += (distanceX / distance) * enemy.speed * deltaTime;
            enemy.y += (distanceY / distance) * enemy.speed * deltaTime;
        }

        if (distance < enemy.radius + player.width / 2 && player.damageCooldown === 0) {
            player.health = Math.max(0, player.health - enemy.damage);
            player.damageCooldown = 0.75;
            updateHealthBar();
        }
    });

    removeDefeatedEnemies();
}

function spawnEnemy() {
    const side = Math.floor(Math.random() * 4);
    const padding = 30;
    let x = player.x;
    let y = player.y;

    if (side === 0) {
        x = camera.x - padding;
        y = camera.y + Math.random() * canvas.height;
    } else if (side === 1) {
        x = camera.x + canvas.width + padding;
        y = camera.y + Math.random() * canvas.height;
    } else if (side === 2) {
        x = camera.x + Math.random() * canvas.width;
        y = camera.y - padding;
    } else {
        x = camera.x + Math.random() * canvas.width;
        y = camera.y + canvas.height + padding;
    }

    enemies.push({
        id: nextEnemyId,
        x: Math.max(16, Math.min(world.width - 16, x)),
        y: Math.max(16, Math.min(world.height - 16, y)),
        radius: 13,
        speed: 54,
        health: 30,
        damage: 8
    });
    nextEnemyId += 1;
}

function removeDefeatedEnemies() {
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
        if (enemies[index].health <= 0) {
            enemies.splice(index, 1);
        }
    }
}

function updateCombat(deltaTime) {
    handgunCooldown = Math.max(0, handgunCooldown - deltaTime);
    if (handgunCooldown === 0) {
        const target = findNearestEnemy();
        if (target !== null) {
            fireHandgun(target);
            handgunCooldown = handgun.cooldown;
        }
    }

    projectiles.forEach((projectile) => {
        projectile.x += projectile.velocityX * deltaTime;
        projectile.y += projectile.velocityY * deltaTime;
        projectile.life -= deltaTime;

        enemies.forEach((enemy) => {
            const distanceX = projectile.x - enemy.x;
            const distanceY = projectile.y - enemy.y;
            const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

            if (!projectile.hit && distance < projectile.radius + enemy.radius) {
                enemy.health -= projectile.damage;
                projectile.hit = true;
            }
        });
    });

    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
        if (projectiles[index].life <= 0 || projectiles[index].hit) {
            projectiles.splice(index, 1);
        }
    }

    removeDefeatedEnemies();
}

function findNearestEnemy() {
    let nearestEnemy = null;
    let nearestDistance = handgun.range;

    enemies.forEach((enemy) => {
        const distanceX = player.x - enemy.x;
        const distanceY = player.y - enemy.y;
        const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

        if (distance < nearestDistance) {
            nearestEnemy = enemy;
            nearestDistance = distance;
        }
    });

    return nearestEnemy;
}

function fireHandgun(target) {
    const distanceX = target.x - player.x;
    const distanceY = target.y - player.y;
    const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

    projectiles.push({
        x: player.x,
        y: player.y,
        radius: 4,
        damage: handgun.damage,
        velocityX: (distanceX / distance) * handgun.projectileSpeed,
        velocityY: (distanceY / distance) * handgun.projectileSpeed,
        life: handgun.range / handgun.projectileSpeed,
        hit: false
    });
}

function updateHealthBar() {
    const healthBar = document.querySelector("#health-bar");
    const healthValue = document.querySelector("#health-value");
    const healthPercent = (player.health / player.maxHealth) * 100;
    healthBar.style.width = `${healthPercent}%`;
    healthValue.textContent = `${player.health}/${player.maxHealth}`;
}

function drawGame() {
    context.save();
    context.translate(-camera.x, -camera.y);
    drawUrbanEnvironment();
    enemies.forEach(drawZombie);
    projectiles.forEach(drawProjectile);
    drawPlayer();
    context.restore();
}

function drawUrbanEnvironment() {
    const { width, height } = world;

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
    for (let x = 16; x < width; x += 280) {
        drawBuilding(x, 16, 42, 42);
        drawBuilding(x, height - 58, 42, 42);
    }
    for (let y = 16; y < height; y += 280) {
        drawBuilding(16, y, 42, 42);
        drawBuilding(width - 58, y, 42, 42);
    }
    for (let x = 108; x < width; x += 420) {
        drawStreetLight(x, 48);
        drawStreetLight(x, height - 76);
    }
    for (let y = 208; y < height - 150; y += 360) {
        drawDebris(230, y);
        drawDebris(width - 250, y + 120);
    }
}

function drawRoadMarkings() {
    context.fillStyle = "#687254";
    for (let x = 124; x < world.width - 124; x += 70) {
        context.fillRect(x, world.height / 2 - 2, 34, 4);
    }
    for (let y = 116; y < world.height - 116; y += 70) {
        context.fillRect(world.width / 2 - 2, y, 4, 34);
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

function drawZombie(enemy) {
    const { x, y } = enemy;
    context.fillStyle = "rgba(0, 0, 0, 0.35)";
    context.fillRect(x - 11, y + 13, 22, 5);
    context.fillStyle = "#74816a";
    context.fillRect(x - 8, y - 12, 16, 11);
    context.fillStyle = "#a8a27a";
    context.fillRect(x - 5, y - 7, 3, 3);
    context.fillRect(x + 3, y - 7, 3, 3);
    context.fillStyle = "#4b5c4a";
    context.fillRect(x - 10, y - 1, 20, 19);
    context.fillStyle = "#7b302d";
    context.fillRect(x - 7, y + 8, 14, 4);
    context.fillStyle = "#202a20";
    context.fillRect(x - 8, y + 18, 6, 6);
    context.fillRect(x + 2, y + 18, 6, 6);
}

function drawProjectile(projectile) {
    context.fillStyle = "#e0c779";
    context.fillRect(
        projectile.x - projectile.radius,
        projectile.y - projectile.radius,
        projectile.radius * 2,
        projectile.radius * 2
    );
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

updateCamera();
updateHealthBar();
drawGame();

navigationButtons.forEach((button) => {
    button.addEventListener("click", () => {
        showScreen(button.dataset.screen);
    });
});

displayHighScore();
