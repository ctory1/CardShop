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
const savedCardsKey = "jc-pokepawns-scanned-cards";
let cachedSetCards = [];
let cachedSetCardsName = "";

function setScannerStatus(message) {
  if (scannerStatus) {
    scannerStatus.textContent = message;
  }
}

async function startScannerCamera() {
  if (!scannerVideo || !navigator.mediaDevices?.getUserMedia) {
    setScannerStatus("This browser does not support camera scanning.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    scannerVideo.srcObject = stream;
    captureButton.disabled = false;
    setScannerStatus("Camera ready. Put the card in frame and capture it.");
  } catch (error) {
    setScannerStatus("Camera blocked or unavailable. You can still type the card name and check value.");
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

function getSavedCards() {
  try {
    return JSON.parse(localStorage.getItem(savedCardsKey)) || [];
  } catch (error) {
    return [];
  }
}

function saveCard(card) {
  const savedCards = getSavedCards();
  const withoutDuplicate = savedCards.filter((savedCard) => savedCard.id !== card.id);
  localStorage.setItem(savedCardsKey, JSON.stringify([card, ...withoutDuplicate].slice(0, 24)));
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

function renderSavedCards() {
  if (!savedCardsTarget) {
    return;
  }

  const savedCards = getSavedCards();
  if (!savedCards.length) {
    savedCardsTarget.innerHTML = "<p class=\"scanner-status\">No entered cards yet.</p>";
    return;
  }

  savedCardsTarget.innerHTML = savedCards.map((card) => `
    <article class="saved-card">
      <img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.name)} card">
      <div>
        <h3>${escapeHtml(card.name)}</h3>
        <p>${escapeHtml(card.set)} ${card.number ? `#${escapeHtml(card.number)}` : ""}</p>
        <strong>${hasPrice(card.market) ? money(card.market) : "No price"}</strong>
        <span>Shop price ${hasPrice(card.shopPrice) ? money(card.shopPrice) : "N/A"}</span>
      </div>
    </article>
  `).join("");
}

if (startCameraButton) {
  startCameraButton.addEventListener("click", startScannerCamera);
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
  clearSavedCardsButton.addEventListener("click", () => {
    localStorage.removeItem(savedCardsKey);
    renderSavedCards();
  });
}

renderSavedCards();
