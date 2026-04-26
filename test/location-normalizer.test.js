const assert = require("node:assert/strict");
const test = require("node:test");
const {
  extractLocationFromText,
  normalizeCityName,
  normalizeCountryName,
} = require("../src/location-normalizer");

test("extracts city and country from common listing text shapes", () => {
  assert.deepEqual(extractLocationFromText("BMW M3, Vilnius, Lithuania"), {
    city: "Vilnius",
    country: "Lithuania",
  });
  assert.deepEqual(extractLocationFromText("BMW M3 | Miestas: Kaunas | 55 000 €"), {
    city: "Kaunas",
    country: null,
  });
  assert.deepEqual(extractLocationFromText("BMW M3 2026 benzinas automatin Jonava"), {
    city: "Jonava",
    country: null,
  });
  assert.deepEqual(extractLocationFromText("Klaipėda, Lietuva"), {
    city: "Klaipėda",
    country: "Lithuania",
  });
});

test("normalizes location labels without accepting vehicle specs", () => {
  assert.equal(normalizeCityName("Vilniaus m."), "Vilnius");
  assert.equal(normalizeCityName("2026 benzinas automatin"), null);
  assert.equal(normalizeCountryName("lt"), "Lithuania");
  assert.equal(normalizeCityName("Lithuania"), null);
  assert.deepEqual(extractLocationFromText("Kaunas, Krosoveris"), {
    city: "Kaunas",
    country: null,
  });
  assert.deepEqual(extractLocationFromText("Krosoveris"), {
    city: null,
    country: null,
  });
  assert.equal(normalizeCountryName("Krosoveris"), null);
});
