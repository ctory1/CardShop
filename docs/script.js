const cards = [
  {
    name: "Charizard ex Special Illustration Rare",
    set: "Pokémon 151",
    market: 395,
    image: "https://images.pokemontcg.io/sv3pt5/199_hires.png",
    condition: "Near Mint"
  },
  {
    name: "Umbreon VMAX Alternate Art",
    set: "Evolving Skies",
    market: 2037,
    image: "https://images.pokemontcg.io/swsh7/215_hires.png",
    condition: "Near Mint"
  },
  {
    name: "Giratina V Alternate Art",
    set: "Lost Origin",
    market: 777,
    image: "https://images.pokemontcg.io/swsh11/186_hires.png",
    condition: "Near Mint"
  },
  {
    name: "Rayquaza VMAX Alternate Art",
    set: "Evolving Skies",
    market: 962,
    image: "https://images.pokemontcg.io/swsh7/218_hires.png",
    condition: "Light Play"
  },
  {
    name: "Lugia V Alternate Art",
    set: "Silver Tempest",
    market: 516,
    image: "https://images.pokemontcg.io/swsh12/186_hires.png",
    condition: "Near Mint"
  },
  {
    name: "Pikachu with Grey Felt Hat",
    set: "Promo",
    market: 970,
    image: "https://images.pokemontcg.io/svp/85_hires.png",
    condition: "Near Mint"
  }
];

function money(value) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 10 ? 2 : 0,
    maximumFractionDigits: value < 10 ? 2 : 0
  });
}

function hasPrice(value) {
  return Number.isFinite(value) && value > 0;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cardTemplate(card) {
  const shopPrice = card.market * 0.8;
  return `
    <div class="col-sm-6 col-lg-4">
      <article class="pokemon-card">
        <div class="card-image-wrap">
          <img src="${card.image}" alt="${card.name} card" loading="lazy">
        </div>
        <div class="card-body">
          <span class="condition">${card.condition}</span>
          <h3>${card.name}</h3>
          <p>${card.set}</p>
          <div class="price-grid">
            <span>Market</span><strong>${money(card.market)}</strong>
            <span>Our Price</span><strong>${money(shopPrice)}</strong>
          </div>
        </div>
      </article>
    </div>
  `;
}

const stockTarget = document.querySelector("#pokemonStock");
if (stockTarget) {
  stockTarget.innerHTML = cards.map(cardTemplate).join("");
}

const featuredTarget = document.querySelector("#featuredCards");
if (featuredTarget) {
  featuredTarget.innerHTML = cards.slice(0, 3).map(cardTemplate).join("");
}

const scannerVideo = document.querySelector("#camera");
const startCameraButton = document.querySelector("#startCamera");
const stopCameraButton = document.querySelector("#stopCamera");
const captureButton = document.querySelector("#capture");
const snapshotCanvas = document.querySelector("#snapshot");
const snapshotPreview = document.querySelector("#snapshotPreview");
const scannerStatus = document.querySelector("#scannerStatus");
const lookupForm = document.querySelector("#cardLookup");
const lookupResults = document.querySelector("#lookupResults");
const savedCardsTarget = document.querySelector("#savedCards");
const clearSavedCardsButton = document.querySelector("#clearSavedCards");
const cardNameInput = document.querySelector("#cardName");
const cardSetInput = document.querySelector("#cardSet");
const cardNameSuggestions = document.querySelector("#cardNameSuggestions");
const cardSetSuggestions = document.querySelector("#cardSetSuggestions");
const savedCardsBaseKey = "jc-pokepawns-scanned-cards";
const accountsKey = "jc-pokepawns-accounts";
const sessionKey = "jc-pokepawns-session";
const apiTokenKey = "jc-pokepawns-api-token";
const apiUserKey = "jc-pokepawns-api-user";
const configuredApiBaseUrl = (window.CARDSHOP_API_BASE_URL || "").replace(/\/$/, "");
let cachedSetCards = [];
let cachedSetCardsName = "";

function setScannerStatus(message) {
  if (scannerStatus) {
    scannerStatus.textContent = message;
  }
}

function getAccounts() {
  try {
    return JSON.parse(localStorage.getItem(accountsKey)) || [];
  } catch (error) {
    return [];
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(accountsKey, JSON.stringify(accounts));
}

function isValidEmail(email) {
  return /^[^\s@]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/.test(email);
}

function setEmailValidity(input) {
  if (!input) {
    return;
  }

  input.setCustomValidity(isValidEmail(input.value.trim())
    ? ""
    : "Please enter a valid email address (needs to include a domain).");
}

function hasApiBackend() {
  return Boolean(configuredApiBaseUrl);
}

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem(apiTokenKey);
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${configuredApiBaseUrl}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = response.status === 401 ? "Email or password is incorrect." : "Request failed.";
    let duplicateFields = [];
    try {
      const body = await response.json();
      message = body.message || message;
      duplicateFields = Array.isArray(body.duplicateFields) ? body.duplicateFields : [];
    } catch (error) {
      // Keep the status-based message.
    }
    const requestError = new Error(message);
    requestError.duplicateFields = duplicateFields;
    throw requestError;
  }

  return response.status === 204 ? null : response.json();
}

