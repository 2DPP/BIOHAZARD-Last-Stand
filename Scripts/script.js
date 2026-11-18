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
    damageCooldown: 0,
    level: 1,
    experience: 0,
    experienceToNextLevel: 40,
    pickupRange: 90,
    isMoving: false
};
const camera = {
    x: 0,
    y: 0
};
const enemies = [];
const projectiles = [];
const experienceOrbs = [];
const impactEffects = [];
const enemyTypes = {
    zombie: { health: 30, speed: 54, damage: 8, score: 10, experience: 15, radius: 13 },
    hound: { health: 22, speed: 100, damage: 12, score: 25, experience: 20, radius: 11 },
    mutant: { health: 90, speed: 34, damage: 18, score: 50, experience: 40, radius: 19 },
    tyrant: { health: 350, speed: 25, damage: 25, score: 500, experience: 100, radius: 30 }
};
const handgun = {
    damage: 20,
    cooldown: 0.55,
    range: 560,
    projectileSpeed: 520,
    projectileCount: 1
};
const upgrades = [
    {
        name: "Reinforced Rounds",
        description: "Increase handgun damage by 8.",
        apply: () => { handgun.damage += 8; }
    },
    {
        name: "Quick Trigger",
        description: "Fire the handgun 15% faster.",
        apply: () => { handgun.cooldown = Math.max(0.18, handgun.cooldown * 0.85); }
    },
    {
        name: "Field Medic",
        description: "Recover 25 health immediately.",
        apply: () => { player.health = Math.min(player.maxHealth, player.health + 25); }
    },
    {
        name: "Combat Training",
        description: "Increase movement speed by 25.",
        apply: () => { player.speed += 25; }
    },
    {
        name: "Expanded Magazine",
        description: "Fire one additional handgun projectile.",
        apply: () => { handgun.projectileCount += 1; }
    },
    {
        name: "Scavenger",
        description: "Increase experience pickup range by 35.",
        apply: () => { player.pickupRange += 35; }
    }
];

let animationFrameId = null;
let previousTime = 0;
let gameIsRunning = false;
let enemySpawnTimer = 0;
let nextEnemyId = 1;
let handgunCooldown = 0;
let levelUpPending = false;
let survivalTime = 0;
let score = 0;
let kills = 0;
let bossesDefeated = 0;
let lastScoredMinute = 0;
let nextBossTime = 60;
let visualTime = 0;
let screenShakeTimer = 0;
let muzzleFlashTimer = 0;
let lastPlayerX = 0;
let lastPlayerY = 0;

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
    highScoreValue.textContent = formatScore(getSavedHighScore());
}

function getSavedHighScore() {
    try {
        return Number.parseInt(localStorage.getItem("biohazardHighScore") || "0", 10);
    } catch (error) {
        console.warn("High scores are unavailable in this browser context.", error);
        return 0;
    }
}

function saveHighScore() {
    const personalBest = Math.max(score, getSavedHighScore());

    try {
        localStorage.setItem("biohazardHighScore", String(personalBest));
    } catch (error) {
        console.warn("High score could not be saved in this browser context.", error);
    }

    return personalBest;
}

function formatScore(value) {
    return String(value).padStart(6, "0");
}

function startGame() {
    player.x = world.width / 2;
    player.y = world.height / 2;
    player.health = player.maxHealth;
    player.damageCooldown = 0;
    player.level = 1;
    player.experience = 0;
    player.experienceToNextLevel = 40;
    player.pickupRange = 90;
    player.speed = 220;
    handgun.damage = 20;
    handgun.cooldown = 0.55;
    handgun.projectileCount = 1;
    enemies.length = 0;
    projectiles.length = 0;
    experienceOrbs.length = 0;
    impactEffects.length = 0;
    enemySpawnTimer = 0;
    nextEnemyId = 1;
    handgunCooldown = 0;
    levelUpPending = false;
    survivalTime = 0;
    score = 0;
    kills = 0;
    bossesDefeated = 0;
    lastScoredMinute = 0;
    nextBossTime = 60;
    visualTime = 0;
    closeLevelUpOverlay();
    updateCamera();
    updateHealthBar();
    updateExperienceBar();
    updateScoreboard();
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
    visualTime += deltaTime;
    updatePlayer(deltaTime);
    updateSurvival(deltaTime);
    updateEnemies(deltaTime);
    if (!gameIsRunning) {
        animationFrameId = null;
        return;
    }
    updateCombat(deltaTime);
    updateExperience(deltaTime);
    drawGame();

    if (!gameIsRunning) {
        animationFrameId = null;
        return;
    }

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

    player.isMoving = horizontalDirection !== 0 || verticalDirection !== 0;
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

function updateSurvival(deltaTime) {
    survivalTime += deltaTime;
    const completedMinutes = Math.floor(survivalTime / 60);

    if (completedMinutes > lastScoredMinute) {
        score += (completedMinutes - lastScoredMinute) * 100;
        lastScoredMinute = completedMinutes;
    }

    if (survivalTime >= nextBossTime) {
        spawnEnemy("tyrant");
        nextBossTime += 60;
    }

    updateScoreboard();
}

function updateEnemies(deltaTime) {
    enemySpawnTimer -= deltaTime;
    if (enemySpawnTimer <= 0) {
        spawnEnemy();
        enemySpawnTimer = Math.max(0.45, 1.8 - survivalTime * 0.01);
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

            if (player.health === 0) {
                finishGame();
                return;
            }
        }
    });

    removeDefeatedEnemies();
}

