const els = {
  monitorList: document.getElementById("monitor-list"),
  monitorsCount: document.getElementById("monitors-count"),
  addMonitorForm: document.getElementById("add-monitor-form"),
  addMonitorBtn: document.getElementById("add-monitor-btn"),
  addMonitorName: document.getElementById("add-monitor-name"),
  addMonitorUrl: document.getElementById("add-monitor-url"),
  addPollInterval: document.getElementById("add-poll-interval"),
  addNewBadge: document.getElementById("add-new-badge"),
  activeMonitorTitle: document.getElementById("active-monitor-title"),
  activeMonitorUrlChip: document.getElementById("active-monitor-url-chip"),
  activeMonitorForm: document.getElementById("active-monitor-form"),
  activeMonitorName: document.getElementById("active-monitor-name"),
  activeMonitorUrl: document.getElementById("active-monitor-url"),
  activePollInterval: document.getElementById("active-poll-interval"),
  activeNewBadge: document.getElementById("active-new-badge"),
  saveMonitorBtn: document.getElementById("save-monitor-btn"),
  pollMonitorBtn: document.getElementById("poll-monitor-btn"),
  deleteMonitorBtn: document.getElementById("delete-monitor-btn"),
  pollingIndicator: document.getElementById("polling-indicator"),
  pollingText: document.getElementById("polling-text"),
  statusLastPoll: document.getElementById("status-last-poll"),
  statusSource: document.getElementById("status-source"),
  statusMessage: document.getElementById("status-message"),
  listingSegments: document.getElementById("listing-segments"),
  segmentSummary: document.getElementById("segment-summary"),
  listingsCount: document.getElementById("listings-count"),
  listingFeed: document.getElementById("listing-feed"),
};

const actionState = {
  addingMonitor: false,
  savingMonitor: false,
  pollingMonitor: false,
  deletingMonitor: false,
};

const appState = {
  dashboard: null,
  activeSegment: "all",
};

function setButtonLoading(button, isLoading, loadingLabel) {
  if (!button) {
    return;
  }
  button.dataset.loading = String(isLoading);
  button.disabled = isLoading;
  button.setAttribute("aria-busy", String(isLoading));
  const label = button.querySelector(".btn-label");
  if (!label) {
    return;
  }
  if (!label.dataset.defaultLabel) {
    label.dataset.defaultLabel = label.textContent;
  }
  label.textContent = isLoading ? loadingLabel : label.dataset.defaultLabel;
}

function applyLoadingStates() {
  setButtonLoading(els.addMonitorBtn, actionState.addingMonitor, "Adding...");
  setButtonLoading(els.saveMonitorBtn, actionState.savingMonitor, "Saving...");
  setButtonLoading(els.pollMonitorBtn, actionState.pollingMonitor, "Polling...");
  setButtonLoading(els.deleteMonitorBtn, actionState.deletingMonitor, "Deleting...");
}

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

function isRecentlyUpdated(listing) {
  if (!listing || !listing.lastChangedAt || !listing.firstSeenAt) {
    return false;
  }
  const changedMs = Date.parse(listing.lastChangedAt);
  const firstSeenMs = Date.parse(listing.firstSeenAt);
  if (!Number.isFinite(changedMs) || !Number.isFinite(firstSeenMs)) {
    return false;
  }
  return changedMs > firstSeenMs;
}

function extractPriceFromText(value) {
  const match = (value || "")
    .replace(/\s+/g, " ")
    .match(/\b\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d+)?\s*(?:€|eur)\b/i);
  return match ? match[0].replace(/\beur\b/i, "€").trim() : null;
}

