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

function extractPriceFromText(value) {
  const match = value.match(/\b\d[\d\s]{1,18}(?:€|eur)\b/i);
  return match ? normalizeWhitespace(match[0]) : null;
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

      const localText = normalizeWhitespace(node.text());
      const aroundText = textAroundNode($, node);
      const composedText = `${localText} ${aroundText}`;

      const title = localText || `Autoplius listing #${id}`;
      const price = extractPriceFromText(composedText);
      const updatedText = extractUpdatedHint(composedText);
      const imageUrl = absoluteAutopliusUrl(
        node.find("img").first().attr("src") || node.find("img").first().attr("data-src")
      );

      seenIds.add(id);
      listings.push({
        id,
        title,
        price: price || null,
        updatedText: updatedText || null,
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
      const price = normalizeWhitespace(
        node
          .find("[data-testid='price'],.announcement-price,.price,.sell-price,.main-price")
          .first()
          .text()
      );
      const updatedText = normalizeWhitespace(
        node
          .find(
            "[data-testid='listing-updated'],.announcement-info,.announcement-parameters, time"
          )
          .first()
          .text()
      );
      const imageUrl = absoluteAutopliusUrl(node.find("img").first().attr("src"));

      seenIds.add(id);
      listings.push({
        id,
        title: title || `Autoplius listing #${id}`,
        price: price || null,
        updatedText: updatedText || null,
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
