const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-3-5-haiku-latest";
const DEFAULT_REASONING_STRENGTH = "balanced";

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

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function resolveApiKey(rawSettings) {
  const settingsKey = sanitizeString(rawSettings?.apiKey);
  if (settingsKey) {
    return { apiKey: settingsKey, source: "settings" };
  }
  const envKey = sanitizeString(process.env.ANTHROPIC_API_KEY);
  if (envKey) {
    return { apiKey: envKey, source: "env" };
  }
  return { apiKey: null, source: "missing" };
}

function resolveAnthropicConfig(rawSettings = {}) {
  const reasoningStrengthCandidates = new Set(["low", "balanced", "high"]);
  const reasoningStrength = reasoningStrengthCandidates.has(rawSettings.reasoningStrength)
    ? rawSettings.reasoningStrength
    : DEFAULT_REASONING_STRENGTH;

  const fallbackTemperatureByStrength = {
    low: 0,
    balanced: 0.15,
    high: 0.25,
  };

  const { apiKey, source } = resolveApiKey(rawSettings);
  return {
    apiKey,
    apiKeySource: source,
    model: sanitizeString(rawSettings.model) || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    reasoningStrength,
    maxCandidates: clampInteger(rawSettings.maxCandidates, 1, 30, 10),
    minConfidence: clampNumber(rawSettings.minConfidence, 0, 1, 0.55),
    temperature: clampNumber(
      rawSettings.temperature,
      0,
      1,
      fallbackTemperatureByStrength[reasoningStrength]
    ),
    maxTokens: clampInteger(rawSettings.maxTokens, 80, 1200, 220),
  };
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

function needsClaudeFallback(listing, minConfidence) {
  const missingCore = !listing.model || !listing.price || !listing.city;
  const weakLocation = !!listing.city && !listing.country;
  const lowConfidence =
    Number.isFinite(Number(listing.parseConfidence)) && Number(listing.parseConfidence) < minConfidence;
  return missingCore || weakLocation || lowConfidence;
}

function buildSystemPrompt(reasoningStrength) {
  if (reasoningStrength === "high") {
    return "You are a careful extraction engine. Analyze context deeply and output strictly valid JSON only.";
  }
  if (reasoningStrength === "low") {
    return "You are a fast extraction engine. Output strictly valid JSON only.";
  }
  return "You are an extraction engine. Balance speed and precision. Output strictly valid JSON only.";
}

async function callAnthropicForListing({ config, listing }) {
  const prompt = {
    task: "Extract structured car listing data",
    rules: [
      "Return JSON only, no markdown.",
      "Do not invent values.",
      "If a value is missing, use null.",
      "Price must include currency symbol when possible, e.g. '29 900 €'.",
      "Year must be a 4-digit integer.",
      "Confidence must be 0..1 and reflect extraction confidence.",
      `Reasoning strength hint: ${config.reasoningStrength}.`,
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
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: buildSystemPrompt(config.reasoningStrength),
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
  const config = resolveAnthropicConfig(options.settings || {});
  if (!config.apiKey) {
    return {
      listings,
      used: false,
      available: false,
      message: "Claude API key is missing. Configure it in UI settings or ANTHROPIC_API_KEY.",
      apiKeySource: config.apiKeySource,
    };
  }

  const candidates = listings.filter((listing) => needsClaudeFallback(listing, config.minConfidence));
  if (candidates.length === 0) {
    return {
      listings,
      used: false,
      available: true,
      message: "Claude fallback not needed for this poll.",
      apiKeySource: config.apiKeySource,
    };
  }

  const selected = candidates.slice(0, config.maxCandidates);
  const mergedListings = listings.map((listing) => ({ ...listing }));
  const byId = new Map(mergedListings.map((listing) => [listing.id, listing]));
  let successCount = 0;

  for (const listing of selected) {
    try {
      const enriched = await callAnthropicForListing({ config, listing });
      if (!enriched) {
        continue;
      }
      if (enriched.confidence !== null && enriched.confidence < config.minConfidence) {
        continue;
      }
      const target = byId.get(listing.id);
      if (!target) {
        continue;
      }

      const beforeSnapshot = JSON.stringify({
        model: target.model,
        year: target.year,
        price: target.price,
        city: target.city,
        country: target.country,
      });
      target.model = target.model || enriched.model;
      target.year = target.year || enriched.year;
      target.price = target.price || enriched.price;
      target.city = target.city || enriched.city;
      target.country = target.country || enriched.country;
      target.parseConfidence = Math.max(
        Number.isFinite(Number(target.parseConfidence)) ? Number(target.parseConfidence) : 0,
        Number.isFinite(Number(enriched.confidence)) ? Number(enriched.confidence) : 0
      );
      const afterSnapshot = JSON.stringify({
        model: target.model,
        year: target.year,
        price: target.price,
        city: target.city,
        country: target.country,
      });
      if (beforeSnapshot !== afterSnapshot) {
        target.parsedByClaude = true;
        successCount += 1;
      }
    } catch {
      // Ignore single listing failures and keep deterministic parser result.
    }
  }

  return {
    listings: mergedListings,
    used: successCount > 0,
    available: true,
    apiKeySource: config.apiKeySource,
    model: config.model,
    message:
      successCount > 0
        ? `Claude enriched ${successCount} listing(s).`
        : "Claude fallback attempted but no additional fields were extracted.",
  };
}

function getClaudeAvailability(settings) {
  return Boolean(resolveAnthropicConfig(settings).apiKey);
}

function getClaudeApiKeySource(settings) {
  return resolveAnthropicConfig(settings).apiKeySource;
}

module.exports = {
  enrichListingsWithClaude,
  getClaudeAvailability,
  getClaudeApiKeySource,
  resolveAnthropicConfig,
};
