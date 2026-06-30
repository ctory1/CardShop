/*
 * CardShop
 * Copyright © 2026 Colin Toryfter
 * All Rights Reserved.
 *
 * Unauthorized copying or distribution of this file is prohibited.
 */

const cards = [
  {
    apiId: "sv3pt5-199",
    name: "Charizard ex Special Illustration Rare",
    set: "Pokémon 151",
    market: 395,
    image: "https://images.pokemontcg.io/sv3pt5/199_hires.png",
    condition: "Near Mint"
  },
  {
    apiId: "swsh7-215",
    name: "Umbreon VMAX Alternate Art",
    set: "Evolving Skies",
    market: 2037,
    image: "https://images.pokemontcg.io/swsh7/215_hires.png",
    condition: "Near Mint"
  },
  {
    apiId: "swsh11-186",
    name: "Giratina V Alternate Art",
    set: "Lost Origin",
    market: 777,
    image: "https://images.pokemontcg.io/swsh11/186_hires.png",
    condition: "Near Mint"
  },
  {
    apiId: "swsh7-218",
    name: "Rayquaza VMAX Alternate Art",
    set: "Evolving Skies",
    market: 962,
    image: "https://images.pokemontcg.io/swsh7/218_hires.png",
    condition: "Light Play"
  },
  {
    apiId: "swsh12-186",
    name: "Lugia V Alternate Art",
    set: "Silver Tempest",
    market: 516,
    image: "https://images.pokemontcg.io/swsh12/186_hires.png",
    condition: "Near Mint"
  },
  {
    apiId: "svp-85",
    name: "Pikachu with Grey Felt Hat",
    set: "Promo",
    market: 970,
    image: "https://images.pokemontcg.io/svp/85_hires.png",
    condition: "Near Mint"
  }
];

const stockCacheKey = "cardshop-collectables-api-stock-cache";
const stockViewerKey = "cardshop-collectables-viewer-card";
let renderedStockCards = [];

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

function stockViewerPayload(card) {
  return {
    name: card.name || "Pokemon Card",
    set: card.set || "",
    condition: card.condition || "",
    front: card.frontImage || card.frontImageUrl || card.conditionFrontImage || "",
    back: card.backImage || card.backImageUrl || card.conditionBackImage || ""
  };
}

function stockCardImageUrl(card, index) {
  return `card-viewer.html?card=${encodeURIComponent(String(index))}`;
}

function cardTemplate(card, index) {
  const market = hasPrice(card.market) ? card.market : 0;
  const rawShop = market * 0.8;
  const shopPrice = market >= 35 ? Math.ceil(rawShop / 5) * 5 : rawShop;
  const quantity = Number(card.quantity) || 1;
  const viewerUrl = stockCardImageUrl(card, index);
  return `
    <div class="col-sm-6 col-lg-4">
      <article class="pokemon-card">
        <div class="card-image-wrap">
          <a class="card-image-link" href="${escapeHtml(viewerUrl)}" data-viewer-index="${index}" rel="noopener" aria-label="View front and back photos for ${escapeHtml(card.name)}">
            <img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.name)} card" loading="lazy">
          </a>
        </div>
        <div class="card-body">
          <span class="condition">${card.condition}${quantity > 1 ? ` · Qty ${quantity}` : ""}</span>
          <h3>${card.name}</h3>
          <p>${card.set}</p>
          <div class="price-grid">
            <span>Market</span><strong>${hasPrice(market) ? money(market) : "Checking"}</strong>
            <span>Shop Price</span><strong>${hasPrice(shopPrice) ? money(shopPrice) : "Checking"}</strong>
          </div>
        </div>
      </article>
    </div>
  `;
}

function renderStockCards(stockCards) {
  renderedStockCards = stockCards;
  const stockTarget = document.querySelector("#pokemonStock");
  if (stockTarget) {
    stockTarget.innerHTML = stockCards.map(cardTemplate).join("");
  }

  const featuredTarget = document.querySelector("#featuredCards");
  if (featuredTarget) {
    featuredTarget.innerHTML = stockCards.slice(0, 3).map(cardTemplate).join("");
  }
  restorePokemonScrollPosition();
}

function renderStockMessage(message) {
  const stockTarget = document.querySelector("#pokemonStock");
  if (stockTarget) {
    stockTarget.innerHTML = `<div class="col-12"><p class="empty-state">${escapeHtml(message)}</p></div>`;
  }

  const featuredTarget = document.querySelector("#featuredCards");
  if (featuredTarget) {
    featuredTarget.innerHTML = `<div class="col-12"><p class="empty-state">${escapeHtml(message)}</p></div>`;
  }
}

function mapApiStockCards(apiCards) {
  return apiCards.map((card) => ({
    apiId: card.apiId,
    name: card.name,
    set: card.set,
    market: Number(card.market),
    image: card.image,
    frontImage: card.frontImage || card.frontImageUrl || card.conditionFrontImage || "",
    backImage: card.backImage || card.backImageUrl || card.conditionBackImage || "",
    condition: card.condition,
    quantity: Number(card.quantity) || 1,
    cacheUntil: card.cacheUntil
  }));
}

function renderCardViewerPage() {
  const frontImage = document.querySelector("#viewerFrontImage");
  const backImage = document.querySelector("#viewerBackImage");
  if (!frontImage || !backImage) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const cardKey = params.get("card");
  let storedCard = null;
  try {
    const storageKey = cardKey ? `${stockViewerKey}:${cardKey}` : stockViewerKey;
    storedCard = JSON.parse(sessionStorage.getItem(storageKey) || "null");
  } catch (error) {
    storedCard = null;
  }
  const name = storedCard?.name || params.get("name") || "Pokemon Card";
  const set = storedCard?.set || params.get("set") || "";
  const condition = storedCard?.condition || params.get("condition") || "";
  const front = storedCard?.front || params.get("front") || "";
  const back = storedCard?.back || params.get("back") || "";
  const meta = [set, condition].filter(Boolean).join(" - ");

  document.title = `${name} Photos | CardShop Collectables`;
  document.querySelector("#viewerCardName").textContent = name;
  document.querySelector("#viewerCardMeta").textContent = meta;

  if (front) {
    frontImage.src = front;
    frontImage.alt = `${name} front`;
  } else {
    frontImage.closest(".condition-viewer-frame").innerHTML = `
      <div class="condition-viewer-missing">
        <strong>Front photo not available yet</strong>
      </div>`;
  }

  if (back) {
    backImage.src = back;
    backImage.alt = `${name} back`;
  } else {
    backImage.closest(".condition-viewer-frame").innerHTML = `
      <div class="condition-viewer-missing">
        <strong>Back photo not available yet</strong>
      </div>`;
  }
}

function cachedApiStockCards() {
  try {
    const cache = JSON.parse(localStorage.getItem(stockCacheKey));
    if (!cache?.expiresAt || Date.now() >= Date.parse(cache.expiresAt) || !Array.isArray(cache.cards)) {
      return [];
    }

    return mapApiStockCards(cache.cards);
  } catch (error) {
    return [];
  }
}

function saveApiStockCards(apiCards) {
  const cacheUntil = apiCards
    .map((card) => card.cacheUntil)
    .filter(Boolean)
    .sort()[0];

  if (!cacheUntil) {
    return;
  }

  localStorage.setItem(stockCacheKey, JSON.stringify({
    expiresAt: cacheUntil,
    cards: apiCards
  }));
}

