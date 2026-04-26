function normalizeWhitespace(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

const COUNTRY_ALIASES = new Map([
  ["lt", "Lithuania"],
  ["lietuva", "Lithuania"],
  ["lithuania", "Lithuania"],
  ["ee", "Estonia"],
  ["estija", "Estonia"],
  ["estonia", "Estonia"],
  ["lv", "Latvia"],
  ["latvija", "Latvia"],
  ["latvia", "Latvia"],
  ["pl", "Poland"],
  ["lenkija", "Poland"],
  ["poland", "Poland"],
  ["vokietija", "Germany"],
  ["germany", "Germany"],
]);

const KNOWN_CITY_NAMES = new Map(
  [
    "Akmenė",
    "Alytus",
    "Anykščiai",
    "Birštonas",
    "Biržai",
    "Druskininkai",
    "Elektrėnai",
    "Gargždai",
    "Ignalina",
    "Jonava",
    "Joniškis",
    "Jurbarkas",
    "Kaišiadorys",
    "Kalvarija",
    "Kaunas",
    "Kazlų Rūda",
    "Kėdainiai",
    "Kelmė",
    "Klaipėda",
    "Kretinga",
    "Kupiškis",
    "Lazdijai",
    "Marijampolė",
    "Mažeikiai",
    "Molėtai",
    "Neringa",
    "Pagėgiai",
    "Pakruojis",
    "Palanga",
    "Panevėžys",
    "Pasvalys",
    "Plungė",
    "Prienai",
    "Radviliškis",
    "Raseiniai",
    "Rietavas",
    "Rokiškis",
    "Skuodas",
    "Šakiai",
    "Šalčininkai",
    "Šiauliai",
    "Šilalė",
    "Šilutė",
    "Širvintos",
    "Švenčionys",
    "Tauragė",
    "Telšiai",
    "Trakai",
    "Ukmergė",
    "Utena",
    "Varėna",
    "Vilkaviškis",
    "Vilnius",
    "Visaginas",
    "Zarasai",
  ].map((city) => [city.toLowerCase(), city])
);

const CITY_ALIASES = new Map([
  ["vilniaus", "Vilnius"],
  ["kauno", "Kaunas"],
  ["klaipėdos", "Klaipėda"],
  ["klaipedos", "Klaipėda"],
  ["šiaulių", "Šiauliai"],
  ["siauliu", "Šiauliai"],
  ["panevėžio", "Panevėžys"],
  ["panevezio", "Panevėžys"],
]);

function normalizeCountryName(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized || normalized.length > 32) {
    return null;
  }
  if (/\d/.test(normalized) || /€|eur|kw|km|benzinas|dyzelinas|automatin/i.test(normalized)) {
    return null;
  }
  const alias = COUNTRY_ALIASES.get(normalized.toLowerCase());
  if (alias) {
    return alias;
  }
  if (!/^[\p{L}\-.' ]{2,32}$/u.test(normalized)) {
    return null;
  }
  return normalized
    .split(" ")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function normalizeCityName(value) {
  const normalized = normalizeWhitespace(value)
    .replace(/^(?:miestas|city|location|vieta)\s*[:\-]?\s*/i, "")
    .replace(/\s+(?:m\.?|miestas)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized.length > 42) {
    return null;
  }
  if (/\d/.test(normalized) || /€|eur|kw|km|benzinas|dyzelinas|automatin|sedan|visureig|krosover/i.test(normalized)) {
    return null;
  }
  if (!/^[\p{L}\-.' ]{2,42}$/u.test(normalized)) {
    return null;
  }
  const known = KNOWN_CITY_NAMES.get(normalized.toLowerCase());
  if (known) {
    return known;
  }
  const alias = CITY_ALIASES.get(normalized.toLowerCase());
  if (alias) {
    return alias;
  }
  if (normalizeCountryName(normalized)) {
    return null;
  }
  return normalized
    .split(" ")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function extractKnownCityFromText(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return null;
  }
  for (const [lowerCity, displayCity] of KNOWN_CITY_NAMES) {
    const escaped = lowerCity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const cityPattern = new RegExp(`(?:^|[^\\p{L}])${escaped}(?:$|[^\\p{L}])`, "iu");
    if (cityPattern.test(normalized)) {
      return displayCity;
    }
  }
  return null;
}

function extractLocationFromText(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return { city: null, country: null };
  }

  const labeledCity = normalized.match(
    /(?:miestas|city|location|vieta)\s*[:\-]?\s*([A-ZĄČĘĖĮŠŲŪŽ][\p{L}\-.' ]{1,42})/iu
  );
  if (labeledCity) {
    return { city: normalizeCityName(labeledCity[1]), country: null };
  }

  const locationPairs = [
    ...normalized.matchAll(
      /([A-ZĄČĘĖĮŠŲŪŽ][\p{L}\-.' ]{1,42})\s*[,|/]\s*([A-ZĄČĘĖĮŠŲŪŽ][\p{L}\-.' ]{1,32})/gu
    ),
  ];
  for (const match of locationPairs.reverse()) {
    const city = normalizeCityName(match[1]);
    const country = normalizeCountryName(match[2]);
    if (city || country) {
      return { city, country };
    }
  }

  const knownCity = extractKnownCityFromText(normalized);
  if (knownCity) {
    return { city: knownCity, country: null };
  }

  const parts = normalized
    .split(/[|/;,]/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
  for (const part of parts.reverse()) {
    const directCountry = normalizeCountryName(part);
    if (directCountry) {
      continue;
    }
    const city = normalizeCityName(part);
    if (city) {
      return { city, country: null };
    }
  }

  return { city: null, country: null };
}

module.exports = {
  extractLocationFromText,
  normalizeCityName,
  normalizeCountryName,
};
