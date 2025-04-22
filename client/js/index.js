// nieuwe lobby aanmaken
function createLobby() {
    fetch("http://127.0.0.1:51234/create_lobby", { method: "POST" })
        .then(response => response.json()) // json response ophalen
        .then(data => {
            // stuur gebruiker naar lobby met gegenereerde code
            window.location.href = `/lobby.html?code=${data.code}`;
        })
        .catch(error => console.error("Error:", error));
}

// bestaande lobby joinen
function joinLobby() {
    let code = document.getElementById("lobbyCode").value.toUpperCase(); // invoer naar hoofdletters
    fetch("http://127.0.0.1:51234/join_lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code })
    })
    .then(response => {
        if (!response.ok) throw new Error("Lobby not found");
        return response.json();
    })
    .then(data => {
        // stuur gebruiker naar lobby als code klopt
        window.location.href = `/lobby.html?code=${code}`;
    })
    .catch(error => alert(error.message)); // toon foutmelding als lobby niet bestaat
}

function updateLoginStatus() {
    const loginBox = document.getElementById("loginStatus");
    const username = sessionStorage.getItem("username");
    const loggedIn = sessionStorage.getItem("loggedIn") === "true";

    if (loginBox) {
        loginBox.innerText = loggedIn ? `Logged in as ${username}` : "Not logged in";
    }
}

// logout
function logout() {
    const username = sessionStorage.getItem("username");
    fetch("/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username })
    }).then(() => {
        sessionStorage.removeItem("username");
        sessionStorage.removeItem("loggedIn");

        // dropdown dicht
        if (document.getElementById("loginDropdown")) {
            document.getElementById("loginDropdown").style.display = "none";
        }

        window.location.reload();
    }).catch(err => {
        console.error("[logout] Error while logging out:", err);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const loginBox = document.getElementById("loginStatus");
    const dropdown = document.getElementById("loginDropdown");

    // dropdown sowieso dicht bij start
    if (dropdown) dropdown.style.display = "none";

    updateLoginStatus();

    if (loginBox) {
        loginBox.onclick = () => {
            const loggedIn = sessionStorage.getItem("loggedIn") === "true";
            if (!loggedIn) {
                window.location.href = "/login.html";
            } else {
                // toggle dropdown
                dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
            }
        };
    }

    // klik buiten dropdown = sluiten
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#loginStatus") && !e.target.closest("#loginDropdown")) {
            if (dropdown) dropdown.style.display = "none";
        }
    });

    // extra fallback na delay
    setTimeout(updateLoginStatus, 100);
});

// bij tabfocus
window.addEventListener("focus", updateLoginStatus);