function setApiSession(authResponse) {
  localStorage.setItem(apiTokenKey, authResponse.token);
  localStorage.setItem(apiUserKey, JSON.stringify(authResponse.user));
}

function clearApiSession() {
  localStorage.removeItem(apiTokenKey);
  localStorage.removeItem(apiUserKey);
}

function getActiveUser() {
  if (hasApiBackend()) {
    try {
      return JSON.parse(localStorage.getItem(apiUserKey));
    } catch (error) {
      return null;
    }
  }

  const userId = localStorage.getItem(sessionKey);
  return getAccounts().find((account) => account.id === userId) || null;
}

function currentSavedCardsKey() {
  const user = getActiveUser();
  return user ? `${savedCardsBaseKey}-${user.id}` : `${savedCardsBaseKey}-guest`;
}

function formatTimestamp(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return "";
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const amPm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours.toString().padStart(2, "0")}/${minutes}/${seconds} (${amPm})`;
}

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(hash);
}

function highlightCurrentNavLink() {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".navbar-nav .nav-link").forEach((link) => {
    const linkPage = link.getAttribute("href")?.split("/").pop();
    const isActive = linkPage === currentPage;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function injectAuthControls() {
  const nav = document.querySelector(".navbar-nav");
  if (!nav || document.querySelector("#authControls")) {
    return;
  }

  nav.insertAdjacentHTML("beforeend", `
    <li class="nav-item auth-nav-item">
      <div class="auth-controls" id="authControls"></div>
    </li>
  `);

  document.body.insertAdjacentHTML("beforeend", `
    <div class="auth-modal" id="authModal" hidden>
      <div class="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <button class="auth-close" id="authClose" type="button" aria-label="Close login">&times;</button>
        <p class="eyebrow dark" id="authModeLabel">Account</p>
        <h2 id="authTitle">Sign up or log in</h2>
        <div class="auth-tabs">
          <button class="auth-tab active" id="showSignup" type="button">Sign Up</button>
          <button class="auth-tab" id="showLogin" type="button">Login</button>
        </div>
        <form class="auth-form" id="signupForm">
          <label for="signupUsername">Username</label>
          <input class="form-control" id="signupUsername" name="username" type="text" minlength="3" maxlength="12" autocomplete="username" required>
          <label for="signupEmail">Email</label>
          <input class="form-control" id="signupEmail" name="email" type="email" autocomplete="email" pattern="^[^\\s@]+@(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}$" title="Please enter a valid email address (needs to include a domain)." required>
          <label for="signupPassword">Password</label>
          <div class="password-field">
            <input class="form-control" id="signupPassword" name="password" type="password" autocomplete="new-password" required>
            <button class="password-toggle" type="button" data-password-toggle="signupPassword" aria-label="Show password" title="Show password">&#128065;</button>
          </div>
          <button class="btn btn-primary" type="submit">Create Account</button>
        </form>
        <form class="auth-form" id="loginForm" hidden>
          <label for="loginEmail">Email</label>
          <input class="form-control" id="loginEmail" name="email" type="email" autocomplete="email" pattern="^[^\\s@]+@(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}$" title="Please enter a valid email address (needs to include a domain)." required>
          <label for="loginPassword">Password</label>
          <div class="password-field">
            <input class="form-control" id="loginPassword" name="password" type="password" autocomplete="current-password" required>
            <button class="password-toggle" type="button" data-password-toggle="loginPassword" aria-label="Show password" title="Show password">&#128065;</button>
          </div>
          <button class="btn btn-primary" type="submit">Login</button>
        </form>
        <p class="auth-message" id="authMessage">Accounts are saved in this browser for this static site.</p>
      </div>
    </div>
  `);

  document.body.insertAdjacentHTML("beforeend", `
    <div class="auth-modal" id="signupThanksModal" hidden>
      <div class="auth-dialog signup-thanks-dialog" role="dialog" aria-modal="true" aria-labelledby="signupThanksTitle">
        <button class="auth-close" id="signupThanksClose" type="button" aria-label="Close signup thank you">&times;</button>
        <p class="eyebrow dark">Account Created</p>
        <h2 id="signupThanksTitle">Welcome to J&amp;C Pok&eacute;Pawns!</h2>
        <p class="signup-thanks-message" id="signupThanksMessage"></p>
        <a class="btn btn-primary" href="loyaltyprogram.html">View Loyalty Program</a>
      </div>
    </div>
  `);
}

function showAuthModal(mode = "signup") {
  const modal = document.querySelector("#authModal");
  if (!modal) {
    return;
  }

  modal.hidden = false;
  setAuthMode(mode);
}

function hideAuthModal() {
  const modal = document.querySelector("#authModal");
  if (modal) {
    modal.hidden = true;
  }
}

function showSignupThanks(username) {
  const modal = document.querySelector("#signupThanksModal");
  const message = document.querySelector("#signupThanksMessage");
  if (!modal || !message) {
    return;
  }

  message.innerHTML = `Thank you, <span class="signup-thanks-name">${escapeHtml(username)}</span> for signing up! If you have any questions about how our loyalty program works, click the button below!`;
  modal.hidden = false;
}

function hideSignupThanks() {
  const modal = document.querySelector("#signupThanksModal");
  if (modal) {
    modal.hidden = true;
  }
}

function setAuthMode(mode) {
  const isSignup = mode === "signup";
  document.querySelector("#signupForm").hidden = !isSignup;
  document.querySelector("#loginForm").hidden = isSignup;
  document.querySelector("#showSignup").classList.toggle("active", isSignup);
  document.querySelector("#showLogin").classList.toggle("active", !isSignup);
  document.querySelector("#authTitle").textContent = isSignup ? "Create your account" : "Welcome back";
  document.querySelector("#authModeLabel").textContent = isSignup ? "Sign Up" : "Login";
  document.querySelector("#authMessage").textContent = hasApiBackend() ? "Accounts are saved to the CardShop server." : "Accounts are saved in this browser for this static site.";
}

function setAuthMessage(message) {
  const authMessage = document.querySelector("#authMessage");
  if (authMessage) {
    authMessage.textContent = message;
  }
}

function clearDuplicateSignupFields() {
  document.querySelectorAll("#signupForm .form-control.is-duplicate").forEach((el) => el.classList.remove("is-duplicate"));
  document.querySelectorAll("#signupForm .is-duplicate-label").forEach((el) => el.classList.remove("is-duplicate-label"));
}

function markDuplicateSignupField(fieldName) {
  const fieldId = fieldName === "username" ? "signupUsername" : "signupEmail";
  const input = document.querySelector(`#${fieldId}`);
  const label = document.querySelector(`label[for="${fieldId}"]`);
  input?.classList.add("is-duplicate");
  label?.classList.add("is-duplicate-label");
}

