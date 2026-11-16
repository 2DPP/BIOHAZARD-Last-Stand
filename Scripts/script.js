"use strict";

const screens = document.querySelectorAll(".screen");
const navigationButtons = document.querySelectorAll("[data-screen]");
const highScoreValue = document.querySelector("#high-score-value");
const canvas = document.querySelector("#game-canvas");

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
        drawPlaceholderEnvironment();
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

function drawPlaceholderEnvironment() {
    const context = canvas.getContext("2d");
    const { width, height } = canvas;

    context.fillStyle = "#101613";
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "rgba(151, 164, 120, 0.1)";
    context.lineWidth = 1;
    for (let x = 0; x <= width; x += 48) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
    }
    for (let y = 0; y <= height; y += 48) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
    }

    context.fillStyle = "#9aa878";
    context.fillRect(width / 2 - 5, height / 2 - 5, 10, 10);
}

navigationButtons.forEach((button) => {
    button.addEventListener("click", () => {
        showScreen(button.dataset.screen);
    });
});

displayHighScore();
