import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { app } from "../submit/firebase.js";

const auth = getAuth(app);

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");
const btnLogin = document.getElementById("btnLogin");

function showLoginError(text) {
  if (!loginError) return;
  loginError.textContent = text || "";
  loginError.style.display = text ? "block" : "none";
}

function readReason() {
  const params = new URLSearchParams(window.location.search);
  return params.get("reason") || "";
}

const reason = readReason();
if (reason === "unauthorized") {
  showLoginError("Ingen tilgang. Logg inn med en admin-bruker.");
}
if (reason === "login_required") {
  showLoginError("Du må logge inn for å fortsette.");
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "/admin/index.html";
  }
});

btnLogin?.addEventListener("click", async () => {
  try {
    showLoginError("");
    const email = (loginEmail?.value || "").trim();
    const password = loginPassword?.value || "";
    if (!email || !password) throw new Error("Fyll inn e-post og passord.");
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showLoginError(err?.message || "Kunne ikke logge inn.");
  }
});