async function fetchApiStockCards() {
  if (!hasApiBackend()) {
    return [];
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${configuredApiBaseUrl}/api/stock`, {
      signal: controller.signal
    });
    if (!response.ok) {
      return [];
    }

    const apiCards = await response.json();
    if (!Array.isArray(apiCards)) {
      return [];
    }

    saveApiStockCards(apiCards);
    return mapApiStockCards(apiCards);
  } catch (error) {
    return [];
  } finally {
    window.clearTimeout(timeout);
  }
}

async function refreshStockCards() {
  if (!document.querySelector("#pokemonStock") && !document.querySelector("#featuredCards")) {
    return;
  }

  if (!hasApiBackend()) {
    renderStockCards(cards);
    return;
  }

  const cachedCards = cachedApiStockCards();
  if (cachedCards.length) {
    renderStockCards(cachedCards);
  } else {
    renderStockMessage("Loading current stock...");
  }

  const apiCards = await fetchApiStockCards();
  if (apiCards.length) {
    renderStockCards(apiCards);
  } else if (!cachedCards.length) {
    renderStockMessage("No database stock is available right now.");
  }
}

const stockTarget = document.querySelector("#pokemonStock");
const featuredTarget = document.querySelector("#featuredCards");

document.addEventListener("click", (event) => {
  const link = event.target.closest(".card-image-link[data-viewer-index]");
  if (!link) {
    return;
  }

  const card = renderedStockCards[Number(link.dataset.viewerIndex)];
  if (!card) {
    return;
  }

  try {
    sessionStorage.setItem(`${stockViewerKey}:${link.dataset.viewerIndex}`, JSON.stringify(stockViewerPayload(card)));
  } catch (error) {
    event.preventDefault();
    window.alert("Could not open the condition photos because the image data is too large for this browser session.");
  }
});

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
const cardNameToggle = document.querySelector("#cardNameToggle");
const cardSetToggle = document.querySelector("#cardSetToggle");
const cardNameSuggestions = document.querySelector("#cardNameSuggestions");
const cardSetSuggestions = document.querySelector("#cardSetSuggestions");
const savedCardsBaseKey = "cardshop-collectables-scanned-cards";
const accountsKey = "cardshop-collectables-accounts";
const sessionKey = "cardshop-collectables-session";
const localPasswordResetKey = "cardshop-collectables-password-reset";
const apiTokenKey = "cardshop-collectables-api-token";
const apiUserKey = "cardshop-collectables-api-user";
const avatarBaseKey = "cardshop-collectables-avatar";
const purchaseBaseKey = "cardshop-collectables-purchases";
const configuredApiBaseUrl = (window.CARDSHOP_API_BASE_URL || "").replace(/\/$/, "");
if (stockTarget || featuredTarget) {
  refreshStockCards();
}
renderCardViewerPage();
const usernameMinLength = 3;
const usernameMaxLength = 50;
let cachedSetCards = [];
let cachedSetCardsName = "";
let cachedNameCards = [];
let cachedNameQuery = "";
let nameSuggestionRequestId = 0;
let setSuggestionRequestId = 0;
let nameSuggestionController = null;
let setSuggestionController = null;
let accountActionModalResolver = null;
const conditionMultipliers = {
  "Near Mint": 1,
  "Lightly Played": 0.85,
  "Moderately Played": 0.7,
  "Heavily Played": 0.55,
  "Damaged": 0.35
};

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

function usernameValidationMessage(username) {
  if (!username) {
    return "";
  }

  if (username.length < usernameMinLength) {
    return `Username must be at least ${usernameMinLength} characters.`;
  }

  if (username.length > usernameMaxLength) {
    return `Username must be ${usernameMaxLength} characters or fewer.`;
  }

  if (!/^[A-Za-z0-9]+$/.test(username)) {
    return "Username can only use letters and numbers.";
  }

  return "";
}

function isValidUsername(username) {
  return !usernameValidationMessage(username);
}

function usernameLeetAlternative(username) {
  const leetMap = {
    "0": "o",
    "1": "l",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "8": "eat"
  };

  const replaced = username.replace(/[0134578]/g, (value) => leetMap[value] || value);
  if (replaced === username || replaced.length > usernameMaxLength) {
    return "";
  }

  return replaced;
}

function usernameSuggestionCandidates(username) {
  const trimmed = username.trim();
  if (!trimmed) {
    return [];
  }

  const base = trimmed.replace(/[^A-Za-z0-9]/g, "");
  const candidates = [
    usernameLeetAlternative(base),
    `${base}1`,
    `${base}23`,
    `${base}abc`
  ];

  return [...new Set(candidates)]
    .filter((candidate) => candidate && candidate !== trimmed)
    .filter((candidate) => isValidUsername(candidate))
    .slice(0, 3);
}

function renderUsernameFeedback() {
  const input = document.querySelector("#signupUsername");
  const feedback = document.querySelector("#signupUsernameFeedback");
  if (!input || !feedback) {
    return true;
  }

  const username = input.value.trim();
  const message = usernameValidationMessage(username);
  input.setCustomValidity(message);
  feedback.classList.remove("is-valid", "is-invalid");

  if (!username) {
    feedback.textContent = "";
    return true;
  }

  if (!message) {
    feedback.textContent = `${username} is valid.`;
    feedback.classList.add("is-valid");
    return true;
  }

  const suggestions = usernameSuggestionCandidates(username);
  feedback.textContent = suggestions.length
    ? `${username} is invalid. ${message} Try ${suggestions.join(" or ")}.`
    : `${username} is invalid. ${message}`;
  feedback.classList.add("is-invalid");
  return false;
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
    requestError.status = response.status;
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
  return user ? savedCardsKeyForUser(user) : `${savedCardsBaseKey}-guest`;
}

function savedCardsKeyForUser(user) {
  return `${savedCardsBaseKey}-${user.id}`;
}

function avatarKeyForUser(user) {
  return `${avatarBaseKey}-${user.id}`;
}

function purchasesKeyForUser(user) {
  return `${purchaseBaseKey}-${user.id}`;
}

function getAccountAvatar(user) {
  if (!user?.id) {
    return "";
  }

  return localStorage.getItem(avatarKeyForUser(user)) || "";
}

function setAccountAvatar(user, value) {
  if (!user?.id) {
    return;
  }

  const key = avatarKeyForUser(user);
  if (value) {
    localStorage.setItem(key, value);
  } else {
    localStorage.removeItem(key);
  }
}

function cardPriceValue(card) {
  const value = Number(card.market ?? card.marketPrice ?? card.MarketPrice ?? card.shopPrice ?? card.ShopPrice);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function rewardCreditForSpend(spend) {
  const rewardBlocks = Math.floor(spend / 100);
  return rewardBlocks >= 3 ? Math.floor(rewardBlocks / 3) * 20 + (rewardBlocks % 3) * 5 : rewardBlocks * 5;
}

function purchaseAmountValue(purchase) {
  const value = Number(purchase.amount ?? purchase.total ?? purchase.purchaseTotal ?? purchase.PurchaseTotal);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getAccountPurchases(user) {
  if (!user?.id) {
    return [];
  }

  try {
    const purchases = JSON.parse(localStorage.getItem(purchasesKeyForUser(user)));
    return Array.isArray(purchases) ? purchases : [];
  } catch (error) {
    return [];
  }
}

function accountRewardSummary(user, cards) {
  const collectionValue = cards.reduce((sum, card) => sum + cardPriceValue(card), 0);
  const purchaseSpend = getAccountPurchases(user).reduce((sum, purchase) => sum + purchaseAmountValue(purchase), 0);
  const currentHundred = purchaseSpend % 100;
  const nextRewardProgress = Math.round(currentHundred);
  return {
    cardCount: cards.length,
    collectionValue,
    purchaseSpend,
    earnedCredit: rewardCreditForSpend(purchaseSpend),
    nextRewardProgress,
    nextRewardRemaining: Math.max(0, 100 - currentHundred)
  };
}

function accountSummaryMarkup(user, summary, isLoading = false) {
  const email = user.email || "No email saved";
  const joined = formatTimestamp(user.createdAt);
  const progressLabel = summary.nextRewardProgress >= 100 ? 100 : summary.nextRewardProgress;
  const avatarUrl = getAccountAvatar(user);
  const avatarMarkup = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="" aria-hidden="true">`
    : escapeHtml((user.username || "?").slice(0, 1).toUpperCase());
  return `
    <div class="account-menu-header">
      <span class="account-avatar">${avatarMarkup}</span>
      <div>
        <strong>${escapeHtml(user.username)}</strong>
        <span>${escapeHtml(email)}</span>
      </div>
    </div>
    <div class="account-avatar-tools">
      <label class="account-avatar-file">
        Choose avatar
        <input id="accountAvatarFile" type="file" accept="image/*">
      </label>
      <form class="account-avatar-url-form" id="accountAvatarUrlForm">
        <input id="accountAvatarUrl" type="text" placeholder="Paste image URL or path" value="${avatarUrl && !avatarUrl.startsWith("data:") ? escapeHtml(avatarUrl) : ""}" aria-label="Avatar image URL or local path">
        <button type="submit">Use URL</button>
      </form>
      ${avatarUrl ? `<button class="account-avatar-remove" id="removeAccountAvatar" type="button">Remove avatar</button>` : ""}
    </div>
    <div class="account-reward-card">
      <div class="account-reward-topline">
        <span>Reward progress</span>
        <strong>${money(summary.earnedCredit)} credit</strong>
      </div>
      <div class="account-progress-track" aria-label="Reward progress to the next $5 credit">
        <span style="width: ${Math.min(progressLabel, 100)}%"></span>
      </div>
      <p>${summary.purchaseSpend > 0 ? `${money(summary.nextRewardRemaining)} in eligible purchases until your next $5 reward.` : "No eligible purchases recorded yet. Card sales to the shop do not count toward rewards."}</p>
    </div>
    <div class="account-stat-grid">
      <span>Saved cards<strong>${isLoading ? "-" : summary.cardCount}</strong></span>
      <span>Collection value<strong>${isLoading ? "-" : money(summary.collectionValue)}</strong></span>
    </div>
    <dl class="account-detail-list">
      <div><dt>Email</dt><dd>${escapeHtml(email)}</dd></div>
      <div><dt>Member since</dt><dd>${joined || "Recently"}</dd></div>
    </dl>
    <div class="account-menu-actions">
      <a class="account-menu-link" href="scanner.html" role="menuitem">View saved cards</a>
      <a class="account-menu-link" href="loyaltyprogram.html" role="menuitem">Rewards details</a>
      <button class="account-menu-link danger" id="deleteAccountButton" type="button" role="menuitem">Delete Account</button>
      <button class="account-menu-link danger" id="logoutButton" type="button" role="menuitem">Logout</button>
    </div>
  `;
}

function closeAccountMenu() {
  const menu = document.querySelector("#accountMenu");
  const button = document.querySelector("#accountMenuButton");
  if (menu) {
    menu.hidden = true;
  }
  if (button) {
    button.setAttribute("aria-expanded", "false");
  }
}

async function updateAccountMenuSummary() {
  const menu = document.querySelector("#accountMenu");
  const user = getActiveUser();
  if (!menu || !user || menu.hidden) {
    return;
  }

  try {
    const savedCards = await getSavedCards();
    menu.innerHTML = accountSummaryMarkup(user, accountRewardSummary(user, savedCards));
  } catch (error) {
    menu.querySelector(".account-reward-card p").textContent = "Could not load your reward progress right now.";
  }
}

function toggleAccountMenu() {
  const menu = document.querySelector("#accountMenu");
  const button = document.querySelector("#accountMenuButton");
  if (!menu || !button) {
    return;
  }

  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  button.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    updateAccountMenuSummary();
  }
}