function duplicateSignupMessage(duplicateFields) {
  const issues = [];
  if (duplicateFields.includes("username")) issues.push("Username is taken");
  if (duplicateFields.includes("email")) issues.push("Email is taken");
  return `${issues.join(" and ")}.`;
}

function clearLoginEmailError() {
  document.querySelector("#loginEmail")?.classList.remove("is-duplicate");
  document.querySelector("label[for=\"loginEmail\"]")?.classList.remove("is-duplicate-label");
}

function markLoginEmailError() {
  document.querySelector("#loginEmail")?.classList.add("is-duplicate");
  document.querySelector("label[for=\"loginEmail\"]")?.classList.add("is-duplicate-label");
}

function clearLoginPasswordError() {
  document.querySelector("#loginPassword")?.classList.remove("is-duplicate");
  document.querySelector("label[for=\"loginPassword\"]")?.classList.remove("is-duplicate-label");
}

function markLoginPasswordError() {
  document.querySelector("#loginPassword")?.classList.add("is-duplicate");
  document.querySelector("label[for=\"loginPassword\"]")?.classList.add("is-duplicate-label");
}

function clearLoginErrors() {
  clearLoginEmailError();
  clearLoginPasswordError();
}

function togglePasswordVisibility(button) {
  const input = document.querySelector(`#${button.dataset.passwordToggle}`);
  if (!input) {
    return;
  }

  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  button.classList.toggle("is-visible", isHidden);
  button.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  button.title = isHidden ? "Hide password" : "Show password";
}

function renderAuthControls() {
  const authControls = document.querySelector("#authControls");
  if (!authControls) {
    return;
  }

  const user = getActiveUser();
  authControls.innerHTML = user
    ? `<span class="auth-greeting">Hi, ${escapeHtml(user.username)}</span><button class="auth-link" id="logoutButton" type="button">Logout</button>`
    : `<button class="auth-link" id="openLogin" type="button">Login</button><button class="btn btn-primary btn-sm" id="openSignup" type="button">Sign Up</button>`;
}