function spawnEnemy(type = chooseEnemyType()) {
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

    const enemyType = enemyTypes[type];
    const difficultyMultiplier = 1 + survivalTime / 120;
    enemies.push({
        id: nextEnemyId,
        type,
        x: Math.max(16, Math.min(world.width - 16, x)),
        y: Math.max(16, Math.min(world.height - 16, y)),
        radius: enemyType.radius,
        speed: enemyType.speed * Math.min(difficultyMultiplier, 1.8),
        health: Math.round(enemyType.health * difficultyMultiplier),
        maxHealth: Math.round(enemyType.health * difficultyMultiplier),
        damage: enemyType.damage,
        score: enemyType.score,
        experience: enemyType.experience
    });
    nextEnemyId += 1;
}

function chooseEnemyType() {
    const roll = Math.random();

    if (survivalTime >= 40 && roll < 0.15) {
        return "mutant";
    }
    if (survivalTime >= 20 && roll < 0.35) {
        return "hound";
    }
    return "zombie";
}

function removeDefeatedEnemies() {
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
        if (enemies[index].health <= 0) {
            const enemy = enemies[index];
            
            // Spawn pixelated blood splatter particles on death
            for (let b = 0; b < 6; b++) {
                impactEffects.push({
                    x: enemy.x + (Math.random() - 0.5) * 20,
                    y: enemy.y + (Math.random() - 0.5) * 20,
                    life: 0.35,
                    isBloodSplatter: true
                });
            }

            // Trigger screen shake on Boss/Tyrant defeat
            if (enemy.type === "tyrant") {
                screenShakeTimer = 0.4;
                bossesDefeated += 1;
            }

            experienceOrbs.push({
                x: enemy.x,
                y: enemy.y,
                value: enemy.experience
            });
            score += enemy.score;
            kills += 1;
            enemies.splice(index, 1);
            updateScoreboard();
        }
    }
}