function extractYearFromText(value) {
  const match = (value || "").match(/\b(19|20)\d{2}\b/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function inferModel(listing) {
  if (listing.model) {
    return listing.model;
  }
  const title = (listing.title || "").replace(/\s+/g, " ").trim();
  if (!title) {
    return "Unknown model";
  }
  const yearMatch = title.match(/\b(19|20)\d{2}\b/);
  if (yearMatch && Number.isInteger(yearMatch.index)) {
    const model = title.slice(0, yearMatch.index).trim();
    if (model) {
      return model;
    }
  }
  return title.split(" / ")[0]?.trim() || title;
}

function inferYear(listing) {
  if (listing.year) {
    return listing.year;
  }
  return extractYearFromText(listing.title);
}

function inferPrice(listing) {
  if (listing.price) {
    return listing.price;
  }
  const fromTitle = extractPriceFromText(listing.title);
  if (fromTitle) {
    return fromTitle;
  }
  return extractPriceFromText(listing.updatedText || "");
}

function inferCity(listing) {
  if (listing.city) {
    return listing.city;
  }
  const title = `${listing.title || ""} ${listing.updatedText || ""}`.replace(/\s+/g, " ");
  const locationMatch = title.match(/,\s*([A-ZĄČĘĖĮŠŲŪŽ][\p{L}\-.' ]{1,32})(?:,\s*([A-ZĄČĘĖĮŠŲŪŽ][\p{L}\-.' ]{1,32}))?\s*$/u);
  if (!locationMatch) {
    return null;
  }
  return locationMatch[1]?.trim() || null;
}

function inferCountry(listing) {
  if (listing.country) {
    return listing.country;
  }
  const title = `${listing.title || ""} ${listing.updatedText || ""}`.replace(/\s+/g, " ");
  const locationMatch = title.match(/,\s*([A-ZĄČĘĖĮŠŲŪŽ][\p{L}\-.' ]{1,32})(?:,\s*([A-ZĄČĘĖĮŠŲŪŽ][\p{L}\-.' ]{1,32}))?\s*$/u);
  if (!locationMatch) {
    return null;
  }
  return locationMatch[2]?.trim() || null;
}

function buildFilteredListings(activeMonitor, segment) {
  const listings = activeMonitor?.listings || [];
  if (segment === "new") {
    return listings.filter((listing) => Boolean(listing.isNew));
  }
  if (segment === "updated") {
    return listings.filter((listing) => isRecentlyUpdated(listing));
  }
  return listings;
}

function monitorCard(monitor, isActive) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `monitor-item${isActive ? " active" : ""}`;
  button.dataset.monitorId = monitor.id;

  const pollingLabel = monitor.pollingInProgress ? "Polling..." : "Idle";
  button.innerHTML = `
    <div class="name-row">
      <strong>${monitor.name}</strong>
      <span class="count-pill">${monitor.newListings} new</span>
    </div>
    <div class="monitor-meta">
      <span>${monitor.totalListings} listings</span>
      <span>${Math.round((monitor.pollIntervalMs || 0) / 1000)}s</span>
      <span>${pollingLabel}</span>
    </div>
    <div class="monitor-meta">
      <span>${formatDateTime(monitor.lastPoll?.at)}</span>
      <span>${monitor.lastPoll?.status || "never"}</span>
    </div>
  `;
  return button;
}

function listingCard(listing) {
  const updated = isRecentlyUpdated(listing);
  const model = inferModel(listing);
  const year = inferYear(listing);
  const price = inferPrice(listing) || "-";
  const city = inferCity(listing);
  const country = inferCountry(listing);
  const locationLabel = city && country ? `${city}, ${country}` : city || country || "-";
  const wrapper = document.createElement("article");
  wrapper.className = `listing${listing.isNew ? " new" : ""}${updated ? " updated" : ""}${listing.isStale ? " stale" : ""}`;

  const compactRow = document.createElement("div");
  compactRow.className = "listing-main";

  const modelCell = document.createElement("div");
  modelCell.className = "listing-cell model";
  const link = document.createElement("a");
  link.href = listing.url;
  link.textContent = model;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "model-link";
  modelCell.appendChild(link);

  const yearCell = document.createElement("div");
  yearCell.className = "listing-cell";
  yearCell.textContent = year || "-";

  const priceCell = document.createElement("div");
  priceCell.className = "listing-cell price";
  priceCell.textContent = price;

  const cityCell = document.createElement("div");
  cityCell.className = "listing-cell city";
  cityCell.textContent = locationLabel;

  compactRow.append(modelCell, yearCell, priceCell, cityCell);

  const badges = document.createElement("div");
  badges.className = "listing-badges";

  if (listing.isNew) {
    const badge = document.createElement("span");
    badge.className = "badge new";
    badge.textContent = "NEW";
    badges.appendChild(badge);
  }
  if (updated) {
    const badge = document.createElement("span");
    badge.className = "badge updated";
    badge.textContent = "UPDATED";
    badges.appendChild(badge);
  }
  if (listing.isStale) {
    const badge = document.createElement("span");
    badge.className = "badge stale";
    badge.textContent = "NOT IN LATEST SCAN";
    badges.appendChild(badge);
  }

  wrapper.append(compactRow, badges);
  return wrapper;
}