function refreshOpenAccountMenu() {
  const menu = document.querySelector("#accountMenu");
  const user = getActiveUser();
  if (!menu || !user) {
    return;
  }

  const savedCards = readLocalSavedCards(currentSavedCardsKey());
  menu.innerHTML = accountSummaryMarkup(user, accountRewardSummary(user, savedCards), hasApiBackend());
  if (!hasApiBackend()) {
    return;
  }

  updateAccountMenuSummary();
}

function setAvatarFromFile(input) {
  const user = getActiveUser();
  const file = input.files?.[0];
  if (!user || !file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    setAccountAvatar(user, String(reader.result || ""));
    input.value = "";
    refreshOpenAccountMenu();
  });
  reader.readAsDataURL(file);
}

function setAvatarFromUrl(event) {
  event.preventDefault();
  const user = getActiveUser();
  const input = event.target.querySelector("#accountAvatarUrl");
  const url = input?.value.trim() || "";
  if (!user || !url) {
    return;
  }

  setAccountAvatar(user, url);
  refreshOpenAccountMenu();
}

function clearUserLocalData(user) {
  if (!user?.id) {
    return;
  }

  localStorage.removeItem(savedCardsKeyForUser(user));
  localStorage.removeItem(avatarKeyForUser(user));
  localStorage.removeItem(purchasesKeyForUser(user));
}

async function deleteCurrentAccount() {
  const user = getActiveUser();
  if (!user) {
    return;
  }

  const accountLabel = user.email || user.username;
  const confirmed = await showAccountActionModal({
    label: "Permanent Action",
    title: "Delete this account?",
    message: `This will permanently delete ${accountLabel} and all saved account data. This cannot be undone.`,
    confirmText: "Delete Account",
    cancelText: "Keep Account",
    danger: true
  });
  if (!confirmed) {
    return;
  }

  if (hasApiBackend()) {
    try {
      await apiRequest("/api/auth/delete-account", { method: "POST" });
      clearUserLocalData(user);
      clearApiSession();
      renderAuthControls();
      await renderSavedCards();
      await showAccountActionModal({
        label: "Account Deleted",
        title: "Account deleted",
        message: "Your account and saved account data have been permanently deleted.",
        confirmText: "Done"
      });
    } catch (error) {
      const message = error.status === 404 || error.status === 405
        ? "The live API does not have account deletion yet. Redeploy the API, then try again."
        : error.message || "Could not delete your account right now.";
      await showAccountActionModal({
        label: "Could Not Delete",
        title: "Account was not deleted",
        message,
        confirmText: "OK"
      });
    }
    return;
  }

  saveAccounts(getAccounts().filter((account) => account.id !== user.id));
  clearUserLocalData(user);
  localStorage.removeItem(sessionKey);
  renderAuthControls();
  await renderSavedCards();
  await showAccountActionModal({
    label: "Account Deleted",
    title: "Account deleted",
    message: "Your account and saved account data have been permanently deleted.",
    confirmText: "Done"
  });
}

