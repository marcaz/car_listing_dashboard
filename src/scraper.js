const cheerio = require("cheerio");
const { chromium } = require("playwright");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function normalizeWhitespace(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function absoluteAutopliusUrl(url) {
  if (!url) {
    return null;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  if (url.startsWith("/")) {
    return `https://autoplius.lt${url}`;
  }

  return `https://autoplius.lt/${url.replace(/^\.?\//, "")}`;
}

function listingIdFromUrl(url) {
  if (!url) {
    return null;
  }

  const match = url.match(/-(\d+)\.html(?:\?|$)/);
  if (match) {
    return match[1];
  }

  return null;
}

function textAroundNode($, node) {
  const container =
    node.closest("article,li,[data-testid='listing-item'],.announcement-item,.list-announcement-item")
      .first() || node;
  return normalizeWhitespace(container.text());
}

function formatEuroAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const rounded = Math.round(numeric);
  return `${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} €`;
}

function parseNumberFromPriceSnippet(value) {
  const digitsOnly = String(value || "").replace(/\D/g, "");
  const numeric = Number.parseInt(digitsOnly, 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractPriceFromText(value) {
  const normalized = normalizeWhitespace(value);
  const currencyMatches = [
    ...normalized.matchAll(/\b\d{1,3}(?:[ .\u00A0]\d{3})*(?:[.,]\d+)?\s*(?:€|eur)\b/gi),
  ];
  if (currencyMatches.length > 0) {
    const ranked = currencyMatches
      .map((match) => ({
        raw: normalizeWhitespace(match[0].replace(/\beur\b/i, "€")),
        numeric: parseNumberFromPriceSnippet(match[0]),
      }))
      .filter((entry) => Number.isFinite(entry.numeric));

    const realistic = ranked.filter((entry) => entry.numeric >= 2500 && entry.numeric <= 350000);
    const pool = realistic.length > 0 ? realistic : ranked;
    if (pool.length > 0) {
      pool.sort((a, b) => b.numeric - a.numeric);
      return pool[0].raw;
    }
  }

  const labelMatch = normalized.match(
    /(?:kaina|price)\s*[:\-]?\s*(\d{1,3}(?:[ \u00A0]\d{3})+|\d{5,6})\b/i
  );
  if (labelMatch) {
    const labeledAmount = Number.parseInt(labelMatch[1].replace(/\s+/g, ""), 10);
    const formatted = formatEuroAmount(labeledAmount);
    if (formatted) {
      return formatted;
    }
  }

  const candidates = [...normalized.matchAll(/\b\d{1,3}(?:[ .\u00A0]\d{3})+\b|\b\d{5,6}\b/g)];
  for (const candidate of candidates) {
    const raw = candidate[0];
    const rawNumber = Number.parseInt(raw.replace(/[ .\u00A0]+/g, ""), 10);
    if (!Number.isFinite(rawNumber) || rawNumber < 2500 || rawNumber > 350000) {
      continue;
    }
    const index = Number.isInteger(candidate.index) ? candidate.index : 0;
    const contextStart = Math.max(0, index - 8);
    const contextEnd = Math.min(normalized.length, index + raw.length + 8);
    const context = normalized.slice(contextStart, contextEnd).toLowerCase();
    if (/km|kw|ag|mėn|men|l\./i.test(context)) {
      continue;
    }
    const formatted = formatEuroAmount(rawNumber);
    if (formatted) {
      return formatted;
    }
  }

  return null;
}

function extractYearFromText(value) {
  const match = normalizeWhitespace(value).match(/\b(19|20)\d{2}\b/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function extractModelFromTitle(title) {
  const normalized = normalizeWhitespace(title).replace(/^\d+\s+/, "");
  if (!normalized) {
    return null;
  }

  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);
  if (yearMatch && Number.isInteger(yearMatch.index)) {
    const beforeYear = normalized.slice(0, yearMatch.index).trim();
    if (beforeYear) {
      return beforeYear;
    }
  }

  const firstBlock = normalized.split(" / ")[0]?.trim();
  return firstBlock || null;
}

function extractPriceFromNode(node) {
  const selectorPrice = normalizeWhitespace(
    node.find("[data-testid='price'],.announcement-price,.price,.sell-price,.main-price").first().text()
  );
  if (selectorPrice) {
    return extractPriceFromText(selectorPrice) || selectorPrice;
  }

  const rawAttributeCandidates = [
    node.attr("data-price"),
    node.attr("data-price-eur"),
    node.find("[data-price]").first().attr("data-price"),
    node.find("[data-price-eur]").first().attr("data-price-eur"),
  ].filter(Boolean);

  for (const candidate of rawAttributeCandidates) {
    const parsed = Number.parseFloat(String(candidate).replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 2500 && parsed <= 350000) {
      const formatted = formatEuroAmount(parsed);
      if (formatted) {
        return formatted;
      }
    }
  }

  return null;
}

function looksLikePlaceName(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return false;
  }
  if (/\d/.test(normalized)) {
    return false;
  }
  if (/(km|kw|ag|mėn|men|automatin|benzin|dyzel|elektr|hybrid|visureig|krosover|sedan)/i.test(normalized)) {
    return false;
  }
  return /^[\p{L}\-.' ]{2,40}$/u.test(normalized);
}

function isLikelyCountry(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) {
    return false;
  }
  const knownCountries = new Set([
    "lietuva",
    "latvija",
    "estija",
    "lenkija",
    "vokietija",
    "prancūzija",
    "italija",
    "ispanija",
    "belgija",
    "nyderlandai",
    "suomija",
    "švedija",
    "norvegija",
    "danija",
    "čekija",
    "slovakija",
    "austrija",
    "šveicarija",
    "jav",
    "uk",
  ]);
  return knownCountries.has(normalized);
}

function extractLocationTextFromNode(node) {
  const selectors = [
    "[data-testid='location']",
    ".announcement-location",
    ".announcement-place",
    ".announcement-city",
    ".location",
    ".place",
  ];
  for (const selector of selectors) {
    const text = normalizeWhitespace(node.find(selector).first().text());
    if (text) {
      return text;
    }
  }
  return "";
}

function parseJsonSafely(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }
  const attempts = [trimmed, trimmed.replace(/&quot;|&#34;/g, '"')];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // Continue with next attempt.
    }
  }
  return null;
}

function tryExtractNumericPrice(rawValue) {
  if (typeof rawValue === "number") {
    return formatEuroAmount(rawValue);
  }
  if (typeof rawValue === "string") {
    const parsedFromText = extractPriceFromText(rawValue);
    if (parsedFromText) {
      return parsedFromText;
    }
    const parsedNumeric = Number.parseFloat(rawValue.replace(/[^\d.,]/g, "").replace(",", "."));
    if (Number.isFinite(parsedNumeric)) {
      return formatEuroAmount(parsedNumeric);
    }
  }
  return null;
}

function walkStructuredData(value, visitor, parentKey = "") {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkStructuredData(item, visitor, parentKey);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      visitor(key, child, parentKey);
      walkStructuredData(child, visitor, key);
    }
  }
}

