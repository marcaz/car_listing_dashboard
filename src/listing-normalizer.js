function normalizeWhitespace(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function stripAutopliusListingStatusPrefix(text) {
  const raw = normalizeWhitespace(text);
  if (!raw) {
    return "";
  }

  const patterns = [
    /^(?:atnaujint(?:as|a|i|os)?|rezervuot(?:as|a|i|os)?|parduot(?:as|a|i|os)?|reserved|sold|updated)\b[\s:.,-]*/iu,
    /^prie[šs]\s+\d+\s*(?:min\.?|val\.?|d\.?|dien(?:a|os)?|h|hour|hours)\b[\s:.,-]*/iu,
    /^\d+\s*(?:min\.?|val\.?|d\.?|dien(?:a|os)?|h|hour|hours)\.?(?:\s+prie[šs])?[\s:.,-]*/iu,
  ];

  let cleaned = raw;
  let previous;
  do {
    previous = cleaned;
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, "");
    }
    cleaned = cleaned.replace(/^[\s\-–—|:.,]+/u, "").trim();
  } while (cleaned && cleaned !== previous);

  return cleaned;
}

function cleanVehicleDisplayName(text) {
  return stripAutopliusListingStatusPrefix(text);
}

module.exports = {
  cleanVehicleDisplayName,
  stripAutopliusListingStatusPrefix,
};