function formatTimestamp(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return "";
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const amPm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear().toString().slice(-2);
  return `${hours}:${minutes}${amPm}, ${month}/${day}/${year}`;
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

  nav.insertAdjacentHTML("afterend", `
    <div class="auth-nav-item">
      <div class="auth-controls" id="authControls"></div>
    </div>
  `);

  document.body.insertAdjacentHTML("beforeend", `
    <div class="auth-modal" id="authModal" hidden>
      <div class="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <button class="auth-close" id="authClose" type="button" aria-label="Close login">&times;</button>
        <p class="eyebrow dark" id="authModeLabel">Account</p>
        <h2 id="authTitle">Sign up or log in</h2>
        <div class="auth-tabs" id="authTabs">
          <button class="auth-tab active" id="showSignup" type="button">Sign Up</button>
          <button class="auth-tab" id="showLogin" type="button">Login</button>
        </div>
        <form class="auth-form" id="signupForm">
          <label for="signupUsername">Username</label>
          <input class="form-control" id="signupUsername" name="username" type="text" minlength="3" maxlength="50" autocomplete="username" aria-describedby="signupUsernameFeedback" required>
          <p class="username-feedback" id="signupUsernameFeedback" aria-live="polite"></p>
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
          <button class="auth-reset-link" id="forgotPasswordButton" type="button" hidden>Forgot password?</button>
        </form>
        <form class="auth-form" id="resetPasswordForm" hidden>
          <input id="resetEmail" name="email" type="hidden">
          <input id="resetToken" name="token" type="hidden">
          <label for="resetPassword">New password</label>
          <div class="password-field">
            <input class="form-control" id="resetPassword" name="password" type="password" autocomplete="new-password" required>
            <button class="password-toggle" type="button" data-password-toggle="resetPassword" aria-label="Show password" title="Show password">&#128065;</button>
          </div>
          <label for="resetPasswordConfirm">Confirm new password</label>
          <div class="password-field">
            <input class="form-control" id="resetPasswordConfirm" name="confirmPassword" type="password" autocomplete="new-password" required>
            <button class="password-toggle" type="button" data-password-toggle="resetPasswordConfirm" aria-label="Show password" title="Show password">&#128065;</button>
          </div>
          <button class="btn btn-primary" type="submit">Reset Password</button>
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
        <h2 id="signupThanksTitle">Welcome to CardShop Collectables!</h2>
        <p class="signup-thanks-message" id="signupThanksMessage"></p>
        <a class="btn btn-primary" href="loyaltyprogram.html">View Loyalty Program</a>
      </div>
    </div>
  `);

  document.body.insertAdjacentHTML("beforeend", `
    <div class="auth-modal account-action-modal" id="accountActionModal" hidden>
      <div class="auth-dialog account-action-dialog" role="dialog" aria-modal="true" aria-labelledby="accountActionTitle">
        <p class="eyebrow dark" id="accountActionLabel">Account</p>
        <h2 id="accountActionTitle">Confirm action</h2>
        <p class="account-action-message" id="accountActionMessage"></p>
        <div class="account-action-buttons">
          <button class="account-action-secondary" id="accountActionCancel" type="button">Cancel</button>
          <button class="btn btn-primary account-action-confirm" id="accountActionConfirm" type="button">Continue</button>
        </div>
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

  message.innerHTML = `Thank you, <span class="signup-thanks-name">${escapeHtml(username)}</span> for signing up! If you have any questions about how the loyalty program works, click the button below!`;
  modal.hidden = false;
}

function hideSignupThanks() {
  const modal = document.querySelector("#signupThanksModal");
  if (modal) {
    modal.hidden = true;
  }
}

function showAccountActionModal({ label = "Account", title, message, confirmText = "OK", cancelText = "", danger = false }) {
  const modal = document.querySelector("#accountActionModal");
  const labelEl = document.querySelector("#accountActionLabel");
  const titleEl = document.querySelector("#accountActionTitle");
  const messageEl = document.querySelector("#accountActionMessage");
  const cancelButton = document.querySelector("#accountActionCancel");
  const confirmButton = document.querySelector("#accountActionConfirm");
  if (!modal || !labelEl || !titleEl || !messageEl || !cancelButton || !confirmButton) {
    return Promise.resolve(true);
  }

  labelEl.textContent = label;
  titleEl.textContent = title;
  messageEl.textContent = message;
  cancelButton.textContent = cancelText || "Cancel";
  cancelButton.hidden = !cancelText;
  confirmButton.textContent = confirmText;
  confirmButton.classList.toggle("danger", danger);
  modal.hidden = false;
  confirmButton.focus();

  return new Promise((resolve) => {
    accountActionModalResolver = resolve;
  });
}

function closeAccountActionModal(result) {
  const modal = document.querySelector("#accountActionModal");
  if (modal) {
    modal.hidden = true;
  }

  if (accountActionModalResolver) {
    accountActionModalResolver(result);
    accountActionModalResolver = null;
  }
}

function setAuthMode(mode) {
  const isSignup = mode === "signup";
  const isLogin = mode === "login";
  const isReset = mode === "reset";
  document.querySelector("#signupForm").hidden = !isSignup;
  document.querySelector("#loginForm").hidden = !isLogin;
  document.querySelector("#resetPasswordForm").hidden = !isReset;
  document.querySelector("#authTabs").hidden = isReset;
  document.querySelector("#showSignup").classList.toggle("active", isSignup);
  document.querySelector("#showLogin").classList.toggle("active", isLogin);
  document.querySelector("#authTitle").textContent = isSignup ? "Create your account" : isReset ? "Reset your password" : "Welcome back";
  document.querySelector("#authModeLabel").textContent = isSignup ? "Sign Up" : isReset ? "Password Reset" : "Login";
  document.querySelector("#authMessage").textContent = isReset
    ? "Choose a new password for your account."
    : hasApiBackend() ? "Accounts are saved to the CardShop server." : "Accounts are saved in this browser for this static site.";
  if (isSignup) {
    renderUsernameFeedback();
  }
  hideForgotPasswordButton();
}

function setAuthMessage(message) {
  const authMessage = document.querySelector("#authMessage");
  if (authMessage) {
    authMessage.textContent = message;
  }
}

function showPasswordResetEmailNotice(email) {
  window.alert(`Password reset email sent to ${email}. Please check that inbox, including spam or junk, for the reset link.`);
}

function showPasswordResetSuccessNotice() {
  window.alert("Thanks for resetting your password. You can log in with your new password now.");
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

function showForgotPasswordButton() {
  const button = document.querySelector("#forgotPasswordButton");
  if (button) {
    button.hidden = false;
  }
}

function hideForgotPasswordButton() {
  const button = document.querySelector("#forgotPasswordButton");
  if (button) {
    button.hidden = true;
  }
}

function clearLoginErrors() {
  clearLoginEmailError();
  clearLoginPasswordError();
  hideForgotPasswordButton();
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

function validateResetPasswordMatch() {
  const passwordInput = document.querySelector("#resetPassword");
  const confirmInput = document.querySelector("#resetPasswordConfirm");
  if (!passwordInput || !confirmInput) {
    return;
  }

  confirmInput.setCustomValidity(
    confirmInput.value && passwordInput.value !== confirmInput.value
      ? "Passwords must match."
      : ""
  );
}

function renderAuthControls() {
  const authControls = document.querySelector("#authControls");
  if (!authControls) {
    return;
  }

  const user = getActiveUser();
  if (!user) {
    authControls.innerHTML = `<button class="auth-link" id="openLogin" type="button">Login</button><button class="btn btn-primary btn-sm" id="openSignup" type="button">Sign Up</button>`;
    return;
  }

  const avatarUrl = getAccountAvatar(user);
  const greetingAvatar = avatarUrl
    ? `<span class="auth-greeting-avatar"><img src="${escapeHtml(avatarUrl)}" alt="" aria-hidden="true"></span>`
    : `<span class="auth-greeting-avatar">${escapeHtml((user.username || "?").slice(0, 1).toUpperCase())}</span>`;

  authControls.innerHTML = `
    <div class="account-menu-wrap">
      <button class="auth-greeting" id="accountMenuButton" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="accountMenu">
        ${greetingAvatar}<span>Hi, ${escapeHtml(user.username)}</span>
      </button>
      <div class="account-menu" id="accountMenu" role="menu" hidden>
        ${accountSummaryMarkup(user, accountRewardSummary(user, []), true)}
      </div>
    </div>
  `;
}

async function createAccount(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const username = form.get("username").trim();
  const usernameMessage = usernameValidationMessage(username);
  renderUsernameFeedback();
  if (usernameMessage) {
    markDuplicateSignupField("username");
    setAuthMessage(usernameMessage);
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
      await syncLocalSavedCardsToApi(authResponse.user);
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
      await syncLocalSavedCardsToApi(authResponse.user);
      event.target.reset();
      hideAuthModal();
      renderAuthControls();
      await renderSavedCards();
    } catch (error) {
      if (error.message === "Email not registered.") {
        markLoginEmailError();
      } else if (error.message === "Password is incorrect.") {
        markLoginPasswordError();
        showForgotPasswordButton();
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
    showForgotPasswordButton();
    setAuthMessage("Password is incorrect.");
    return;
  }

  localStorage.setItem(sessionKey, account.id);
  event.target.reset();
  hideAuthModal();
  renderAuthControls();
  renderSavedCards();
}

function buildPasswordResetUrl(email, token) {
  const url = new URL(window.location.href);
  url.searchParams.set("resetToken", token);
  url.searchParams.set("email", email);
  url.hash = "";
  return url.toString();
}

function currentResetUrlBase() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function requestPasswordReset() {
  const emailInput = document.querySelector("#loginEmail");
  const email = emailInput?.value.trim().toLowerCase() || "";

  if (!isValidEmail(email)) {
    markLoginEmailError();
    setAuthMessage("Enter the account email first, then request a reset link.");
    return;
  }

  if (hasApiBackend()) {
    try {
      await apiRequest("/api/auth/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ email, resetUrlBase: currentResetUrlBase() })
      });
      setAuthMessage(`Password reset email sent to ${email}. Check that inbox, spam, or junk folder for the reset link.`);
      showPasswordResetEmailNotice(email);
    } catch (error) {
      if (error.message === "Email not registered.") {
        markLoginEmailError();
      } else if (error.status === 404) {
        setAuthMessage("Password reset is not available on the running API yet. Restart or redeploy the API, then try again.");
        return;
      }
      setAuthMessage(error.message);
    }
    return;
  }

  const accounts = getAccounts();
  const account = accounts.find((candidate) => candidate.email === email);
  if (!account) {
    markLoginEmailError();
    setAuthMessage("Email not registered.");
    return;
  }

  const token = randomId();
  const resetRecord = {
    email,
    tokenHash: await hashPassword(token, account.salt),
    expiresAt: Date.now() + 60 * 60 * 1000
  };
  localStorage.setItem(localPasswordResetKey, JSON.stringify(resetRecord));

  const resetUrl = buildPasswordResetUrl(email, token);
  const subject = encodeURIComponent("Reset your CardShop Collectables password");
  const body = encodeURIComponent(`Click this link to reset your password. It expires in 1 hour.\n\n${resetUrl}`);
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
  setAuthMessage(`Your email app should open with a reset link for ${email}. Send that message to yourself, then check that inbox, spam, or junk folder.`);
  showPasswordResetEmailNotice(email);
}

function showPasswordResetForm(email, token) {
  showAuthModal("reset");
  document.querySelector("#resetEmail").value = email;
  document.querySelector("#resetToken").value = token;
}

async function resetPassword(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const email = form.get("email").trim().toLowerCase();
  const token = form.get("token");
  const password = form.get("password");
  const confirmPassword = form.get("confirmPassword");

  if (!password || password.length < 8) {
    setAuthMessage("Password must be at least 8 characters.");
    return;
  }

  if (password !== confirmPassword) {
    setAuthMessage("The two password fields need to match.");
    return;
  }

  if (hasApiBackend()) {
    try {
      await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email, token, password })
      });
      event.target.reset();
      setAuthMode("login");
      document.querySelector("#loginEmail").value = email;
      setAuthMessage("Password updated. You can log in now.");
      window.history.replaceState({}, document.title, currentResetUrlBase());
      showPasswordResetSuccessNotice();
    } catch (error) {
      setAuthMessage(error.message);
    }
    return;
  }

  const accounts = getAccounts();
  const account = accounts.find((candidate) => candidate.email === email);
  let resetRecord = null;
  try {
    resetRecord = JSON.parse(localStorage.getItem(localPasswordResetKey));
  } catch (error) {
    resetRecord = null;
  }

  if (!account || !resetRecord || resetRecord.email !== email || resetRecord.expiresAt <= Date.now()) {
    setAuthMessage("This reset link is invalid or expired.");
    return;
  }

  const tokenHash = await hashPassword(token, account.salt);
  if (tokenHash !== resetRecord.tokenHash) {
    setAuthMessage("This reset link is invalid or expired.");
    return;
  }

  account.passwordHash = await hashPassword(password, account.salt);
  saveAccounts(accounts);
  localStorage.removeItem(localPasswordResetKey);
  event.target.reset();
  setAuthMode("login");
  document.querySelector("#loginEmail").value = email;
  setAuthMessage("Password updated. You can log in now.");
  window.history.replaceState({}, document.title, currentResetUrlBase());
  showPasswordResetSuccessNotice();
}

function openPasswordResetFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("resetToken");
  const email = params.get("email");
  if (token && email) {
    showPasswordResetForm(email.trim().toLowerCase(), token);
  }
}

function initializeAuth() {
  injectAuthControls();
  highlightCurrentNavLink();
  renderAuthControls();

  document.addEventListener("click", (event) => {
    if (event.target.closest("#accountActionConfirm")) {
      closeAccountActionModal(true);
      return;
    }
    if (event.target.closest("#accountActionCancel")) {
      closeAccountActionModal(false);
      return;
    }
    if (event.target.closest("#accountMenuButton")) {
      toggleAccountMenu();
      return;
    }
    if (!event.target.closest("#accountMenu")) {
      closeAccountMenu();
    }
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
    if (event.target.closest("#deleteAccountButton")) {
      deleteCurrentAccount();
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
    if (event.target.closest("#forgotPasswordButton")) {
      requestPasswordReset();
    }
    if (event.target.closest("#removeAccountAvatar")) {
      const user = getActiveUser();
      setAccountAvatar(user, "");
      refreshOpenAccountMenu();
    }
    const passwordToggle = event.target.closest("[data-password-toggle]");
    if (passwordToggle) {
      togglePasswordVisibility(passwordToggle);
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("#accountAvatarFile")) {
      setAvatarFromFile(event.target);
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.matches("#accountAvatarUrlForm")) {
      setAvatarFromUrl(event);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAccountMenu();
    }
  });

  const signupPasswordInput = document.querySelector("#signupPassword");
  if (signupPasswordInput) {
    signupPasswordInput.addEventListener("input", function () {
      const len = this.value.length;
      if (len > 0 && len < 8) {
        this.setCustomValidity(`Please enter a password at least 8 characters long (you are currently using ${len} character${len === 1 ? "" : "s"})`);
      } else {
        this.setCustomValidity("");
      }
    });
  }

  const resetPasswordInput = document.querySelector("#resetPassword");
  if (resetPasswordInput) {
    resetPasswordInput.addEventListener("input", function () {
      const len = this.value.length;
      if (len > 0 && len < 8) {
        this.setCustomValidity(`Please enter a password at least 8 characters long (you are currently using ${len} character${len === 1 ? "" : "s"})`);
      } else {
        this.setCustomValidity("");
      }
      validateResetPasswordMatch();
    });
  }

  document.querySelector("#resetPasswordConfirm")?.addEventListener("input", validateResetPasswordMatch);

  // Clear duplicate field highlighting when user types in those fields
  document.querySelectorAll("#signupUsername, #signupEmail").forEach((input) => {
    input.addEventListener("input", function () {
      this.classList.remove("is-duplicate");
      const label = this.id === "signupUsername"
        ? document.querySelector("label[for=\"signupUsername\"]")
        : document.querySelector("label[for=\"signupEmail\"]");
      if (label) label.classList.remove("is-duplicate-label");
      if (this.id === "signupUsername") {
        renderUsernameFeedback();
      }
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
  document.querySelector("#loginPassword")?.addEventListener("input", () => {
    clearLoginPasswordError();
    hideForgotPasswordButton();
  });

  document.querySelector("#signupForm")?.addEventListener("submit", createAccount);
  document.querySelector("#loginForm")?.addEventListener("submit", loginAccount);
  document.querySelector("#resetPasswordForm")?.addEventListener("submit", resetPassword);
  openPasswordResetFromUrl();
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

function readLocalSavedCards(key) {
  try {
    const cards = JSON.parse(localStorage.getItem(key));
    return Array.isArray(cards) ? cards : [];
  } catch (error) {
    return [];
  }
}

function normalizeCardForApi(card) {
  return {
    cardApiId: card.cardApiId || card.id || null,
    cardName: card.cardName || card.name || "",
    cardSet: card.cardSet || card.set || null,
    cardNumber: card.cardNumber || card.number || null,
    imageUrl: card.imageUrl || card.image || null,
    marketPrice: hasPrice(card.marketPrice ?? card.market) ? Number(card.marketPrice ?? card.market) : null,
    shopPrice: hasPrice(card.shopPrice) ? Number(card.shopPrice) : null
  };
}

function savedCardKey(card) {
  const normalized = normalizeCardForApi(card);
  return [
    normalized.cardApiId || "",
    normalized.cardName.toLowerCase(),
    (normalized.cardSet || "").toLowerCase(),
    (normalized.cardNumber || "").toLowerCase()
  ].join("|");
}

async function syncLocalSavedCardsToApi(user) {
  if (!hasApiBackend() || !user) {
    return;
  }

  const localKeys = [`${savedCardsBaseKey}-guest`, savedCardsKeyForUser(user)];
  const localCards = localKeys.flatMap(readLocalSavedCards);
  if (!localCards.length) {
    return;
  }

  const existingCards = await getSavedCards();
  const existingKeys = new Set(existingCards.map(savedCardKey));
  const cardsToImport = localCards
    .filter((card) => normalizeCardForApi(card).cardName)
    .filter((card) => {
      const key = savedCardKey(card);
      if (existingKeys.has(key)) {
        return false;
      }
      existingKeys.add(key);
      return true;
    });

  for (const card of cardsToImport.reverse()) {
    await apiRequest("/api/cards", {
      method: "POST",
      body: JSON.stringify(normalizeCardForApi(card))
    });
  }

  localKeys.forEach((key) => localStorage.removeItem(key));
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
        body: JSON.stringify(normalizeCardForApi(card))
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

function selectedCardCondition() {
  return lookupForm?.elements.cardCondition?.value || "Near Mint";
}

function conditionAdjustedPrice(price, condition) {
  if (!hasPrice(price)) {
    return 0;
  }
  return Math.round(Number(price) * (conditionMultipliers[condition] || 1) * 100) / 100;
}

function average(values) {
  const validValues = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!validValues.length) {
    return 0;
  }
  return validValues.reduce((total, value) => total + value, 0) / validValues.length;
}

function buildCardQuery(name, setText) {
  const cleanName = wildcardQueryText(name);
  const cleanSet = wildcardQueryText(setText);
  const compactSet = cardNumberSearchText(cleanSet);
  const terms = [apiNameQuery(cleanName)];
  const numberParts = cardNumberParts(cleanSet);

  if (numberParts) {
    terms.push(`number:${numberParts.number}`);
    terms.push(`set.printedTotal:${numberParts.total}`);
  } else if (cleanSet) {
    const setTerms = [`set.name:"${cleanSet}"`, `set.series:"${cleanSet}"`];
    if (isLikelyCardNumberText(cleanSet)) {
      setTerms.unshift(`number:${compactSet}`);
    }
    terms.push(`(${setTerms.join(" OR ")})`);
  }

  return terms.join(" ");
}

function buildFallbackCardQuery(name, setText) {
  const cleanName = wildcardQueryText(name);
  const cleanSet = wildcardQueryText(setText);
  const numberParts = cardNumberParts(setText);
  if (numberParts) {
    return `${apiNameQuery(cleanName)} number:${numberParts.number}`;
  }
  if (isLikelyCardNumberText(cleanSet)) {
    return `${apiNameQuery(cleanName)} number:${cardNumberSearchText(cleanSet)}`;
  }
  return apiNameQuery(cleanName);
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

  if (!options.length) {
    target.innerHTML = "";
    target.hidden = true;
    return;
  }

  target.innerHTML = options.slice(0, 18).map((option) => {
    const label = option.label ? `<span>${escapeHtml(option.label)}</span>` : "";
    const cardData = option.card ? ` data-card="${encodeURIComponent(JSON.stringify(option.card))}"` : "";
    return `<button class="autocomplete-option" type="button" role="option" data-value="${escapeHtml(option.value)}"${cardData}>${escapeHtml(option.value)}${label}</button>`;
  }).join("");
  target.hidden = false;
}

function renderSuggestionMessage(target, message) {
  if (!target) {
    return;
  }

  target.innerHTML = `<div class="autocomplete-option autocomplete-message">${escapeHtml(message)}</div>`;
  target.hidden = false;
}

function hideSuggestions(target) {
  if (target) {
    target.hidden = true;
  }
}

function hideAllSuggestions() {
  hideSuggestions(cardNameSuggestions);
  hideSuggestions(cardSetSuggestions);
}

function wildcardQueryText(text) {
  return text.trim().replace(/"/g, "").replace(/[^A-Za-z0-9 ':-]/g, " ").replace(/\s+/g, " ");
}

function apiWildcardText(text) {
  return wildcardQueryText(text).replace(/\s+/g, "*");
}

function apiNameQuery(name) {
  return `name:${apiWildcardText(name)}*`;
}

function cardNumberSearchText(text) {
  return wildcardQueryText(text).replace(/\s+/g, "");
}

function isLikelyCardNumberText(text) {
  const cleanText = cardNumberSearchText(text);
  return /^[A-Za-z]{1,8}\d+[A-Za-z0-9-]*$/i.test(cleanText) || /^\d+[A-Za-z0-9-]*$/i.test(cleanText);
}

function startsWithIgnoreCase(value, prefix) {
  return value.toLowerCase().startsWith(prefix.toLowerCase());
}

function cardDisplayNumber(card) {
  const printedTotal = card.set?.printedTotal ? `/${card.set.printedTotal}` : "";
  return card.number ? `${card.number}${printedTotal}` : "";
}

function cardSetName(card) {
  return card.set?.name || "Unknown set";
}

function cardSuggestionDetail(card) {
  return [
    cardDisplayNumber(card) ? `#${cardDisplayNumber(card)}` : "",
    cardSetName(card),
    card.rarity || ""
  ].filter(Boolean).join(" - ");
}

