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
