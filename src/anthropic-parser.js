const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";

function normalizeWhitespace(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function sanitizeString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = normalizeWhitespace(value);
  return trimmed || null;
}

function sanitizeYear(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1900 && value <= 2100) {
    return value;
  }
  if (typeof value === "string" && /^\d{4}$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (parsed >= 1900 && parsed <= 2100) {
      return parsed;
    }
  }
  return null;
}

function sanitizePrice(value) {
  const stringValue = sanitizeString(value);
  if (!stringValue) {
    return null;
  }
  const match = stringValue.match(/\b\d{1,3}(?:[ .\u00A0]\d{3})*(?:[.,]\d+)?\s*(?:€|eur)\b/i);
  if (!match) {
    return null;
  }
  return normalizeWhitespace(match[0].replace(/\beur\b/i, "€"));
}

function parseJsonFromClaudeText(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  const normalized = text.trim();
  try {
    return JSON.parse(normalized);
  } catch {
    // ignore
  }

  const fencedMatch = normalized.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fencedMatch) {
    try {
      return JSON.parse(fencedMatch[1]);
    } catch {
      // ignore
    }
  }

  return null;
}

function sanitizeClaudeResult(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return {
    model: sanitizeString(raw.model),
    year: sanitizeYear(raw.year),
    price: sanitizePrice(raw.price),
    city: sanitizeString(raw.city),
    country: sanitizeString(raw.country),
    confidence: Number.isFinite(Number(raw.confidence))
      ? Math.max(0, Math.min(1, Number(raw.confidence)))
      : null,
  };
}

function needsClaudeFallback(listing) {
  const missingCore = !listing.model || !listing.price || !listing.city;
  const weakLocation = !!listing.city && !listing.country;
  return missingCore || weakLocation;
}

async function callAnthropicForListing({ apiKey, listing }) {
  const prompt = {
    task: "Extract structured car listing data",
    rules: [
      "Return JSON only, no markdown.",
      "Do not invent values.",
      "If a value is missing, use null.",
      "Price must include currency symbol when possible, e.g. '29 900 €'.",
      "Year must be a 4-digit integer.",
      "Confidence must be 0..1 and reflect extraction confidence.",
    ],
    output_schema: {
      model: "string|null",
      year: "number|null",
      price: "string|null",
      city: "string|null",
      country: "string|null",
      confidence: "number|null",
    },
    listing_context: {
      id: listing.id,
      title: listing.title || null,
      updatedText: listing.updatedText || null,
      url: listing.url || null,
    },
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 220,
      temperature: 0,
      system:
        "You are an extraction engine. Output strictly valid JSON and nothing else.",
      messages: [
        {
          role: "user",
          content: JSON.stringify(prompt),
        },
      ],
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${responseText.slice(0, 400)}`);
  }

  const payload = await response.json();
  const textBlocks = Array.isArray(payload?.content)
    ? payload.content
        .filter((block) => block?.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
    : [];
  const rawText = textBlocks.join("\n").trim();
  const parsed = parseJsonFromClaudeText(rawText);
  return sanitizeClaudeResult(parsed);
}

async function enrichListingsWithClaude(listings, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      listings,
      used: false,
      available: false,
      message: "ANTHROPIC_API_KEY is missing. Claude fallback skipped.",
    };
  }

  const candidates = listings.filter(needsClaudeFallback);
  if (candidates.length === 0) {
    return {
      listings,
      used: false,
      available: true,
      message: "Claude fallback not needed for this poll.",
    };
  }

  const maxCandidates = Math.max(1, Number(options.maxCandidates) || 8);
  const selected = candidates.slice(0, maxCandidates);
  const mergedListings = listings.map((listing) => ({ ...listing }));
  const byId = new Map(mergedListings.map((listing) => [listing.id, listing]));
  let successCount = 0;

  for (const listing of selected) {
    try {
      const enriched = await callAnthropicForListing({ apiKey, listing });
      if (!enriched) {
        continue;
      }
      const target = byId.get(listing.id);
      if (!target) {
        continue;
      }

      target.model = target.model || enriched.model;
      target.year = target.year || enriched.year;
      target.price = target.price || enriched.price;
      target.city = target.city || enriched.city;
      target.country = target.country || enriched.country;
      target.parseConfidence = enriched.confidence ?? target.parseConfidence ?? null;
      target.parsedByClaude = true;
      successCount += 1;
    } catch {
      // Ignore single listing failures and keep deterministic parser result.
    }
  }

  return {
    listings: mergedListings,
    used: successCount > 0,
    available: true,
    message:
      successCount > 0
        ? `Claude enriched ${successCount} listing(s).`
        : "Claude fallback attempted but no additional fields were extracted.",
  };
}

function getClaudeAvailability() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

module.exports = {
  enrichListingsWithClaude,
  getClaudeAvailability,
};