function cardNameMatchesInput(card, text) {
  return card.name.toLowerCase().includes(text.toLowerCase());
}

function cardMatchesSetInput(card, setText) {
  const setName = cardSetName(card);
  const number = card.number || "";
  const displayNumber = cardDisplayNumber(card);
  const haystack = `${setName} ${number} ${displayNumber}`.toLowerCase();
  return haystack.includes(setText.toLowerCase());
}

function cardNameOptionsFromCards(cards, text) {
  return uniqueBy(
    cards.filter((card) => cardNameMatchesInput(card, text)),
    (card) => `${card.name.toLowerCase()}-${card.set?.id || cardSetName(card)}-${card.number || ""}-${card.id || ""}`
  ).map((card) => ({
    value: card.name,
    label: cardSuggestionDetail(card),
    card
  }));
}

function cardSetOptionsFromCards(cards, setText) {
  const filteredResults = setText.length >= 1
    ? cards.filter((card) => cardMatchesSetInput(card, setText))
    : cards;

  const setOptions = uniqueBy(filteredResults, (card) => cardSetName(card))
    .filter((card) => !setText || startsWithIgnoreCase(cardSetName(card), setText) || !/^[A-Za-z]/.test(setText))
    .map((card) => ({
      value: cardSetName(card),
      label: "Set",
      card
    }));

  const numberOptions = uniqueBy(
    filteredResults.filter((card) => cardDisplayNumber(card)),
    (card) => `${card.set?.id || cardSetName(card)}-${cardDisplayNumber(card)}`
  ).map((card) => ({
    value: cardDisplayNumber(card),
    label: cardSuggestionDetail(card),
    card
  }));

  return /^\d/.test(setText)
    ? [...numberOptions, ...setOptions]
    : [...setOptions, ...numberOptions];
}

