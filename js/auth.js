const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("message");
const authForm = document.getElementById("authForm");
const loginBtn = document.getElementById("loginBtn");

authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    message.textContent = "";
    loginBtn.textContent = "Logging in...";
    loginBtn.disabled = true;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
        await auth.signInWithEmailAndPassword(email, password);
        window.location.href = '../Research/research.html';
    } catch (error) {
        console.error(error);
        message.textContent = error.message;
        loginBtn.textContent = "Log In";
        loginBtn.disabled = false;
    }
});

auth.onAuthStateChanged((user) => {
    if (user) {
        window.location.href = '../Research/research.html';
    }
});