async function createAccount(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const username = form.get("username").trim();
  if (username.length > 12) {
    setAuthMessage("Username must be 12 characters or fewer.");
    return;
  }
  const email = form.get("email").trim().toLowerCase();
  const password = form.get("password");

  if (!isValidEmail(email)) {
    markDuplicateSignupField("email");
    setAuthMessage("Email must include a domain, like name@example.com.");
    return;
  }

  if (hasApiBackend()) {
    try {
      const authResponse = await apiRequest("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ username, email, password })
      });
      setApiSession(authResponse);
      event.target.reset();
      hideAuthModal();
      renderAuthControls();
      showSignupThanks(authResponse.user.username);
      await renderSavedCards();
    } catch (error) {
      clearDuplicateSignupFields();

      const duplicateFields = error.duplicateFields || [];
      duplicateFields.forEach(markDuplicateSignupField);
      setAuthMessage(duplicateFields.length ? duplicateSignupMessage(duplicateFields) : error.message);
    }
    return;
  }

  clearDuplicateSignupFields();

  const accounts = getAccounts();

  // Check both email and username for duplicates simultaneously so the user
  // sees all issues at once rather than fixing one field at a time.
  const duplicateEmail = accounts.some((account) => account.email === email);
  const duplicateUsername = accounts.some((account) => account.username.toLowerCase() === username.toLowerCase());

  if (duplicateEmail || duplicateUsername) {
    const duplicateFields = [];
    if (duplicateUsername) duplicateFields.push("username");
    if (duplicateEmail) duplicateFields.push("email");
    duplicateFields.forEach(markDuplicateSignupField);
    setAuthMessage(duplicateSignupMessage(duplicateFields));
    return;
  }

  const salt = randomId();
  const account = {
    id: randomId(),
    username,
    email,
    salt,
    passwordHash: await hashPassword(password, salt),
    createdAt: new Date().toISOString()
  };

  saveAccounts([...accounts, account]);
  localStorage.setItem(sessionKey, account.id);
  event.target.reset();
  hideAuthModal();
  renderAuthControls();
  showSignupThanks(account.username);
  renderSavedCards();
}

async function loginAccount(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const email = form.get("email").trim().toLowerCase();
  const password = form.get("password");
  clearLoginErrors();

  if (hasApiBackend()) {
    try {
      const authResponse = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setApiSession(authResponse);
      event.target.reset();
      hideAuthModal();
      renderAuthControls();
      await renderSavedCards();
    } catch (error) {
      if (error.message === "Email not registered.") {
        markLoginEmailError();
      } else if (error.message === "Password is incorrect.") {
        markLoginPasswordError();
      }
      setAuthMessage(error.message);
    }
    return;
  }

  const account = getAccounts().find((candidate) => candidate.email === email);

  if (!account) {
    markLoginEmailError();
    setAuthMessage("Email not registered.");
    return;
  }

  if (account.passwordHash !== await hashPassword(password, account.salt)) {
    markLoginPasswordError();
    setAuthMessage("Password is incorrect.");
    return;
  }

  localStorage.setItem(sessionKey, account.id);
  event.target.reset();
  hideAuthModal();
  renderAuthControls();
  renderSavedCards();
}

function initializeAuth() {
  injectAuthControls();
  highlightCurrentNavLink();
  renderAuthControls();

  document.addEventListener("click", (event) => {
    if (event.target.closest("#openSignup")) {
      showAuthModal("signup");
    }
    if (event.target.closest("#openLogin")) {
      showAuthModal("login");
    }
    if (event.target.closest("#logoutButton")) {
      if (hasApiBackend()) {
        apiRequest("/api/auth/logout", { method: "POST" }).catch(() => {});
        clearApiSession();
      } else {
        localStorage.removeItem(sessionKey);
      }
      renderAuthControls();
      renderSavedCards();
    }
    if (event.target.closest("#authClose")) {
      hideAuthModal();
    }
    if (event.target.closest("#signupThanksClose")) {
      hideSignupThanks();
    }
    if (event.target.closest("#showSignup")) {
      setAuthMode("signup");
    }
    if (event.target.closest("#showLogin")) {
      setAuthMode("login");
    }
    const passwordToggle = event.target.closest("[data-password-toggle]");
    if (passwordToggle) {
      togglePasswordVisibility(passwordToggle);
    }
  });

  const signupPasswordInput = document.querySelector("#signupPassword");
  if (signupPasswordInput) {
    signupPasswordInput.addEventListener("input", function () {
      const len = this.value.length;
      if (len > 0 && len <= 6) {
        this.setCustomValidity(`Please enter a password greater than 6 characters (you are currently using ${len} character${len === 1 ? "" : "s"})`);
      } else {
        this.setCustomValidity("");
      }
    });
  }

  // Clear duplicate field highlighting when user types in those fields
  document.querySelectorAll("#signupUsername, #signupEmail").forEach((input) => {
    input.addEventListener("input", function () {
      this.classList.remove("is-duplicate");
      const label = this.id === "signupUsername"
        ? document.querySelector("label[for=\"signupUsername\"]")
        : document.querySelector("label[for=\"signupEmail\"]");
      if (label) label.classList.remove("is-duplicate-label");
    });
  });

  document.querySelectorAll("#signupEmail, #loginEmail").forEach((input) => {
    input.addEventListener("input", function () {
      if (this.value.trim()) {
        setEmailValidity(this);
      } else {
        this.setCustomValidity("");
      }
    });
    input.addEventListener("invalid", function () {
      setEmailValidity(this);
    });
  });

  document.querySelector("#loginEmail")?.addEventListener("input", clearLoginEmailError);
  document.querySelector("#loginPassword")?.addEventListener("input", clearLoginPasswordError);

  document.querySelector("#signupForm")?.addEventListener("submit", createAccount);
  document.querySelector("#loginForm")?.addEventListener("submit", loginAccount);
}

