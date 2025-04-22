function login() {
    const name = document.getElementById("username").value.trim();
    const pw = document.getElementById("password").value.trim();

    fetch("http://127.0.0.1:51234/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, password: pw })
    })
    .then(res => res.json().then(data => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
        if (ok) {
            sessionStorage.setItem("username", name);
            sessionStorage.setItem("loggedIn", "true");
            window.location.href = "/index.html";
        } else {
            document.getElementById("error").innerText = data.message || "Login mislukt";
        }
    });
}

function register() {
    const name = document.getElementById("username").value.trim();
    const pw = document.getElementById("password").value.trim();

    fetch("http://127.0.0.1:51234/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, password: pw })
    })
    .then(res => res.json().then(data => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
        if (ok) {
            sessionStorage.setItem("username", name);
            sessionStorage.setItem("loggedIn", "true");
            window.location.href = "/index.html";        
        } else {
            document.getElementById("error").innerText = data.message || "Registratie mislukt";
        }
    });
}

function goBack() {
    window.location.href = "/index.html";
}