function renderMonitorList(payload) {
  const monitors = payload.monitors || [];
  els.monitorsCount.textContent = String(monitors.length);
  els.monitorList.innerHTML = "";
  if (monitors.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No monitors configured.";
    els.monitorList.appendChild(empty);
    return;
  }

  monitors.forEach((monitor) => {
    const active = monitor.id === payload.activeMonitorId;
    els.monitorList.appendChild(monitorCard(monitor, active));
  });
}

function renderActiveMonitor(payload) {
  const activeMonitor = payload.activeMonitor;
  if (!activeMonitor) {
    els.activeMonitorTitle.textContent = "No active monitor";
    els.activeMonitorUrlChip.textContent = "-";
    els.activeMonitorName.value = "";
    els.activeMonitorUrl.value = "";
    els.activePollInterval.value = 60;
    els.activeNewBadge.value = 120;
    els.statusLastPoll.textContent = "-";
    els.statusSource.textContent = "-";
    els.statusMessage.textContent = "-";
    els.listingsCount.textContent = "0";
    els.segmentSummary.textContent = "No monitor selected.";
    els.listingFeed.innerHTML = '<div class="empty-state">Select or create a monitor to view listings.</div>';
    return;
  }

  els.activeMonitorTitle.textContent = activeMonitor.name;
  els.activeMonitorUrlChip.textContent = activeMonitor.searchUrl;
  els.activeMonitorName.value = activeMonitor.name || "";
  els.activeMonitorUrl.value = activeMonitor.searchUrl || "";
  els.activePollInterval.value = Math.round((activeMonitor.pollIntervalMs || 0) / 1000);
  els.activeNewBadge.value = activeMonitor.newBadgeMinutes || 120;

  const pollStatus = activeMonitor.lastPoll || {};
  const pollLabel = `${formatDateTime(pollStatus.at)} (${pollStatus.status || "unknown"})`;
  els.statusLastPoll.textContent = pollLabel;
  els.statusSource.textContent = pollStatus.source || "n/a";
  els.statusMessage.textContent = pollStatus.message || "-";

  const pollingNow =
    Boolean(activeMonitor.pollingInProgress) ||
    actionState.pollingMonitor ||
    actionState.savingMonitor;
  els.pollingIndicator.classList.toggle("polling", pollingNow);
  els.pollingIndicator.classList.toggle("idle", !pollingNow);
  els.pollingText.textContent = pollingNow
    ? `Polling ${activeMonitor.name}...`
    : "Idle - waiting for next poll";

  const allListings = activeMonitor.listings || [];
  const filteredListings = buildFilteredListings(activeMonitor, appState.activeSegment);
  els.listingsCount.textContent = String(filteredListings.length);

  els.segmentSummary.textContent = `${filteredListings.length} shown / ${allListings.length} total · ${activeMonitor.newListings} marked NEW · ${activeMonitor.staleListings} stale`;

  els.listingFeed.innerHTML = "";
  if (filteredListings.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No listings in this segment yet.";
    els.listingFeed.appendChild(empty);
    return;
  }
  filteredListings.forEach((listing) => {
    els.listingFeed.appendChild(listingCard(listing));
  });
}

