// Tabs wisselen
document.addEventListener("DOMContentLoaded", () => {
    const tabs = document.querySelectorAll(".tab");
    const contents = document.querySelectorAll(".tab-content");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.tab;

            tabs.forEach(t => t.classList.remove("active"));
            contents.forEach(c => c.classList.remove("active"));

            tab.classList.add("active");
            document.getElementById(target).classList.add("active");
        });
    });

    const username = sessionStorage.getItem("username");
    const loggedIn = sessionStorage.getItem("loggedIn") === "true";

    if (!loggedIn) {
        window.location.href = "/index.html";
        return;
    }

    document.getElementById("currentUsername").innerText = username;
    loadStats(username);
});

function loadStats(username) {
    // kijk eerst of stats al in sessionStorage zitten
    const cached = sessionStorage.getItem("userStats");
    if (cached) {
        const s = JSON.parse(cached);
        renderStats(s);
        sessionStorage.removeItem("userStats"); // 1x tonen
    }

    // en tegelijk: vernieuwde versie ophalen (async)
    fetch("/get_stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success && data.stats) {
            renderStats(data.stats);
        }
    });
}

function renderStats(s) {
    const statsDiv = document.getElementById("statistics");
    statsDiv.innerHTML = `
        <h2>Statistics</h2>
        <ul>
            <li>snake wins: ${s.snake_wins}</li>
            <li>snake losses: ${s.snake_losses}</li>
            <li>snake highscore: ${s.snake_highscore}</li>
            <li>pong wins: ${s.pong_wins}</li>
            <li>pong losses: ${s.pong_losses}</li>
            <li>totaal aantal wins: ${s.total_wins}</li>
        </ul>
    `;
}

// Terug naar home
function goBack() {
    window.location.href = "/index.html";
}

// Popup helpers
function openPopup(html) {
    document.getElementById("popupContent").innerHTML = html;
    document.getElementById("popupOverlay").style.display = "flex";
}

function closePopup() {
    document.getElementById("popupOverlay").style.display = "none";
}

// Naam wijzigen
function openChangeName() {
    openPopup(`
        <h3>Naam wijzigen</h3>
        <input type="text" id="newName" placeholder="Nieuwe naam" maxlength="20"><br>
        <input type="password" id="confirmPassword" placeholder="Wachtwoord ter bevestiging"><br>
        <button onclick="submitNameChange()">Bevestigen</button>
        <button onclick="closePopup()">Annuleren</button>
    `);
}

// Wachtwoord wijzigen
function openChangePassword() {
    openPopup(`
        <h3>Wachtwoord wijzigen</h3>
        <input type="password" id="oldPassword" placeholder="Huidig wachtwoord"><br>
        <span class="toggle-password" onclick="togglePassword('oldPassword', this)">👁️</span>
        <input type="password" id="newPassword" placeholder="Nieuw wachtwoord"><br>
        <span class="toggle-password" onclick="togglePassword('newPassword', this)">👁️</span>
        <button onclick="submitPasswordChange()">Bevestigen</button>
        <button onclick="closePopup()">Annuleren</button>
    `);
}

function submitNameChange() {
    const oldName = sessionStorage.getItem("username");
    const newName = document.getElementById("newName").value.trim();
    const password = document.getElementById("confirmPassword").value.trim();

    if (!newName || !password) return;

    fetch("/change_username", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_name: oldName, new_name: newName, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            sessionStorage.setItem("username", newName);
            loadStats(newName);
            document.getElementById("currentUsername").innerText = newName;
            closePopup();
            showNotification("Gebruikersnaam gewijzigd!");
        } else {
            alert(data.message || "Mislukt");
        }
    });
}

function submitPasswordChange() {
    const username = sessionStorage.getItem("username");
    const oldPassword = document.getElementById("oldPassword").value.trim();
    const newPassword = document.getElementById("newPassword").value.trim();

    if (!oldPassword || !newPassword) return;

    fetch("/change_password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, old_password: oldPassword, new_password: newPassword })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            closePopup();
            showNotification("Wachtwoord gewijzigd!");
        } else {
            alert(data.message || "Mislukt");
        }
    });
}

function showNotification(message) {
    const note = document.createElement("div");
    note.innerText = message;
    note.style.position = "fixed";
    note.style.top = "20px";
    note.style.right = "20px";
    note.style.padding = "10px 15px";
    note.style.background = "#4CAF50";
    note.style.color = "white";
    note.style.borderRadius = "5px";
    note.style.zIndex = 1000;
    document.body.appendChild(note);

    setTimeout(() => note.remove(), 2500);
}

function togglePassword(id, icon) {
    const input = document.getElementById(id);
    const isVisible = input.type === "text";
    input.type = isVisible ? "password" : "text";
}