function extractStructuredFromNode($, node) {
  const data = {
    price: null,
    city: null,
    country: null,
    year: null,
    model: null,
  };

  const jsonPayloads = [];
  const attributes = node.attr() || {};
  for (const rawValue of Object.values(attributes)) {
    const parsed = parseJsonSafely(rawValue);
    if (parsed) {
      jsonPayloads.push(parsed);
    }
  }

  node
    .find("script[type='application/ld+json']")
    .toArray()
    .forEach((scriptEl) => {
      const parsed = parseJsonSafely($(scriptEl).contents().text());
      if (parsed) {
        jsonPayloads.push(parsed);
      }
    });

  for (const payload of jsonPayloads) {
    walkStructuredData(payload, (key, rawValue) => {
      const lowerKey = (key || "").toLowerCase();

      if (!data.price && /(price|kaina|amount|eur)/i.test(lowerKey)) {
        const price = tryExtractNumericPrice(rawValue);
        if (price) {
          data.price = price;
        }
      }

      if (!data.year && /(year|metai|manufacture|production)/i.test(lowerKey)) {
        if (typeof rawValue === "number" && rawValue >= 1900 && rawValue <= 2100) {
          data.year = Math.round(rawValue);
        } else if (typeof rawValue === "string") {
          data.year = extractYearFromText(rawValue);
        }
      }

      if (!data.city && /(city|town|miestas|settlement)/i.test(lowerKey) && typeof rawValue === "string") {
        const normalized = normalizeWhitespace(rawValue);
        if (looksLikePlaceName(normalized)) {
          data.city = normalized;
        }
      }

      if (!data.country && /(country|salis|šalis|valstyb)/i.test(lowerKey)) {
        const normalized = normalizeWhitespace(String(rawValue || ""));
        if (looksLikePlaceName(normalized)) {
          data.country = normalized;
        }
      }

      if (!data.model && /(model|title|name)/i.test(lowerKey) && typeof rawValue === "string") {
        const model = extractModelFromTitle(rawValue);
        if (model) {
          data.model = model;
        }
      }
    });
  }

  return data;
}

