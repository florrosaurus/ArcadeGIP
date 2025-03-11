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