async function startScannerCamera() {
  if (!scannerVideo || !navigator.mediaDevices?.getUserMedia) {
    setScannerStatus("This browser does not support camera scanning.");
    return;
  }

  try {
    stopScannerCamera(false, true);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    scannerVideo.srcObject = stream;
    scannerVideo.hidden = false;
    snapshotPreview.hidden = true;
    startCameraButton.disabled = true;
    captureButton.disabled = false;
    stopCameraButton.disabled = false;
    setScannerStatus("Camera ready. Put the card in frame and capture it.");
  } catch (error) {
    setScannerStatus("Camera blocked or unavailable. You can still type the card name and check value.");
  }
}

function stopScannerCamera(updateStatus = true, clearPreview = false) {
  if (!scannerVideo) {
    return;
  }

  const stream = scannerVideo.srcObject;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    scannerVideo.srcObject = null;
  }

  const hasPreview = snapshotPreview && !snapshotPreview.hidden;
  scannerVideo.hidden = hasPreview && !clearPreview;
  if (snapshotPreview) {
    if (clearPreview) {
      snapshotPreview.hidden = true;
      snapshotPreview.removeAttribute("src");
    }
  }

  if (startCameraButton) {
    startCameraButton.disabled = false;
  }
  if (captureButton) {
    captureButton.disabled = true;
  }
  if (stopCameraButton) {
    stopCameraButton.disabled = true;
  }

  if (updateStatus) {
    setScannerStatus("Camera stopped. Start it again when you are ready to scan.");
  }
}

async function captureScannerImage() {
  if (!scannerVideo || !snapshotCanvas || !snapshotPreview || !scannerVideo.videoWidth) {
    setScannerStatus("Camera is still loading. Try capture again in a moment.");
    return;
  }

  snapshotCanvas.width = scannerVideo.videoWidth;
  snapshotCanvas.height = scannerVideo.videoHeight;
  const context = snapshotCanvas.getContext("2d");
  context.drawImage(scannerVideo, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
  snapshotPreview.src = snapshotCanvas.toDataURL("image/jpeg", 0.86);
  snapshotPreview.hidden = false;
  scannerVideo.hidden = true;
  setScannerStatus("Image captured. Reading the card text now...");
  await identifyCapturedCard();
}

async function getSavedCards() {
  if (hasApiBackend()) {
    return await apiRequest("/api/cards");
  }

  try {
    return JSON.parse(localStorage.getItem(currentSavedCardsKey())) || [];
  } catch (error) {
    return [];
  }
}

async function saveCard(card) {
  const user = getActiveUser();
  if (!user) {
    showAuthModal("signup");
    setAuthMessage("Create an account or log in before entering scanned cards.");
    return;
  }

  if (hasApiBackend()) {
    try {
      await apiRequest("/api/cards", {
        method: "POST",
        body: JSON.stringify({
          cardApiId: card.id,
          cardName: card.name,
          cardSet: card.set,
          cardNumber: card.number,
          imageUrl: card.image,
          marketPrice: hasPrice(card.market) ? card.market : null,
          shopPrice: hasPrice(card.shopPrice) ? card.shopPrice : null
        })
      });
      await renderSavedCards();
    } catch (error) {
      setScannerStatus(error.message || "Could not save this card.");
    }
    return;
  }

  const savedCards = await getSavedCards();
  const withoutDuplicate = savedCards.filter((savedCard) => savedCard.id !== card.id);
  localStorage.setItem(currentSavedCardsKey(), JSON.stringify([card, ...withoutDuplicate].slice(0, 24)));
  renderSavedCards();
}

function cardNumberParts(input) {
  const match = input.match(/(\d+)\s*\/\s*(\d+)/);
  return match ? { number: match[1], total: match[2] } : null;
}

function automaticCardValue(card) {
  const priceGroups = Object.values(card.tcgplayer?.prices || {});
  return priceGroups.find((group) => group.market)?.market ||
    priceGroups.find((group) => group.mid)?.mid ||
    priceGroups.find((group) => group.low)?.low ||
    priceGroups.find((group) => group.directLow)?.directLow ||
    0;
}

function average(values) {
  const validValues = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!validValues.length) {
    return 0;
  }
  return validValues.reduce((total, value) => total + value, 0) / validValues.length;
}