function extractLocationFromText(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return { city: null, country: null };
  }

  const matches = [
    ...normalized.matchAll(
      /([A-ZĄČĘĖĮŠŲŪŽ][\p{L}\-.' ]{1,32}),\s*([A-ZĄČĘĖĮŠŲŪŽ][\p{L}\-.' ]{1,32})/gu
    ),
  ];
  if (matches.length === 0) {
    const commaParts = normalized
      .split(",")
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean);
    if (commaParts.length >= 2) {
      const last = commaParts[commaParts.length - 1];
      const previous = commaParts[commaParts.length - 2];
      if (looksLikePlaceName(previous) && looksLikePlaceName(last)) {
        return {
          city: previous,
          country: isLikelyCountry(last) ? last : null,
        };
      }
    }

    const words = normalized.split(/[|/]/).map((part) => normalizeWhitespace(part));
    for (const candidate of words.reverse()) {
      if (looksLikePlaceName(candidate)) {
        return { city: candidate, country: null };
      }
    }

    return { city: null, country: null };
  }

  const lastLocation = matches[matches.length - 1];
  const city = normalizeWhitespace(lastLocation[1]);
  const country = normalizeWhitespace(lastLocation[2]);
  return {
    city: looksLikePlaceName(city) ? city : null,
    country: looksLikePlaceName(country) ? country : null,
  };
}

function extractUpdatedHint(value) {
  const patterns = [
    /atnaujint[a-z]*\s*[:\-]?\s*[^|]+/i,
    /prie[sš]\s+\d+\s+\w+/i,
    /(šiandien|vakar)\s+\d{1,2}:\d{2}/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      return normalizeWhitespace(match[0]);
    }
  }
  return null;
}

function parseListingAnchorsFallback(html) {
  const $ = cheerio.load(html);
  const seenIds = new Set();
  const listings = [];

  $("a[href*='/skelbimai/'], a[href*='/ads/']")
    .toArray()
    .forEach((element) => {
      const node = $(element);
      const url = absoluteAutopliusUrl(node.attr("href"));
      const id = listingIdFromUrl(url);
      if (!id || seenIds.has(id)) {
        return;
      }

      const container =
        node.closest("article,li,[data-testid='listing-item'],.announcement-item,.list-announcement-item")
          .first() || node;
      const localText = normalizeWhitespace(node.text());
      const aroundText = textAroundNode($, node);
      const locationText = extractLocationTextFromNode(container);
      const structured = extractStructuredFromNode($, container);
      const composedText = `${localText} ${locationText} ${aroundText}`;

      const title = localText || `Autoplius listing #${id}`;
      const price = structured.price || extractPriceFromText(composedText);
      const updatedText = extractUpdatedHint(composedText);
      const year = structured.year || extractYearFromText(title) || extractYearFromText(composedText);
      const model = extractModelFromTitle(title) || structured.model;
      const location = extractLocationFromText(composedText);
      const imageUrl = absoluteAutopliusUrl(
        node.find("img").first().attr("src") || node.find("img").first().attr("data-src")
      );

      seenIds.add(id);
      listings.push({
        id,
        title,
        price: price || null,
        updatedText: updatedText || null,
        model: model || null,
        year: year || null,
        city: structured.city || location.city || null,
        country: structured.country || location.country || null,
        imageUrl: imageUrl || null,
        url,
      });
    });

  return listings;
}

