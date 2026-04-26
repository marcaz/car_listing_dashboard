const assert = require("node:assert/strict");
const test = require("node:test");
const { cleanVehicleDisplayName } = require("../src/listing-normalizer");

test("removes Autoplius status and time prefixes from vehicle model labels", () => {
  const cases = [
    ["Atnaujintas BMW M3", "BMW M3"],
    ["Rezervuota BMW M3 2025", "BMW M3 2025"],
    ["Parduotas: BMW M3", "BMW M3"],
    ["Prieš 46 min. BMW M3", "BMW M3"],
    ["46 min. prieš BMW M3", "BMW M3"],
    ["Updated - BMW M3", "BMW M3"],
  ];

  for (const [input, expected] of cases) {
    assert.equal(cleanVehicleDisplayName(input), expected);
  }
});

test("keeps valid vehicle model text intact", () => {
  const cases = ["BMW M3", "BMW X3 M", "Mercedes-Benz C 63", "Audi RS 6"];

  for (const value of cases) {
    assert.equal(cleanVehicleDisplayName(value), value);
  }
});