async function fetchCardSuggestions(queryText, pageSize = 12, options = {}) {
  const controller = options.controller || new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 3500);
  const query = encodeURIComponent(queryText);
  const orderBy = encodeURIComponent(options.orderBy || "-set.releaseDate");

  try {
    const response = await fetch(`https://api.pokemontcg.io/v2/cards?q=${query}&pageSize=${pageSize}&orderBy=${orderBy}`, {
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
    if (nameSuggestionController) {
      nameSuggestionController.abort();
    }
    renderDatalist(cardNameSuggestions, []);
    return;
  }

  const canUseCachedNames = cachedNameQuery && text.toLowerCase().startsWith(cachedNameQuery.toLowerCase());
  const cachedOptions = canUseCachedNames ? cardNameOptionsFromCards(cachedNameCards, text) : [];
  if (cachedOptions.length) {
    renderDatalist(cardNameSuggestions, cachedOptions);
  } else {
    renderSuggestionMessage(cardNameSuggestions, "Searching...");
  }

  if (nameSuggestionController) {
    nameSuggestionController.abort();
  }
  nameSuggestionController = new AbortController();
  const requestId = ++nameSuggestionRequestId;
  cachedNameQuery = text;
  let results = await fetchCardSuggestions(`name:${apiWildcardText(text)}*`, 40, {
    controller: nameSuggestionController,
    orderBy: "name",
    timeoutMs: 2500
  });
  if (results.length < 12) {
    const broadResults = await fetchCardSuggestions(`name:*${apiWildcardText(text)}*`, 40, {
      controller: nameSuggestionController,
      orderBy: "name",
      timeoutMs: 2500
    });
    results = uniqueBy([...results, ...broadResults], (card) => card.id || `${card.name}-${card.set?.id}-${card.number}`);
  }

  if (requestId !== nameSuggestionRequestId || text !== wildcardQueryText(cardNameInput?.value || "")) {
    return;
  }

  cachedNameCards = results;
  renderDatalist(cardNameSuggestions, cardNameOptionsFromCards(cachedNameCards, text));
}

async function refreshSetCardsForSelectedName(name) {
  if (setSuggestionController) {
    setSuggestionController.abort();
  }
  setSuggestionController = new AbortController();
  const requestId = ++setSuggestionRequestId;
  const exactCards = await fetchCardSuggestions(`name:"${name}"`, 120, {
    controller: setSuggestionController,
    timeoutMs: 3500
  });
  if (requestId !== setSuggestionRequestId || name !== wildcardQueryText(cardNameInput?.value || "")) {
    return;
  }

  const matchingCards = exactCards.filter((card) => card.name.toLowerCase() === name.toLowerCase());
  cachedSetCardsName = name;
  cachedSetCards = matchingCards.length ? matchingCards : exactCards;
  renderDatalist(cardSetSuggestions, cardSetOptionsFromCards(cachedSetCards, wildcardQueryText(cardSetInput?.value || "")));
}

async function updateCardSetSuggestions() {
  const name = wildcardQueryText(cardNameInput?.value || "");
  const setText = wildcardQueryText(cardSetInput?.value || "");
  if (name.length < 2) {
    renderDatalist(cardSetSuggestions, []);
    return;
  }

  if (name === cachedSetCardsName && cachedSetCards.length) {
    renderDatalist(cardSetSuggestions, cardSetOptionsFromCards(cachedSetCards, setText));
  }

  if (name !== cachedSetCardsName) {
    if (setSuggestionController) {
      setSuggestionController.abort();
    }
    setSuggestionController = new AbortController();
    const requestId = ++setSuggestionRequestId;
    cachedSetCardsName = name;
    renderSuggestionMessage(cardSetSuggestions, "Searching...");
    const exactCards = await fetchCardSuggestions(`name:"${name}"`, 60, {
      controller: setSuggestionController,
      timeoutMs: 3000
    });
    if (requestId !== setSuggestionRequestId || name !== wildcardQueryText(cardNameInput?.value || "")) {
      return;
    }
    cachedSetCards = exactCards.some((card) => card.name.toLowerCase() === name.toLowerCase())
      ? exactCards.filter((card) => card.name.toLowerCase() === name.toLowerCase())
      : await fetchCardSuggestions(`name:${apiWildcardText(name)}*`, 60, {
        controller: setSuggestionController,
        orderBy: "name",
        timeoutMs: 3000
      });
    if (requestId !== setSuggestionRequestId || name !== wildcardQueryText(cardNameInput?.value || "")) {
      return;
    }
  }

  renderDatalist(cardSetSuggestions, cardSetOptionsFromCards(cachedSetCards, setText));
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

function resultCardTemplate(card, priceSources, condition) {
  const nearMintMarket = average(priceSources.map((source) => source.value));
  const conditionMarket = conditionAdjustedPrice(nearMintMarket, condition);
  const image = card.images?.small || card.images?.large || "";
  const name = escapeHtml(card.name);
  const setName = escapeHtml(card.set?.name || "Unknown set");
  const number = escapeHtml(card.number || "");
  const rarity = escapeHtml(card.rarity || "Pokemon card");
  const conditionText = escapeHtml(condition);
  const conditionRow = condition === "Near Mint" ? "" : `
          <span>${conditionText} Price</span><strong class="condition-value">${hasPrice(conditionMarket) ? money(conditionMarket) : "N/A"}</strong>`;
  const payload = encodeURIComponent(JSON.stringify({
    id: card.id,
    name: card.name,
    set: card.set?.name || "Unknown set",
    number: card.number || "",
    image,
    market: nearMintMarket,
    conditionPrice: conditionMarket,
    condition,
    priceSources
  }));
  return `
    <article class="scanner-result">
      <img src="${escapeHtml(image)}" alt="${name} card">
      <div>
        <span class="condition">${rarity} - ${conditionText}</span>
        <h3>${name}</h3>
        <p>${setName} ${number ? `#${number}` : ""}</p>
        <div class="price-grid compact">
          <span>Ungraded Price (Near Mint)</span><strong>${hasPrice(nearMintMarket) ? money(nearMintMarket) : "No price yet"}</strong>
${conditionRow}
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

  hideAllSuggestions();
  document.activeElement?.blur();

  if (submitButton) {
    submitButton.disabled = true;
  }

  lookupResults.innerHTML = "<p class=\"scanner-status\">Finding matching cards and calculating value...</p>";

  try {
    let results = await fetchCards(buildCardQuery(name, setText));
    if (!results.length && setText.trim()) {
      results = await fetchCards(buildFallbackCardQuery(name, setText));
    }

    const condition = selectedCardCondition();
    const pricedCards = results.map(pricedCard);
    const noPriceMessage = pricedCards.some((item) => !item.sources.length)
      ? "<p class=\"scanner-status\">Some matched cards do not have ungraded sales data yet. This often happens when a card is very new or the market source has not posted sales/pricing data.</p>"
      : "";
    lookupResults.innerHTML = results.length
      ? pricedCards.map((item) => resultCardTemplate(item.card, item.sources, condition)).join("") + noPriceMessage
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

async function fetchCardByApiId(cardApiId) {
  if (!cardApiId) {
    return null;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`https://api.pokemontcg.io/v2/cards/${encodeURIComponent(cardApiId)}`, {
      signal: controller.signal
    });
    if (!response.ok) {
      return null;
    }

    const body = await response.json();
    return body.data || null;
  } catch (error) {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function pokemonApiIdForSavedCard(card) {
  const apiId = card.cardApiId || card.CardApiId;
  if (apiId) {
    return apiId;
  }

  const id = card.id || card.Id;
  return typeof id === "string" && /[A-Za-z]/.test(id) ? id : null;
}

async function findCurrentCardForSavedCard(savedCard) {
  const apiCard = await fetchCardByApiId(pokemonApiIdForSavedCard(savedCard));
  if (apiCard) {
    return apiCard;
  }

  const name = savedCard.name || savedCard.cardName || savedCard.CardName || "";
  const setText = savedCard.number || savedCard.cardNumber || savedCard.CardNumber || savedCard.set || savedCard.cardSet || savedCard.CardSet || "";
  const results = await fetchCards(buildCardQuery(name, setText));
  return results[0] || null;
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
    const timestampHtml = timestamp ? `<span class="card-timestamp">Entered: ${timestamp}</span>` : "";
    const refreshPayload = encodeURIComponent(JSON.stringify(card));
    return `
    <article class="saved-card">
      <button class="delete-saved-card-button" type="button" data-card="${refreshPayload}" aria-label="Delete saved card">x</button>
      <button class="refresh-price-button" type="button" data-card="${refreshPayload}" aria-label="Refresh price">Refresh price</button>
      <img src="${escapeHtml(card.image || card.imageUrl || "")}" alt="${escapeHtml(card.name || card.cardName)} card">
      <div>
        <h3>${escapeHtml(card.name || card.cardName)}</h3>
        <p>${escapeHtml(card.set || card.cardSet || "")} ${card.number || card.cardNumber ? `#${escapeHtml(card.number || card.cardNumber)}` : ""}</p>
        <strong>${hasPrice(card.market || card.marketPrice) ? money(card.market || card.marketPrice) : "No price"}</strong>
        ${timestampHtml}
      </div>
    </article>`;
  }).join("");
}

async function deleteSavedCard(savedCard, button) {
  const savedId = savedCard.id || savedCard.Id;
  if (!savedId) {
    setScannerStatus("Could not delete this card because it does not have a saved id.");
    return;
  }

  button.disabled = true;

  try {
    if (hasApiBackend()) {
      await apiRequest(`/api/cards/${savedId}`, { method: "DELETE" });
    } else {
      const cards = await getSavedCards();
      const updatedCards = cards.filter((card) => (card.id || card.Id) !== savedId);
      localStorage.setItem(currentSavedCardsKey(), JSON.stringify(updatedCards));
    }

    await renderSavedCards();
    setScannerStatus("Deleted saved card.");
  } catch (error) {
    button.disabled = false;
    setScannerStatus(error.message || "Could not delete this saved card.");
  }
}

async function refreshSavedCardPrice(savedCard, button) {
  const savedId = savedCard.id || savedCard.Id;
  if (!savedId) {
    setScannerStatus("Could not refresh this card because it does not have a saved id.");
    return;
  }

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Refreshing...";

  try {
    const currentCard = await findCurrentCardForSavedCard(savedCard);
    if (!currentCard) {
      throw new Error("Could not find a current price for this card.");
    }

    const marketPrice = automaticCardValue(currentCard);
    const rawShop = marketPrice * 0.8;
    const shopPrice = hasPrice(marketPrice) ? (marketPrice > 35 ? Math.ceil(rawShop / 5) * 5 : rawShop) : null;

    if (hasApiBackend()) {
      await apiRequest(`/api/cards/${savedId}/price`, {
        method: "PUT",
        body: JSON.stringify({
          marketPrice: hasPrice(marketPrice) ? marketPrice : null,
          shopPrice
        })
      });
    } else {
      const cards = await getSavedCards();
      const updatedCards = cards.map((card) => {
        if ((card.id || card.Id) !== savedId) {
          return card;
        }
        return {
          ...card,
          market: hasPrice(marketPrice) ? marketPrice : null,
          marketPrice: hasPrice(marketPrice) ? marketPrice : null,
          shopPrice
        };
      });
      localStorage.setItem(currentSavedCardsKey(), JSON.stringify(updatedCards));
    }

    await renderSavedCards();
    setScannerStatus(`Updated ${currentCard.name} to ${hasPrice(marketPrice) ? money(marketPrice) : "no current price"}.`);
  } catch (error) {
    setScannerStatus(error.message || "Could not refresh this card price.");
    button.disabled = false;
    button.textContent = originalText;
  }
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

if (savedCardsTarget) {
  savedCardsTarget.addEventListener("click", (event) => {
    const deleteButton = event.target.closest(".delete-saved-card-button");
    if (deleteButton) {
      deleteSavedCard(JSON.parse(decodeURIComponent(deleteButton.dataset.card)), deleteButton);
      return;
    }

    const refreshButton = event.target.closest(".refresh-price-button");
    if (refreshButton) {
      refreshSavedCardPrice(JSON.parse(decodeURIComponent(refreshButton.dataset.card)), refreshButton);
    }
  });
}

if (cardNameInput) {
  cardNameInput.addEventListener("input", () => {
    cachedSetCardsName = "";
    cachedSetCards = [];
    hideSuggestions(cardNameSuggestions);
    hideSuggestions(cardSetSuggestions);
  });
  cardNameInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    hideAllSuggestions();
    cardSetInput?.focus();
  });
}

if (cardSetInput) {
  cardSetInput.addEventListener("input", () => {
    hideSuggestions(cardSetSuggestions);
  });
  cardSetInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    hideAllSuggestions();
    cardSetInput.blur();
    lookupForm?.requestSubmit();
  });
}

if (cardNameToggle) {
  cardNameToggle.addEventListener("click", async () => {
    if (!cardNameSuggestions?.hidden) {
      hideSuggestions(cardNameSuggestions);
      return;
    }
    hideSuggestions(cardSetSuggestions);
    await updateCardNameSuggestions();
  });
}

if (cardSetToggle) {
  cardSetToggle.addEventListener("click", async () => {
    if (!cardSetSuggestions?.hidden) {
      hideSuggestions(cardSetSuggestions);
      return;
    }
    hideSuggestions(cardNameSuggestions);
    cachedSetCardsName = "";
    await updateCardSetSuggestions();
  });
}

document.addEventListener("click", (event) => {
  const option = event.target.closest(".autocomplete-option");
  if (option) {
    if (option.classList.contains("autocomplete-message")) {
      return;
    }

    const menu = option.closest(".autocomplete-menu");
    if (menu?.id === "cardNameSuggestions" && cardNameInput) {
      const card = option.dataset.card ? JSON.parse(decodeURIComponent(option.dataset.card)) : null;
      cardNameInput.value = option.dataset.value || "";
      cardSetInput.value = card ? cardSetName(card) : "";
      cachedSetCardsName = cardNameInput.value;
      cachedSetCards = card ? [card] : [];
      hideSuggestions(cardNameSuggestions);
      cardSetInput.focus();
      return;
    }

    if (menu?.id === "cardSetSuggestions" && cardSetInput) {
      const card = option.dataset.card ? JSON.parse(decodeURIComponent(option.dataset.card)) : null;
      cardSetInput.value = option.dataset.value || "";
      if (card && cardNameInput && !cardNameInput.value.trim()) {
        cardNameInput.value = card.name;
      }
      hideSuggestions(cardSetSuggestions);
      return;
    }
  }

  if (!event.target.closest(".autocomplete-field")) {
    hideAllSuggestions();
  }
});

if (clearSavedCardsButton) {
  clearSavedCardsButton.addEventListener("click", async () => {
    if (hasApiBackend()) {
      savedCardsTarget.innerHTML = "<p class=\"scanner-status\">Bulk clear is local-only for now. Server cards can be deleted one at a time after delete buttons are added.</p>";
      return;
    }

    localStorage.removeItem(currentSavedCardsKey());
    await renderSavedCards();
  });
}

// Save scroll position when clicking a card image link and prevent browser
// scroll restoration so coming back from card-viewer.html doesn't auto-scroll.
document.addEventListener("click", (event) => {
  const link = event.target.closest(".card-image-link");
  if (link) {
    sessionStorage.setItem("pokemonScrollY", window.scrollY);
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }
});

function restorePokemonScrollPosition() {
  const scrollY = sessionStorage.getItem("pokemonScrollY");
  if (scrollY !== null) {
    sessionStorage.removeItem("pokemonScrollY");
    window.scrollTo(0, Number(scrollY));
  }
  // Re-enable browser scroll restoration so the change only affects this back-nav.
  if ('scrollRestoration' in history) {
    setTimeout(() => {
      history.scrollRestoration = 'auto';
    }, 0);
  }
}

initializeAuth();
renderSavedCards();