function updateCombat(deltaTime) {
    handgunCooldown = Math.max(0, handgunCooldown - deltaTime);
    muzzleFlashTimer = Math.max(0, muzzleFlashTimer - deltaTime);
    screenShakeTimer = Math.max(0, screenShakeTimer - deltaTime);

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
                
                // Pixel blood impact effect on hit
                impactEffects.push({ 
                    x: enemy.x, 
                    y: enemy.y, 
                    life: 0.2, 
                    isBloodSplatter: false 
                });
            }
        });
    });

    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
        if (projectiles[index].life <= 0 || projectiles[index].hit) {
            projectiles.splice(index, 1);
        }
    }

    impactEffects.forEach((effect) => {
        effect.life -= deltaTime;
    });
    for (let index = impactEffects.length - 1; index >= 0; index -= 1) {
        if (impactEffects[index].life <= 0) {
            impactEffects.splice(index, 1);
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

    muzzleFlashTimer = 0.08; // Flash duration

    for (let index = 0; index < handgun.projectileCount; index += 1) {
        const spread = (index - (handgun.projectileCount - 1) / 2) * 0.12;
        const angle = Math.atan2(distanceY, distanceX) + spread;
        projectiles.push({
            x: player.x,
            y: player.y,
            radius: 4,
            damage: handgun.damage,
            velocityX: Math.cos(angle) * handgun.projectileSpeed,
            velocityY: Math.sin(angle) * handgun.projectileSpeed,
            life: handgun.range / handgun.projectileSpeed,
            hit: false
        });
    }
}

function updateExperience() {
    for (let index = experienceOrbs.length - 1; index >= 0; index -= 1) {
        const orb = experienceOrbs[index];
        const distanceX = player.x - orb.x;
        const distanceY = player.y - orb.y;
        const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

        if (distance <= player.pickupRange) {
            player.experience += orb.value;
            experienceOrbs.splice(index, 1);
        }
    }

    if (player.experience >= player.experienceToNextLevel) {
        player.experience -= player.experienceToNextLevel;
        player.level += 1;
        player.experienceToNextLevel = Math.floor(player.experienceToNextLevel * 1.35);
        openLevelUpOverlay();
    }

    updateExperienceBar();
}

function updateExperienceBar() {
    const experienceBar = document.querySelector("#experience-bar");
    const levelValue = document.querySelector("#level-value");
    const experienceValue = document.querySelector("#experience-value");
    const experiencePercent = (player.experience / player.experienceToNextLevel) * 100;
    experienceBar.style.width = `${experiencePercent}%`;
    levelValue.textContent = String(player.level).padStart(2, "0");
    experienceValue.textContent = `${player.experience}/${player.experienceToNextLevel}`;
}

function openLevelUpOverlay() {
    if (levelUpPending) {
        return;
    }

    levelUpPending = true;
    gameIsRunning = false;
    renderUpgradeChoices();
    document.querySelector("#level-up-overlay").hidden = false;
}

function closeLevelUpOverlay() {
    levelUpPending = false;
    document.querySelector("#level-up-overlay").hidden = true;
}

function renderUpgradeChoices() {
    const upgradeOptions = document.querySelector("#upgrade-options");
    upgradeOptions.replaceChildren();

    getRandomUpgrades(3).forEach((upgrade) => {
        const option = document.createElement("button");
        option.className = "upgrade-option";
        option.innerHTML = `<strong>${upgrade.name}</strong><span>${upgrade.description}</span>`;
        option.addEventListener("click", () => {
            upgrade.apply();
            updateHealthBar();
            closeLevelUpOverlay();
            gameIsRunning = true;
            previousTime = 0;
            animationFrameId = requestAnimationFrame(gameLoop);
        });
        upgradeOptions.appendChild(option);
    });
}

function getRandomUpgrades(amount) {
    return [...upgrades].sort(() => Math.random() - 0.5).slice(0, amount);
}

function updateHealthBar() {
    const healthBar = document.querySelector("#health-bar");
    const healthValue = document.querySelector("#health-value");
    const healthPercent = (player.health / player.maxHealth) * 100;
    healthBar.style.width = `${healthPercent}%`;
    healthValue.textContent = `${player.health}/${player.maxHealth}`;
}

function finishGame() {
    gameIsRunning = false;
    const personalBest = saveHighScore();
    document.querySelector("#final-score").textContent = formatScore(score);
    document.querySelector("#final-time").textContent = formatSurvivalTime();
    document.querySelector("#final-kills").textContent = String(kills).padStart(3, "0");
    document.querySelector("#final-level").textContent = String(player.level).padStart(2, "0");
    document.querySelector("#final-bosses").textContent = String(bossesDefeated).padStart(2, "0");
    document.querySelector("#personal-best-value").textContent = formatScore(personalBest);
    showScreen("game-over");
}

function formatSurvivalTime() {
    const minutes = Math.floor(survivalTime / 60);
    const seconds = Math.floor(survivalTime % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateScoreboard() {
    document.querySelector("#survival-time").textContent = formatSurvivalTime();
    document.querySelector("#score-value").textContent = String(score).padStart(6, "0");
    document.querySelector("#kills-value").textContent = String(kills).padStart(3, "0");
    document.querySelector("#bosses-value").textContent = String(bossesDefeated).padStart(2, "0");
}

function drawGame() {
    context.save();

    // Apply screen shake offset if active
    let shakeX = 0;
    let shakeY = 0;
    if (screenShakeTimer > 0) {
        shakeX = (Math.random() - 0.5) * 10;
        shakeY = (Math.random() - 0.5) * 10;
    }

    context.translate(-camera.x + shakeX, -camera.y + shakeY);

    drawUrbanEnvironment();
    experienceOrbs.forEach(drawExperienceOrb);
    enemies.forEach(drawEnemy);
    projectiles.forEach(drawProjectile);
    impactEffects.forEach(drawImpactEffect);
    drawPlayer();

    context.restore();

    // Draw Muzzle Flash overlay on canvas when firing
    if (muzzleFlashTimer > 0) {
        context.fillStyle = "rgba(255, 220, 100, 0.25)";
        context.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw Red Damage Indicator Vignette when player gets hit recently
    if (player.damageCooldown > 0.4) {
        context.fillStyle = "rgba(184, 46, 36, 0.35)";
        context.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// Draw pixel blood effects & impact flashes
function drawImpactEffect(effect) {
    if (effect.isBloodSplatter) {
        context.fillStyle = "#8a1c14";
        context.fillRect(effect.x - 2, effect.y - 2, 4, 4);
    } else {
        const radius = (1 - effect.life / 0.2) * 10;
        context.fillStyle = "rgba(220, 50, 40, 0.8)";
        context.fillRect(effect.x - radius, effect.y - radius, radius * 2, radius * 2);
    }
}

function drawExperienceOrb(orb) {
    const pulse = Math.sin(visualTime * 10 + orb.x) * 2;
    // Retro glowing green Herb / Bio-hazard vial pixel style
    context.fillStyle = "#38b070";
    context.fillRect(orb.x - 3, orb.y - 3 - pulse/2, 6, 6 + pulse);
    context.fillStyle = "#a3ffcc";
    context.fillRect(orb.x - 1, orb.y - 1 - pulse/2, 2, 2);
}

function drawImpactEffect(effect) {
    const progress = 1 - effect.life / 0.16;
    const size = progress * 14;
    context.strokeStyle = `rgba(255, 100, 80, ${effect.life / 0.16})`;
    context.lineWidth = 2;
    // Pixelated cross slash impact
    context.strokeRect(effect.x - size/2, effect.y - size/2, size, size);
}

function drawUrbanEnvironment() {
    const { width, height } = world;

    // 1. Dark atmospheric asphalt background with an eerie tint
    context.fillStyle = "#090f0c";
    context.fillRect(0, 0, width, height);

    // 2. Ruined city sidewalks (darker, grittier stone blocks)
    context.fillStyle = "#121a15";
    context.fillRect(0, 0, width, 90);
    context.fillRect(0, height - 90, width, 90);
    context.fillRect(0, 0, 90, height);
    context.fillRect(width - 90, 0, 90, height);

    // Main street area
    context.fillStyle = "#17221b";
    context.fillRect(90, 90, width - 180, height - 180);

    // Cracked pavement grid / tile lines
    context.strokeStyle = "rgba(32, 48, 38, 0.45)";
    context.lineWidth = 2;
    for (let x = 90; x < width - 90; x += 72) {
        context.beginPath();
        context.moveTo(x, 90);
        context.lineTo(x, height - 90);
        context.stroke();
    }
    for (let y = 90; y < height - 90; y += 72) {
        context.beginPath();
        context.moveTo(90, y);
        context.lineTo(width - 90, y);
        context.stroke();
    }

    drawRoadMarkings();

    // 3. Bloodstains & biohazard waste splatters on the asphalt
    drawBloodStains(width, height);

    // 4. Abandoned Buildings (Raccoon City style with barred/broken windows)
    for (let x = 20; x < width; x += 300) {
        drawBuilding(x, 15, 60, 60, true);
        drawBuilding(x, height - 75, 60, 60, false);
    }
    for (let y = 20; y < height; y += 300) {
        drawBuilding(15, y, 60, 60, false);
        drawBuilding(width - 75, y, 60, 60, true);
    }
    
    // 5. Wrecked Vehicles / Abandoned Cars & Barricades
    for (let x = 200; x < width - 200; x += 450) {
        drawAbandonedCar(x, 110, "horizontal");
        drawAbandonedCar(x + 180, height - 150, "horizontal");
    }

    // 6. Broken Streetlights & Warning Signs
    for (let x = 160; x < width; x += 380) {
        drawBrokenStreetLight(x, 55);
        drawBrokenStreetLight(x, height - 55);
    }

    // 7. Scattered Street Debris
    for (let y = 220; y < height - 200; y += 280) {
        drawDebris(280, y);
        drawDebris(width - 300, y + 150);
    }
}

function drawRoadMarkings() {
    context.fillStyle = "#3f5245";
    for (let x = 150; x < world.width - 150; x += 90) {
        context.fillRect(x, world.height / 2 - 3, 45, 6);
    }
    for (let y = 150; y < world.height - 150; y += 90) {
        context.fillRect(world.width / 2 - 3, y, 6, 45);
    }
}

function drawBloodStains(width, height) {
    // Dark crimson organic blood pools scattered across the street
    context.fillStyle = "rgba(102, 18, 18, 0.45)";
    context.beginPath();
    context.ellipse(width * 0.3, height * 0.35, 35, 18, 0.5, 0, Math.PI * 2);
    context.ellipse(width * 0.7, height * 0.65, 50, 22, -0.3, 0, Math.PI * 2);
    context.ellipse(width * 0.5, height * 0.8, 25, 12, 1.2, 0, Math.PI * 2);
    context.fill();
}

function drawBuilding(x, y, width, height, hasWarningSign) {
    // Ruined concrete structure
    context.fillStyle = "#050807";
    context.fillRect(x, y, width, height);
    context.strokeStyle = "#2d3d31";
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);

    // Broken / Dark windows with red emergency glow
    context.fillStyle = "#471916";
    context.fillRect(x + 10, y + 10, 12, 14);
    context.fillRect(x + 38, y + 10, 12, 14);
    context.fillRect(x + 10, y + 36, 12, 14);
    context.fillRect(x + 38, y + 36, 12, 14);

    // Optional Raccoon City Police / Umbrella Corp warning sign on wall
    if (hasWarningSign) {
        context.fillStyle = "#a89020";
        context.fillRect(x + 18, y + 24, 24, 12);
        context.fillStyle = "#111";
        context.fillRect(x + 22, y + 28, 16, 4);
    }
}

function drawAbandonedCar(x, y, orientation) {
    // Wrecked pixel police cruiser / civilian car
    context.fillStyle = "#1a241f"; // rusted chassis
    context.fillRect(x, y, 70, 36);

    // Windshield & windows (shattered / dark)
    context.fillStyle = "#0d1210";
    context.fillRect(x + 18, y + 4, 34, 10);
    
    // Emergency light bar on top (broken red/blue)
    context.fillStyle = "rgba(180, 30, 30, 0.7)";
    context.fillRect(x + 28, y - 4, 8, 4);
    context.fillStyle = "rgba(30, 80, 180, 0.7)";
    context.fillRect(x + 38, y - 4, 8, 4);

    // Headlights / debris around car
    context.fillStyle = "#555";
    context.fillRect(x - 4, y + 6, 4, 8);
    context.fillRect(x - 4, y + 22, 4, 8);
}

function drawBrokenStreetLight(x, y) {
    context.fillStyle = "#1d2620";
    context.fillRect(x - 3, y, 6, 36);
    // Bent top arm
    context.fillRect(x - 12, y - 4, 24, 6);
    
    // Flickering dim red/yellow broken bulb
    const flicker = Math.sin(visualTime * 20) > 0 ? 0.3 : 0.1;
    context.fillStyle = `rgba(210, 170, 60, ${flicker})`;
    context.fillRect(x - 4, y + 2, 8, 6);
}

function drawDebris(x, y) {
    // Scattered wreckage / trash / barrels
    context.fillStyle = "#1f2b23";
    context.fillRect(x, y, 22, 10);
    context.fillStyle = "#2d1c1a"; // rusted metal barrel
    context.fillRect(x + 12, y - 8, 12, 16);
}

function drawPlayer() {
    const { x, y, width, height } = player;
    // Walking pixel bob animation
    const bob = player.isMoving ? Math.sin(visualTime * 14) * 3 : 0;
    const flash = player.damageCooldown > 0.55;

    // Drop shadow
    context.fillStyle = "rgba(0, 0, 0, 0.5)";
    context.fillRect(x - width / 2 - 4, y + height / 2 - 2, width + 8, 6);

    if (flash) {
        context.fillStyle = "rgba(239, 92, 76, 0.9)";
        context.fillRect(x - 12, y - 18 + bob, 24, 36);
        return;
    }

    // Resident Evil Survival Suit / Tactical Gear Sprite Layout (Pixel-Art Grid)
    // Hair / Cap
    context.fillStyle = "#4a443b";
    context.fillRect(x - 6, y - 16 + bob, 12, 5);

    // Face / Head
    context.fillStyle = "#dfd5b3";
    context.fillRect(x - 5, y - 11 + bob, 10, 6);

    // Tactical Vest / Jacket (Green/Dark S.T.A.R.S. style)
    context.fillStyle = "#415443";
    context.fillRect(x - 9, y - 5 + bob, 18, 16);
    
    // Vest Straps / Details
    context.fillStyle = "#253127";
    context.fillRect(x - 2, y - 5 + bob, 4, 16);

    // Handgun Weapon Sprite held in hand (Classic RE handgun silhouette)
    context.fillStyle = "#111";
    context.fillRect(x + 6, y - 1 + bob, 8, 3);
    context.fillStyle = "#b0b0b0";
    context.fillRect(x + 10, y - 2 + bob, 4, 2);

    // Pants (Dark tactical trousers)
    context.fillStyle = "#1d261f";
    context.fillRect(x - 8, y + 11 + bob, 7, 9);
    context.fillRect(x + 1, y + 11 + bob, 7, 9);

    // Boots
    context.fillStyle = "#0c110d";
    context.fillRect(x - 9, y + 19 + bob, 7, 5);
    context.fillRect(x + 2, y + 19 + bob, 7, 5);
}

function drawEnemy(enemy) {
    const { x, y } = enemy;
    // Shadow
    context.fillStyle = "rgba(0, 0, 0, 0.5)";
    context.fillRect(x - enemy.radius, y + enemy.radius - 2, enemy.radius * 2, 6);

    if (enemy.type === "hound") {
        // Infected Cerberus Dog Sprite
        context.fillStyle = "#3d473d";
        context.fillRect(x - 14, y - 8, 28, 14);
        // Glowing red eyes
        context.fillStyle = "#ff3322";
        context.fillRect(x + 8, y - 6, 3, 3);
        // Legs
        context.fillStyle = "#1f261f";
        context.fillRect(x - 10, y + 6, 5, 6);
        context.fillRect(x + 5, y + 6, 5, 6);
        return;
    }

    if (enemy.type === "mutant" || enemy.type === "tyrant") {
        // Boss / Heavy Mutant Sprite (Tyrant trench coat silhouette)
        const isTyrant = enemy.type === "tyrant";
        context.fillStyle = isTyrant ? "#4d2830" : "#3b4a3a";
        context.fillRect(x - enemy.radius, y - enemy.radius, enemy.radius * 2, enemy.radius * 2);
        
        // Glowing infection core or angry eyes
        context.fillStyle = isTyrant ? "#ffaa22" : "#cc3333";
        context.fillRect(x - 6, y - 6, 12, 6);

        // Heavy boots / base
        context.fillStyle = "#111";
        context.fillRect(x - enemy.radius + 4, y + enemy.radius - 4, 10, 6);
        context.fillRect(x + enemy.radius - 14, y + enemy.radius - 4, 10, 6);
        return;
    }

    // Classic Resident Evil Zombie Sprite (Decaying skin, torn jacket)
    // Head & Rotting hair
    context.fillStyle = "#596656";
    context.fillRect(x - 6, y - 13, 12, 10);
    // Hollow red eyes
    context.fillStyle = "#cc2222";
    context.fillRect(x - 4, y - 9, 2, 2);
    context.fillRect(x + 2, y - 9, 2, 2);

    // Decaying body / tattered clothes
    context.fillStyle = "#424d3f";
    context.fillRect(x - 9, y - 3, 18, 16);
    
    // Blood stain on shirt
    context.fillStyle = "#8a2b25";
    context.fillRect(x - 4, y + 2, 8, 6);

    // Tattered pants & boots
    context.fillStyle = "#1a241b";
    context.fillRect(x - 7, y + 13, 6, 7);
    context.fillRect(x + 1, y + 13, 6, 7);
}

function drawProjectile(projectile) {
    // Crisper pixel firearm bullet with bright core
    context.fillStyle = "#ffe680";
    context.fillRect(
        projectile.x - projectile.radius,
        projectile.y - projectile.radius,
        projectile.radius * 2,
        projectile.radius * 2
    );
    context.fillStyle = "#ffffff";
    context.fillRect(projectile.x - 1, projectile.y - 1, 2, 2);
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
updateExperienceBar();
updateScoreboard();
drawGame();

navigationButtons.forEach((button) => {
    button.addEventListener("click", () => {
        showScreen(button.dataset.screen);
    });
});

displayHighScore();