function renderSegments() {
  const segmentButtons = els.listingSegments.querySelectorAll(".segment-btn");
  segmentButtons.forEach((button) => {
    const active = button.dataset.segment === appState.activeSegment;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function renderDashboard(payload) {
  appState.dashboard = payload;
  renderMonitorList(payload);
  renderSegments();
  renderActiveMonitor(payload);
  applyLoadingStates();
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
    let details = "";
    try {
      const errorPayload = await response.json();
      details = errorPayload.error ? `: ${errorPayload.error}` : "";
    } catch {
      // Ignore parse failures.
    }
    throw new Error(`${method} ${url} failed (${response.status})${details}`);
  }
  return response.json().catch(() => ({}));
}

async function refreshDashboard() {
  const payload = await callJson("/api/dashboard", "GET");
  renderDashboard(payload);
}

els.monitorList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-monitor-id]");
  if (!button) {
    return;
  }
  const monitorId = button.dataset.monitorId;
  if (!monitorId || monitorId === appState.dashboard?.activeMonitorId) {
    return;
  }
  try {
    const payload = await callJson(`/api/monitors/${monitorId}/activate`, "POST");
    renderDashboard(payload);
  } catch (error) {
    alert(`Failed to activate monitor: ${error.message}`);
  }
});

els.addMonitorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  actionState.addingMonitor = true;
  applyLoadingStates();
  try {
    const payload = await callJson("/api/monitors", "POST", {
      name: els.addMonitorName.value.trim(),
      searchUrl: els.addMonitorUrl.value.trim(),
      pollIntervalMs: Number(els.addPollInterval.value) * 1000,
      newBadgeMinutes: Number(els.addNewBadge.value),
      activate: true,
    });
    els.addMonitorForm.reset();
    els.addPollInterval.value = "60";
    els.addNewBadge.value = "120";
    renderDashboard(payload);
  } catch (error) {
    alert(`Failed to add monitor: ${error.message}`);
  } finally {
    actionState.addingMonitor = false;
    applyLoadingStates();
  }
});

els.activeMonitorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const monitorId = appState.dashboard?.activeMonitorId;
  if (!monitorId) {
    return;
  }

  actionState.savingMonitor = true;
  applyLoadingStates();
  try {
    const payload = await callJson(`/api/monitors/${monitorId}`, "PATCH", {
      name: els.activeMonitorName.value.trim(),
      searchUrl: els.activeMonitorUrl.value.trim(),
      pollIntervalMs: Number(els.activePollInterval.value) * 1000,
      newBadgeMinutes: Number(els.activeNewBadge.value),
      active: true,
    });
    renderDashboard(payload);
  } catch (error) {
    alert(`Failed to save monitor: ${error.message}`);
  } finally {
    actionState.savingMonitor = false;
    applyLoadingStates();
  }
});

els.pollMonitorBtn.addEventListener("click", async () => {
  const monitorId = appState.dashboard?.activeMonitorId;
  if (!monitorId) {
    return;
  }
  actionState.pollingMonitor = true;
  applyLoadingStates();
  try {
    await callJson(`/api/monitors/${monitorId}/poll-now`, "POST");
    await refreshDashboard();
  } catch (error) {
    alert(`Manual poll failed: ${error.message}`);
  } finally {
    actionState.pollingMonitor = false;
    applyLoadingStates();
  }
});

els.deleteMonitorBtn.addEventListener("click", async () => {
  const monitorId = appState.dashboard?.activeMonitorId;
  const monitorName = appState.dashboard?.activeMonitor?.name || "this monitor";
  if (!monitorId) {
    return;
  }
  if (!confirm(`Delete ${monitorName}? This removes its listing history.`)) {
    return;
  }
  actionState.deletingMonitor = true;
  applyLoadingStates();
  try {
    const payload = await callJson(`/api/monitors/${monitorId}`, "DELETE");
    renderDashboard(payload);
  } catch (error) {
    alert(`Failed to delete monitor: ${error.message}`);
  } finally {
    actionState.deletingMonitor = false;
    applyLoadingStates();
  }
});

els.listingSegments.addEventListener("click", (event) => {
  const button = event.target.closest(".segment-btn");
  if (!button) {
    return;
  }
  const segment = button.dataset.segment;
  if (!segment || segment === appState.activeSegment) {
    return;
  }
  appState.activeSegment = segment;
  if (appState.dashboard) {
    renderDashboard(appState.dashboard);
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

refreshDashboard().catch((error) => {
  alert(`Failed to load dashboard: ${error.message}`);
});
connectSse();
