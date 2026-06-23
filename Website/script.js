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
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
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
