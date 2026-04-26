#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  const absolutePath = path.join(__dirname, "..", relativePath);
  return fs.readFileSync(absolutePath, "utf8");
}

function run() {
  const html = read("public/index.html");
  const appJs = read("public/app.js");
  const css = read("public/styles.css");

  // Sort control wiring checks.
  assert(/<select id="listing-sort"/.test(html), "Sort select with id=\"listing-sort\" is missing from index.html");
  assert(
    /listingSortBy:\s*document\.getElementById\("listing-sort"\)/.test(appJs),
    "app.js is not wired to listing-sort element"
  );
  assert(
    /els\.listingSortBy\.addEventListener\("change"/.test(appJs),
    "Sort change event listener is missing in app.js"
  );
  assert(/function sortListings\(/.test(appJs), "sortListings function missing");
  assert(/case "price_asc":/.test(appJs), "price_asc sort case missing");
  assert(/case "price_desc":/.test(appJs), "price_desc sort case missing");
  assert(/case "year_desc":/.test(appJs), "year_desc sort case missing");
  assert(/case "year_asc":/.test(appJs), "year_asc sort case missing");
  assert(/case "location_asc":/.test(appJs), "location_asc sort case missing");
  assert(/case "recently_changed":/.test(appJs), "recently_changed sort case missing");

  // Layout/overflow regression checks.
  assert(/\.main-column\s*\{[\s\S]*min-width:\s*0;/.test(css), "main-column min-width guard missing");
  assert(/\.main-column\s*\{[\s\S]*overflow:\s*hidden;/.test(css), "main-column overflow hidden missing");
  assert(/\.layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(300px,\s*360px\)\s*minmax\(0,\s*1fr\);/.test(css), "layout responsive columns missing");
  assert(/\.url-chip\s*\{[\s\S]*text-overflow:\s*ellipsis;/.test(css), "url-chip truncation missing");
  assert(/input\s*\{[\s\S]*max-width:\s*100%;/.test(css), "input max-width 100% guard missing");

  // Debug UI checks.
  assert(/id="debug-log-feed"/.test(html), "debug log feed missing from index.html");
  assert(/id="debug-log-clear-btn"/.test(html), "debug clear button missing from index.html");
  assert(/id="debug-log-pause-btn"/.test(html), "debug pause button missing from index.html");
  assert(/function sanitizeDebugPayload\(/.test(appJs), "sanitizeDebugPayload helper missing");
  assert(/sensitiveKeys\s*=\s*new Set\(/.test(appJs), "sensitive key masking set missing");

  console.log("Smoke checks passed.");
}

run();