function parseListingBlocks(html) {
  const $ = cheerio.load(html);
  const seenIds = new Set();
  const listings = [];

  // Selector is intentionally broad because Autoplius markup may vary.
  $("[data-testid='listing-item'], article, .announcement-item, .list-announcement-item")
    .toArray()
    .forEach((element) => {
      const node = $(element);
      const anchor =
        node.find("a[href*='/skelbimai/']").first().attr("href") ||
        node.find("a[href*='/ads/']").first().attr("href");
      const url = absoluteAutopliusUrl(anchor);
      const id = listingIdFromUrl(url);

      if (!id || seenIds.has(id)) {
        return;
      }

      const title = normalizeWhitespace(
        node.find("h2,h3,[data-testid='title'],.announcement-title,a[title]").first().text()
      );
      const structured = extractStructuredFromNode($, node);
      const blockText = normalizeWhitespace(node.text());
      const locationText = extractLocationTextFromNode(node);
      const searchText = `${title} ${locationText} ${blockText}`;
      const priceFromNode = extractPriceFromNode(node);
      const price = priceFromNode || structured.price || extractPriceFromText(searchText);
      const updatedText = normalizeWhitespace(
        node
          .find(
            "[data-testid='listing-updated'],.announcement-info,.announcement-parameters, time"
          )
          .first()
          .text()
      );
      const year = structured.year || extractYearFromText(title) || extractYearFromText(blockText);
      const model = extractModelFromTitle(title) || structured.model;
      const location = extractLocationFromText(searchText);
      const imageUrl = absoluteAutopliusUrl(node.find("img").first().attr("src"));

      seenIds.add(id);
      listings.push({
        id,
        title: title || `Autoplius listing #${id}`,
        price: price || null,
        updatedText: updatedText || null,
        model: model || null,
        year: year || null,
        city: structured.city || location.city || null,
        country: structured.country || location.country || null,
        imageUrl: imageUrl || null,
        url,
      });
    });

  return listings;
}

async function fetchWithPlaywright(url) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
    });
  } catch (error) {
    if (/Executable doesn't exist/i.test(error.message || "")) {
      throw new Error(
        "Playwright browser is not installed. Run: npx playwright install chromium (or npx playwright install), then restart the server."
      );
    }
    throw error;
  }

  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "lt-LT",
      extraHTTPHeaders: {
        "Accept-Language": "lt-LT,lt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(3500);
    const html = await page.content();
    await context.close();
    return html;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function detectChallengePage(html) {
  if (!html) {
    return false;
  }
  return (
    /cdn-cgi\/challenge-platform/i.test(html) ||
    /turnstile/i.test(html) ||
    /<title>\s*luktel[ėe]kite/i.test(html) ||
    /forbidden/i.test(html)
  );
}

async function fetchWithNode(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "lt-LT,lt;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://autoplius.lt/",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    redirect: "follow",
  });

  return {
    status: response.status,
    html: await response.text(),
  };
}

async function scrapeAutoplius(searchUrl) {
  const nodeAttempt = await fetchWithNode(searchUrl);

  // If direct request was blocked or produced too few parseable listings, try browser mode.
  const firstPassListings = parseListingBlocks(nodeAttempt.html);
  const firstPassFallback = parseListingAnchorsFallback(nodeAttempt.html);
  const mergedFirstPass = firstPassListings.length > 0 ? firstPassListings : firstPassFallback;
  const likelyBlocked = nodeAttempt.status >= 400 || detectChallengePage(nodeAttempt.html);

  if (!likelyBlocked && mergedFirstPass.length > 0) {
    return {
      source: "node-fetch",
      statusCode: nodeAttempt.status,
      listings: mergedFirstPass,
    };
  }

  const html = await fetchWithPlaywright(searchUrl);
  const listings = parseListingBlocks(html);
  const anchorFallbackListings = parseListingAnchorsFallback(html);
  const mergedListings = listings.length > 0 ? listings : anchorFallbackListings;
  const browserBlocked = detectChallengePage(html);

  if (browserBlocked && mergedListings.length === 0) {
    throw new Error(
      "Autoplius returned an anti-bot challenge page. Run this project locally and open the search URL in your normal browser first, then reduce polling frequency."
    );
  }

  return {
    source: "playwright",
    statusCode: nodeAttempt.status,
    listings: mergedListings,
  };
}

module.exports = {
  scrapeAutoplius,
};