function buildCardQuery(name, setText) {
  const cleanName = name.trim().replace(/"/g, "");
  const cleanSet = setText.trim().replace(/"/g, "");
  const terms = [`name:"${cleanName}"`];
  const numberParts = cardNumberParts(cleanSet);

  if (numberParts) {
    terms.push(`number:${numberParts.number}`);
    terms.push(`set.printedTotal:${numberParts.total}`);
  } else if (cleanSet) {
    terms.push(`(set.name:"${cleanSet}" OR set.series:"${cleanSet}")`);
  }

  return terms.join(" ");
}

function buildFallbackCardQuery(name, setText) {
  const cleanName = name.trim().replace(/"/g, "");
  const numberParts = cardNumberParts(setText);
  return numberParts ? `name:"${cleanName}" number:${numberParts.number}` : `name:"${cleanName}"`;
}

function debounce(callback, delay) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

function uniqueBy(items, keyGetter) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyGetter(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function renderDatalist(target, options) {
  if (!target) {
    return;
  }

  target.innerHTML = options.map((option) => {
    const label = option.label ? ` label="${escapeHtml(option.label)}"` : "";
    return `<option value="${escapeHtml(option.value)}"${label}></option>`;
  }).join("");
}

function wildcardQueryText(text) {
  return text.trim().replace(/"/g, "").replace(/[^A-Za-z0-9 ':-]/g, " ").replace(/\s+/g, " ");
}

async function fetchCardSuggestions(queryText, pageSize = 12) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6500);
  const query = encodeURIComponent(queryText);

  try {
    const response = await fetch(`https://api.pokemontcg.io/v2/cards?q=${query}&pageSize=${pageSize}&orderBy=-set.releaseDate`, {
      signal: controller.signal
    });
    if (!response.ok) {
      return [];
    }

    const body = await response.json();
    return body.data || [];
  } catch (error) {
    return [];
  } finally {
    window.clearTimeout(timeout);
  }
}

async function updateCardNameSuggestions() {
  const text = wildcardQueryText(cardNameInput?.value || "");
  if (text.length < 2) {
    renderDatalist(cardNameSuggestions, []);
    return;
  }

  const results = await fetchCardSuggestions(`name:*${text}*`, 16);
  const names = uniqueBy(results, (card) => card.name.toLowerCase()).map((card) => ({
    value: card.name,
    label: card.set?.name || ""
  }));
  renderDatalist(cardNameSuggestions, names);
}

async function updateCardSetSuggestions() {
  const name = wildcardQueryText(cardNameInput?.value || "");
  const setText = wildcardQueryText(cardSetInput?.value || "");
  if (name.length < 2) {
    renderDatalist(cardSetSuggestions, []);
    return;
  }

  if (name !== cachedSetCardsName) {
    cachedSetCardsName = name;
    cachedSetCards = await fetchCardSuggestions(`name:"${name}"`, 50);
  }

  const filteredResults = setText.length >= 1
    ? cachedSetCards.filter((card) => {
      const setName = card.set?.name || "";
      const number = card.number || "";
      const printedTotal = card.set?.printedTotal ? `${card.set.printedTotal}` : "";
      const displayNumber = `${number}${printedTotal ? `/${printedTotal}` : ""}`;
      const haystack = `${setName} ${number} ${displayNumber}`.toLowerCase();
      return haystack.includes(setText.toLowerCase());
    })
    : cachedSetCards;
  const options = uniqueBy(filteredResults, (card) => `${card.set?.name || ""}-${card.number}`).map((card) => {
    const setName = card.set?.name || "Unknown set";
    const printedTotal = card.set?.printedTotal ? `/${card.set.printedTotal}` : "";
    const number = card.number ? `${card.number}${printedTotal}` : setName;
    return {
      value: number,
      label: setName
    };
  });
  renderDatalist(cardSetSuggestions, options);
}

function findLikelyCardName(text) {
  const ignoredWords = [
    "pokemon", "basic", "stage", "evolves", "hp", "weakness", "resistance",
    "retreat", "illustrator", "trainer", "energy", "ability", "attack",
    "rule", "copyright", "nintendo", "creatures", "game freak"
  ];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[^A-Za-z0-9 '.:-]/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 3 && line.length <= 36);

  return lines.find((line) => {
    const lower = line.toLowerCase();
    const hasLetters = /[a-z]/i.test(line);
    const isMostlyNumber = /^[\d\s/.-]+$/.test(line);
    return hasLetters && !isMostlyNumber && !ignoredWords.some((word) => lower.includes(word));
  }) || "";
}

function findLikelyCardNumber(text) {
  const numberMatch = text.match(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/);
  return numberMatch ? `${numberMatch[1]}/${numberMatch[2]}` : "";
}

async function identifyCapturedCard() {
  if (!window.Tesseract || !snapshotCanvas || !lookupForm) {
    setScannerStatus("OCR is unavailable, but you can still type the card details and calculate value.");
    return;
  }

  try {
    const result = await Tesseract.recognize(snapshotCanvas, "eng");
    const scannedText = result.data?.text || "";
    const guessedName = findLikelyCardName(scannedText);
    const guessedNumber = findLikelyCardNumber(scannedText);

    if (!guessedName) {
      setScannerStatus("I could not read the card name clearly. Try better lighting or type the card details.");
      return;
    }

    lookupForm.elements.cardName.value = guessedName;
    lookupForm.elements.cardSet.value = guessedNumber;
    setScannerStatus(`I read "${guessedName}". Searching online for the matching card...`);
    await findCards(guessedName, guessedNumber);
  } catch (error) {
    setScannerStatus("I could not identify this image. Try a clearer capture or type the card details.");
  }
}

function sourceRows(sources) {
  if (!sources.length) {
    return "<span>Ungraded sales data</span><strong>Not available yet</strong>";
  }

  return sources.map((source) => `
    <span>${escapeHtml(source.label)}</span><strong>${money(source.value)}</strong>
  `).join("");
}

function resultCardTemplate(card, priceSources) {
  const market = average(priceSources.map((source) => source.value));
  const shopPrice = hasPrice(market) ? market * 0.8 : 0;
  const image = card.images?.small || card.images?.large || "";
  const name = escapeHtml(card.name);
  const setName = escapeHtml(card.set?.name || "Unknown set");
  const number = escapeHtml(card.number || "");
  const rarity = escapeHtml(card.rarity || "Pokemon card");
  const payload = encodeURIComponent(JSON.stringify({
    id: card.id,
    name: card.name,
    set: card.set?.name || "Unknown set",
    number: card.number || "",
    image,
    market,
    shopPrice,
    priceSources
  }));

  return `
    <article class="scanner-result">
      <img src="${escapeHtml(image)}" alt="${name} card">
      <div>
        <span class="condition">${rarity}</span>
        <h3>${name}</h3>
        <p>${setName} ${number ? `#${number}` : ""}</p>
        <div class="price-grid compact">
          ${sourceRows(priceSources)}
          <span>Estimated Value</span><strong>${hasPrice(market) ? money(market) : "No price yet"}</strong>
          <span>80% Price</span><strong>${hasPrice(shopPrice) ? money(shopPrice) : "N/A"}</strong>
        </div>
        <div class="scanner-actions result-actions">
          <button class="btn btn-primary btn-sm save-scanned-card" type="button" data-card="${payload}">Enter Card</button>
        </div>
      </div>
    </article>
  `;
}

function pricedCard(card) {
  const pokemonTcgValue = automaticCardValue(card);
  const sources = [];
  if (pokemonTcgValue) {
    sources.push({
      label: "TCGplayer Ungraded",
      value: pokemonTcgValue,
      detail: "Card database price"
    });
  }

  return { card, sources };
}

async function findCards(name, setText) {
  const submitButton = lookupForm?.querySelector("button[type=\"submit\"]");
  if (!name.trim()) {
    lookupResults.innerHTML = "<p class=\"scanner-status\">Enter or scan a card name first.</p>";
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
  }

  lookupResults.innerHTML = "<p class=\"scanner-status\">Finding matching cards and calculating value...</p>";

  try {
    let results = await fetchCards(buildCardQuery(name, setText));
    if (!results.length && setText.trim()) {
      results = await fetchCards(buildFallbackCardQuery(name, setText));
    }

    const pricedCards = results.map(pricedCard);
    const noPriceMessage = pricedCards.some((item) => !item.sources.length)
      ? "<p class=\"scanner-status\">Some matched cards do not have ungraded sales data yet. This often happens when a card is very new or the market source has not posted sales/pricing data.</p>"
      : "";
    lookupResults.innerHTML = results.length
      ? pricedCards.map((item) => resultCardTemplate(item.card, item.sources)).join("") + noPriceMessage
      : "<p class=\"scanner-status\">No cards found. Try just the card name, or use the set name instead of the card number.</p>";
  } catch (error) {
    lookupResults.innerHTML = `<p class="scanner-status">${escapeHtml(error.message || "The card lookup is unavailable right now. Try again in a moment.")}</p>`;
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

async function fetchCards(queryText) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 9000);
  const query = encodeURIComponent(queryText);

  try {
    const response = await fetch(`https://api.pokemontcg.io/v2/cards?q=${query}&pageSize=8&orderBy=-set.releaseDate`, {
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error("Card lookup failed. Try again in a moment.");
    }

    const body = await response.json();
    return body.data || [];
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The online lookup timed out. Try just the card name, then calculate again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function lookUpCard(event) {
  event.preventDefault();
  const name = new FormData(lookupForm).get("cardName");
  const setText = new FormData(lookupForm).get("cardSet") || "";

  await findCards(name, setText);
}

async function renderSavedCards() {
  if (!savedCardsTarget) {
    return;
  }

  const user = getActiveUser();
  if (!user) {
    savedCardsTarget.innerHTML = "<p class=\"scanner-status\">Sign up or log in to save scanned cards to your account.</p>";
    return;
  }

  let savedCards = [];
  try {
    savedCards = await getSavedCards();
  } catch (error) {
    savedCardsTarget.innerHTML = "<p class=\"scanner-status\">Could not load saved cards from the server.</p>";
    return;
  }

  if (!savedCards.length) {
    savedCardsTarget.innerHTML = `<p class="scanner-status">No entered cards yet for ${escapeHtml(user.username)}.</p>`;
    return;
  }

  savedCardsTarget.innerHTML = savedCards.map((card) => {
    const timestamp = formatTimestamp(card.createdAt || card.CreatedAt);
    const timestampHtml = timestamp ? `<span class="card-timestamp">Entered ${timestamp}</span>` : "";
    return `
    <article class="saved-card">
      <img src="${escapeHtml(card.image || card.imageUrl || "")}" alt="${escapeHtml(card.name || card.cardName)} card">
      <div>
        <h3>${escapeHtml(card.name || card.cardName)}</h3>
        <p>${escapeHtml(card.set || card.cardSet || "")} ${card.number || card.cardNumber ? `#${escapeHtml(card.number || card.cardNumber)}` : ""}</p>
        <strong>${hasPrice(card.market || card.marketPrice) ? money(card.market || card.marketPrice) : "No price"}</strong>
        <span>Shop price ${hasPrice(card.shopPrice) ? money(card.shopPrice) : "N/A"}</span>
        ${timestampHtml}
      </div>
    </article>`;
  }).join("");
}

if (startCameraButton) {
  startCameraButton.addEventListener("click", startScannerCamera);
}

if (stopCameraButton) {
  stopCameraButton.addEventListener("click", () => {
    stopScannerCamera();
  });
}

if (captureButton) {
  captureButton.addEventListener("click", () => {
    captureScannerImage();
  });
}

if (lookupForm) {
  lookupForm.addEventListener("submit", lookUpCard);
  lookupResults.addEventListener("click", (event) => {
    const button = event.target.closest(".save-scanned-card");
    if (!button) {
      return;
    }

    saveCard(JSON.parse(decodeURIComponent(button.dataset.card)));
    button.textContent = "Entered";
  });
}

if (cardNameInput) {
  cardNameInput.addEventListener("input", debounce(() => {
    cachedSetCardsName = "";
    cachedSetCards = [];
    updateCardNameSuggestions();
    updateCardSetSuggestions();
  }, 300));
  cardNameInput.addEventListener("change", () => {
    cachedSetCardsName = "";
    cachedSetCards = [];
    updateCardSetSuggestions();
  });
}

if (cardSetInput) {
  cardSetInput.addEventListener("input", debounce(updateCardSetSuggestions, 300));
  cardSetInput.addEventListener("focus", () => {
    if (!cardSetSuggestions?.children.length) {
      updateCardSetSuggestions();
    }
  });
}

if (clearSavedCardsButton) {
  clearSavedCardsButton.addEventListener("click", async () => {
    if (hasApiBackend()) {
      savedCardsTarget.innerHTML = "<p class=\"scanner-status\">Bulk clear is local-only for now. Server cards can be deleted one at a time after we add delete buttons.</p>";
      return;
    }

    localStorage.removeItem(currentSavedCardsKey());
    await renderSavedCards();
  });
}

initializeAuth();
renderSavedCards();
