const els = {
  form: document.getElementById("filters-form"),
  searchUrl: document.getElementById("search-url"),
  pollInterval: document.getElementById("poll-interval"),
  newBadge: document.getElementById("new-badge"),
  pollNow: document.getElementById("poll-now"),
  statusLastPoll: document.getElementById("status-last-poll"),
  statusSource: document.getElementById("status-source"),
  statusMessage: document.getElementById("status-message"),
  listingsCount: document.getElementById("listings-count"),
  listingFeed: document.getElementById("listing-feed"),
};

function formatDateTime(iso) {
  if (!iso) {
    return "-";
  }
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    return iso;
  }
  return new Date(parsed).toLocaleString();
}

function listingCard(listing) {
  const wrapper = document.createElement("article");
  wrapper.className = `listing${listing.isNew ? " new" : ""}${listing.isStale ? " stale" : ""}`;

  const titleRow = document.createElement("div");
  titleRow.className = "title-row";

  const link = document.createElement("a");
  link.href = listing.url;
  link.textContent = listing.title || "Untitled listing";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  titleRow.appendChild(link);

  if (listing.isNew) {
    const newBadge = document.createElement("span");
    newBadge.className = "badge new";
    newBadge.textContent = "NEW";
    titleRow.appendChild(newBadge);
  }

  if (listing.isStale) {
    const staleBadge = document.createElement("span");
    staleBadge.className = "badge stale";
    staleBadge.textContent = "NOT IN LATEST SCAN";
    titleRow.appendChild(staleBadge);
  }

  const price = document.createElement("div");
  price.className = "price";
  price.textContent = listing.price || "Price unavailable";

  const meta = document.createElement("div");
  meta.className = "meta";
  const seen = document.createElement("span");
  seen.textContent = `First seen: ${formatDateTime(listing.firstSeenAt)}`;
  const changed = document.createElement("span");
  changed.textContent = `Changed: ${formatDateTime(listing.lastChangedAt)}`;
  const source = document.createElement("span");
  source.textContent = `Autoplius info: ${listing.updatedText || "n/a"}`;
  meta.append(seen, changed, source);

  wrapper.append(titleRow, price, meta);
  return wrapper;
}

function renderDashboard(payload) {
  els.searchUrl.value = payload.filters.searchUrl || "";
  els.pollInterval.value = Math.round((payload.filters.pollIntervalMs || 0) / 1000);
  els.newBadge.value = payload.filters.newBadgeMinutes || 120;

  const pollStatus = payload.lastPoll || {};
  const pollLabel = `${formatDateTime(pollStatus.at)} (${pollStatus.status || "unknown"})`;
  els.statusLastPoll.textContent = pollLabel;
  els.statusSource.textContent = pollStatus.source || "n/a";
  els.statusMessage.textContent = pollStatus.message || "-";

  const listings = payload.listings || [];
  els.listingsCount.textContent = String(listings.length);
  els.listingFeed.innerHTML = "";
  if (listings.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No listings captured yet.";
    els.listingFeed.appendChild(empty);
    return;
  }

  listings.forEach((listing) => {
    els.listingFeed.appendChild(listingCard(listing));
  });
}

async function callJson(url, method, body) {
  const options = { method };
  if (body !== undefined) {
    options.headers = {
      "Content-Type": "application/json",
    };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${method} ${url} failed (${response.status})`);
  }
  return response.json().catch(() => ({}));
}

async function refreshDashboard() {
  const payload = await callJson("/api/dashboard", "GET");
  renderDashboard(payload);
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.form.querySelector("button[type='submit']").disabled = true;
  try {
    await callJson("/api/filters", "POST", {
      searchUrl: els.searchUrl.value.trim(),
      pollIntervalMs: Number(els.pollInterval.value) * 1000,
      newBadgeMinutes: Number(els.newBadge.value),
    });
    await refreshDashboard();
  } catch (error) {
    alert(`Failed to save filters: ${error.message}`);
  } finally {
    els.form.querySelector("button[type='submit']").disabled = false;
  }
});

els.pollNow.addEventListener("click", async () => {
  els.pollNow.disabled = true;
  try {
    await callJson("/api/poll-now", "POST");
    await refreshDashboard();
  } catch (error) {
    alert(`Manual poll failed: ${error.message}`);
  } finally {
    els.pollNow.disabled = false;
  }
});

function connectSse() {
  const events = new EventSource("/api/events");
  events.addEventListener("dashboard-update", (event) => {
    try {
      renderDashboard(JSON.parse(event.data));
    } catch {
      // Ignore malformed payloads.
    }
  });
  events.onerror = () => {
    events.close();
    setTimeout(connectSse, 3000);
  };
}

refreshDashboard().catch(() => {});
connectSse();
