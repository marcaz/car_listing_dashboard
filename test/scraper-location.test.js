const assert = require("node:assert/strict");
const test = require("node:test");
const { __testUtils } = require("../src/scraper");

test("parseListingBlocks reads city from seller-contact-location", () => {
  const html = `
    <article class="announcement-item">
      <a href="/skelbimai/bmw-m3-3-0-l-sedanas-2026-benzinas-30701987.html">
        <h2>BMW M3 2026</h2>
      </a>
      <span class="seller-contact-location">Jonava</span>
      <span class="announcement-price">55 000 €</span>
    </article>
  `;

  const listings = __testUtils.parseListingBlocks(html);

  assert.equal(listings.length, 1);
  assert.equal(listings[0].city, "Jonava");
});

test("parseListingBlocks reads price from data attributes and parses model before year", () => {
  const html = `
    <article class="announcement-item" data-price-eur="44000">
      <a href="/skelbimai/bmw-x3-m-2019-benzinas-30000001.html">
        <h2>BMW X3 M 2019</h2>
      </a>
      <span class="seller-contact-location">Vilnius, Lietuva</span>
    </article>
  `;

  const listings = __testUtils.parseListingBlocks(html);

  assert.equal(listings.length, 1);
  assert.equal(listings[0].model, "BMW X3 M");
  assert.equal(listings[0].year, 2019);
  assert.equal(listings[0].price, "44 000 €");
  assert.equal(listings[0].city, "Vilnius");
  assert.equal(listings[0].country, "Lithuania");
});

test("parseListingBlocks replaces junk card price with page-level JSON-LD EUR offer", () => {
  const html = `
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "url": "https://autoplius.lt/skelbimai/bmw-m3-2026-benzinas-30701987.html",
        "offers": {
          "@type": "Offer",
          "priceCurrency": "EUR",
          "price": 95441
        }
      }
    </script>
    <article class="announcement-item">
      <a href="/skelbimai/bmw-m3-2026-benzinas-30701987.html">
        <h2>BMW M3 2026</h2>
      </a>
      <span class="announcement-price">1 €</span>
      <span class="seller-contact-location">Jonava</span>
    </article>
  `;

  const listings = __testUtils.parseListingBlocks(html);

  assert.equal(listings.length, 1);
  assert.equal(listings[0].price, "95 441 €");
});

test("parseListingBlocks ignores non-EUR JSON-LD offers", () => {
  const html = `
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "url": "https://autoplius.lt/skelbimai/bmw-m3-2026-benzinas-30701988.html",
        "offers": {
          "@type": "Offer",
          "priceCurrency": "USD",
          "price": 95441
        }
      }
    </script>
    <article class="announcement-item">
      <a href="/skelbimai/bmw-m3-2026-benzinas-30701988.html">
        <h2>BMW M3 2026</h2>
      </a>
      <span class="announcement-price">1 €</span>
      <span class="seller-contact-location">Jonava</span>
    </article>
  `;

  const listings = __testUtils.parseListingBlocks(html);

  assert.equal(listings.length, 1);
  assert.equal(listings[0].price, null);
});

test("parseListingBlocks reads structured fields from in-card JSON-LD", () => {
  const html = `
    <article class="announcement-item">
      <a href="/skelbimai/toyota-corolla-2018-benzinas-30000002.html">
        <h2>1 Toyota Corolla 2018</h2>
      </a>
      <script type="application/ld+json">
        {
          "@type": "Vehicle",
          "name": "Toyota Corolla 2018",
          "productionDate": "2018",
          "offers": { "@type": "Offer", "priceCurrency": "EUR", "price": 12500 },
          "addressLocality": "Kaunas",
          "addressCountry": "Lietuva"
        }
      </script>
    </article>
  `;

  const listings = __testUtils.parseListingBlocks(html);

  assert.equal(listings.length, 1);
  assert.equal(listings[0].model, "Toyota Corolla");
  assert.equal(listings[0].year, 2018);
  assert.equal(listings[0].price, "12 500 €");
  assert.equal(listings[0].city, "Kaunas");
  assert.equal(listings[0].country, "Lithuania");
});
