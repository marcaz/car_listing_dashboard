const els = {
  monitorList: document.getElementById("monitor-list"),
  monitorsCount: document.getElementById("monitors-count"),
  claudeToggleBtn: document.getElementById("claude-toggle-btn"),
  claudeStatusText: document.getElementById("claude-status-text"),
  claudeSettingsForm: document.getElementById("claude-settings-form"),
  claudeApiKey: document.getElementById("claude-api-key"),
  claudeModel: document.getElementById("claude-model"),
  claudeReasoningStrength: document.getElementById("claude-reasoning-strength"),
  claudeMaxCandidates: document.getElementById("claude-max-candidates"),
  claudeMinConfidence: document.getElementById("claude-min-confidence"),
  claudeTemperature: document.getElementById("claude-temperature"),
  claudeMaxTokens: document.getElementById("claude-max-tokens"),
  saveClaudeSettingsBtn: document.getElementById("save-claude-settings-btn"),
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
  togglingClaude: false,
  savingClaudeSettings: false,
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
  const forceDisabled = button.dataset.forceDisabled === "true";
  button.dataset.loading = String(isLoading);
  button.disabled = isLoading || forceDisabled;
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
  setButtonLoading(els.claudeToggleBtn, actionState.togglingClaude, "Saving...");
  setButtonLoading(els.saveClaudeSettingsBtn, actionState.savingClaudeSettings, "Saving...");
  setButtonLoading(els.addMonitorBtn, actionState.addingMonitor, "Adding...");
  setButtonLoading(els.saveMonitorBtn, actionState.savingMonitor, "Saving...");
  setButtonLoading(els.pollMonitorBtn, actionState.pollingMonitor, "Polling...");
  setButtonLoading(els.deleteMonitorBtn, actionState.deletingMonitor, "Deleting...");
  if (
    els.claudeToggleBtn &&
    els.claudeToggleBtn.dataset.forceDisabled === "true" &&
    !actionState.togglingClaude
  ) {
    els.claudeToggleBtn.disabled = true;
  }
}

function renderClaudeControls(payload) {
  const settings = payload.settings || {};
  const claudeSettings = settings.claude || {};
  const enabled = Boolean(settings.claudeParsingEnabled);
  const available = Boolean(settings.claudeAvailable);
  const label = enabled ? "Claude fallback ON" : "Claude fallback OFF";
  els.claudeToggleBtn.dataset.enabled = String(enabled);
  els.claudeToggleBtn.setAttribute("aria-pressed", String(enabled));
  const labelNode = els.claudeToggleBtn.querySelector(".btn-label");
  if (labelNode) {
    labelNode.dataset.defaultLabel = label;
    if (!actionState.togglingClaude) {
      labelNode.textContent = label;
    }
  }
  els.claudeToggleBtn.dataset.forceDisabled = String(!available);
  if (!actionState.togglingClaude) {
    els.claudeToggleBtn.disabled = !available;
  }
  if (els.claudeSettingsForm) {
    for (const field of els.claudeSettingsForm.elements) {
      if (!field || typeof field !== "object" || !("disabled" in field)) {
        continue;
      }
      if (field.id === "save-claude-settings-btn") {
        continue;
      }
      field.disabled = !available;
    }
  }
  if (els.claudeApiKey) {
    els.claudeApiKey.placeholder = claudeSettings.hasApiKey
      ? `${claudeSettings.apiKeyMasked || "********"} (configured)`
      : "sk-ant-...";
    if (!actionState.savingClaudeSettings) {
      els.claudeApiKey.value = "";
    }
  }
  if (els.claudeModel) {
    els.claudeModel.value = claudeSettings.model || "claude-3-5-haiku-latest";
  }
  if (els.claudeReasoningStrength) {
    els.claudeReasoningStrength.value = claudeSettings.reasoningStrength || "balanced";
  }
  if (els.claudeMaxCandidates) {
    els.claudeMaxCandidates.value = String(claudeSettings.maxCandidates ?? 10);
  }
  if (els.claudeMinConfidence) {
    els.claudeMinConfidence.value = String(claudeSettings.minConfidence ?? 0.55);
  }
  if (els.claudeTemperature) {
    els.claudeTemperature.value = String(claudeSettings.temperature ?? 0);
  }
  if (els.claudeMaxTokens) {
    els.claudeMaxTokens.value = String(claudeSettings.maxTokens ?? 220);
  }

  if (!available) {
    els.claudeStatusText.textContent =
      "Claude fallback unavailable: set ANTHROPIC_API_KEY in environment.";
    return;
  }

  els.claudeStatusText.textContent = enabled
    ? `Claude fallback enabled (${settings.claudeApiKeySource || "unknown"} key source).`
    : "Deterministic parser only.";
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
  renderClaudeControls(payload);
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

els.claudeToggleBtn.addEventListener("click", async () => {
  if (els.claudeToggleBtn.dataset.forceDisabled === "true") {
    return;
  }
  const current = Boolean(appState.dashboard?.settings?.claudeParsingEnabled);
  actionState.togglingClaude = true;
  applyLoadingStates();
  try {
    const payload = await callJson("/api/settings", "PATCH", {
      claudeParsingEnabled: !current,
    });
    renderDashboard(payload);
  } catch (error) {
    alert(`Failed to update Claude setting: ${error.message}`);
  } finally {
    actionState.togglingClaude = false;
    applyLoadingStates();
    if (appState.dashboard) {
      renderClaudeControls(appState.dashboard);
    }
  }
});

els.claudeSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (els.claudeToggleBtn.dataset.forceDisabled === "true") {
    return;
  }
  const current = appState.dashboard?.settings || {};
  const claudeCurrent = current.claude || {};
  actionState.savingClaudeSettings = true;
  applyLoadingStates();
  try {
    const payload = await callJson("/api/settings", "PATCH", {
      claudeParsingEnabled: Boolean(current.claudeParsingEnabled),
      claude: {
        apiKey: els.claudeApiKey.value.trim() || undefined,
        model: els.claudeModel.value.trim(),
        reasoningStrength: els.claudeReasoningStrength.value,
        maxCandidates: Number(els.claudeMaxCandidates.value),
        minConfidence: Number(els.claudeMinConfidence.value),
        temperature: Number(els.claudeTemperature.value),
        maxTokens: Number(els.claudeMaxTokens.value),
      },
    });
    renderDashboard(payload);
    if (!els.claudeApiKey.value.trim() && claudeCurrent.hasApiKey) {
      // Keep existing key when field is left empty.
      return;
    }
    els.claudeApiKey.value = "";
  } catch (error) {
    alert(`Failed to save Claude settings: ${error.message}`);
  } finally {
    actionState.savingClaudeSettings = false;
    applyLoadingStates();
    if (appState.dashboard) {
      renderClaudeControls(appState.dashboard);
    }
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
