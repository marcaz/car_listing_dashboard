const els = {
  dashboardThemeSelect: document.getElementById("dashboard-theme"),
  topbarPollDot: document.getElementById("topbar-poll-dot"),
  topbarPollState: document.getElementById("topbar-poll-state"),
  topbarListingCount: document.getElementById("topbar-listing-count"),
  monitorTabs: document.getElementById("monitor-tabs"),
  monitorAddModal: document.getElementById("monitor-add-modal"),
  monitorAddCloseBtn: document.getElementById("monitor-add-close-btn"),
  monitorAddCancelBtn: document.getElementById("monitor-add-cancel-btn"),
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
  activeMonitorCollapsedSummary: document.getElementById("active-monitor-collapsed-summary"),
  activeMonitorSummaryTotal: document.getElementById("active-monitor-total-results"),
  activeMonitorSummaryNew: document.getElementById("active-monitor-new-results"),
  activeMonitorSummaryUpdated: document.getElementById("active-monitor-updated-results"),
  monitorSettingsToggleBtn: document.getElementById("monitor-settings-toggle-btn"),
  monitorSettingsPanel: document.getElementById("monitor-settings-panel"),
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
  statusMessage: document.getElementById("status-message"),
  claudeStateInline: document.getElementById("monitor-claude-indicator"),
  activeMonitorStatusGrid: document.getElementById("active-monitor-status-grid"),
  statusItemLastPoll: document.getElementById("status-item-last-poll"),
  statusItemResult: document.getElementById("status-item-result"),
  listingSegments: document.getElementById("listing-segments"),
  listingSortBy: document.getElementById("listing-sort"),
  listingsStatsStrip: document.getElementById("listings-stats-strip"),
  listingColumnsHead: document.querySelector(".listing-columns-head"),
  segmentSummary: document.getElementById("segment-summary"),
  listingsCount: document.getElementById("listings-count"),
  listingFeed: document.getElementById("listing-feed"),
  debugLogFeed: document.getElementById("debug-log-feed"),
  debugLogClearBtn: document.getElementById("debug-log-clear-btn"),
  debugLogPauseBtn: document.getElementById("debug-log-pause-btn"),
  globalSettingsToggleBtn: document.getElementById("global-settings-toggle-btn"),
  globalSettingsCloseBtn: document.getElementById("global-settings-close-btn"),
  globalSettingsPanel: document.getElementById("global-settings-panel"),
  globalSettingsBackdrop: document.getElementById("global-settings-backdrop"),
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
  sortBy: "price_asc",
  expandedListingIds: new Set(),
  expandedListingMonitorId: null,
  debugLogPaused: false,
  monitorSettingsCollapsed: true,
  monitorAddModalOpen: false,
  globalSettingsOpen: false,
  dashboardTheme: "ghost",
};

const DEBUG_LOG_LIMIT = 160;

function sanitizeDebugPayload(value) {
  const sensitiveKeys = new Set(["apiKey", "apikey", "authorization", "token", "password", "secret"]);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDebugPayload(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    const lowered = String(key || "").toLowerCase();
    if (sensitiveKeys.has(lowered)) {
      output[key] = raw ? "[MASKED]" : raw;
      continue;
    }
    output[key] = sanitizeDebugPayload(raw);
  }
  return output;
}

function sanitizeThemeName(rawValue) {
  const value = String(rawValue || "").trim().toLowerCase();
  if (value === "ember" || value === "pulse" || value === "ghost") {
    return value;
  }
  return "ghost";
}

function applyDashboardTheme(themeName) {
  if (typeof document === "undefined") {
    return;
  }
  const normalizedTheme = sanitizeThemeName(themeName || appState.dashboardTheme);
  appState.dashboardTheme = normalizedTheme;
  document.body.dataset.theme = normalizedTheme;
  if (els.dashboardThemeSelect && els.dashboardThemeSelect.value !== normalizedTheme) {
    els.dashboardThemeSelect.value = normalizedTheme;
  }
}

function pushDebugLog(level, message, details) {
  if (!els.debugLogFeed || appState.debugLogPaused) {
    return;
  }
  const entry = document.createElement("div");
  entry.className = `debug-log-entry ${level || "info"}`;
  const timestamp = new Date().toLocaleTimeString();
  const sanitizedDetails = details && typeof details === "object" ? sanitizeDebugPayload(details) : details;
  const detailsText =
    sanitizedDetails && typeof sanitizedDetails === "object"
      ? ` ${JSON.stringify(sanitizedDetails)}`
      : sanitizedDetails
        ? ` ${String(sanitizedDetails)}`
        : "";
  entry.textContent = `[${timestamp}] ${String(message || "")}${detailsText}`;
  els.debugLogFeed.prepend(entry);
  while (els.debugLogFeed.children.length > DEBUG_LOG_LIMIT) {
    els.debugLogFeed.removeChild(els.debugLogFeed.lastChild);
  }
}

function isSmartphoneViewport() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function focusMonitorAddInput() {
  if (!els.addMonitorName) {
    return;
  }
  setTimeout(() => {
    els.addMonitorName.focus();
  }, 0);
}

function applyOverlayBodyState() {
  if (typeof document === "undefined") {
    return;
  }
  document.body.classList.toggle(
    "overlay-open",
    Boolean(appState.monitorAddModalOpen || appState.globalSettingsOpen)
  );
}

function applyMonitorAddModalState() {
  if (!els.monitorAddModal) {
    return;
  }
  const open = Boolean(appState.monitorAddModalOpen);
  els.monitorAddModal.hidden = !open;
  els.monitorAddModal.setAttribute("aria-hidden", String(!open));
  applyOverlayBodyState();
  if (open) {
    focusMonitorAddInput();
  }
}

function applyGlobalSettingsPanelState() {
  const panel = els.globalSettingsPanel;
  const backdrop = els.globalSettingsBackdrop;
  const toggle = els.globalSettingsToggleBtn;
  const open = Boolean(appState.globalSettingsOpen);
  if (panel) {
    panel.setAttribute("aria-hidden", String(!open));
    panel.classList.toggle("open", open);
  }
  if (backdrop) {
    backdrop.setAttribute("aria-hidden", String(!open));
    backdrop.classList.toggle("open", open);
  }
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.classList.toggle("active", open);
  }
  applyOverlayBodyState();
}

function applyMonitorSettingsPanelState() {
  const panel = els.monitorSettingsPanel;
  const toggle = els.monitorSettingsToggleBtn;
  const collapsedSummary = els.activeMonitorCollapsedSummary;
  if (!panel || !toggle) {
    return;
  }
  const collapsed = appState.monitorSettingsCollapsed;
  panel.hidden = collapsed;
  panel.setAttribute("aria-hidden", String(collapsed));
  toggle.setAttribute("aria-expanded", String(!collapsed));
  const label = toggle.querySelector(".monitor-settings-toggle-label");
  const labelText = collapsed ? "Show monitor settings" : "Hide monitor settings";
  toggle.setAttribute("title", labelText);
  if (label) {
    label.textContent = labelText;
  }
  toggle.classList.toggle("monitor-settings-open", !collapsed);
  if (collapsedSummary) {
    collapsedSummary.hidden = !collapsed;
    collapsedSummary.setAttribute("aria-hidden", String(!collapsed));
  }
  applyActiveMonitorPollStatusDisplay();
}

function formatCollapsedClaudeModeLabel(settings) {
  const s = settings || {};
  if (!s.claudeAvailable) {
    return { text: "Claude unavailable", tone: "unavailable" };
  }
  return s.claudeParsingEnabled
    ? { text: "Claude API on", tone: "on" }
    : { text: "Claude API off", tone: "off" };
}

function applyActiveMonitorPollStatusDisplay() {
  const grid = els.activeMonitorStatusGrid;
  const lastPollItem = els.statusItemLastPoll;
  const resultItem = els.statusItemResult;
  const claudeStateInline = els.claudeStateInline;
  const collapsed = appState.monitorSettingsCollapsed;
  const settings = appState.dashboard?.settings;

  for (const el of [lastPollItem, resultItem]) {
    if (el) {
      el.hidden = collapsed;
      el.setAttribute("aria-hidden", String(collapsed));
    }
  }

  if (!claudeStateInline) {
    return;
  }

  claudeStateInline.innerHTML = "";
  const collapsedMode = formatCollapsedClaudeModeLabel(settings);
  renderCollapsedModeToken(claudeStateInline, collapsedMode);
}

function renderCollapsedModeToken(target, modeState) {
  if (!target) {
    return;
  }
  const tone = modeState?.tone || "unavailable";
  const text = modeState?.text || "Claude unavailable";
  const token = document.createElement("span");
  token.className = `mode-status-token mode-status-token-${tone}`;
  const dot = document.createElement("span");
  dot.className = "mode-status-dot";
  dot.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "mode-status-text";
  label.textContent = text;
  token.append(dot, label);
  target.appendChild(token);
}

function formatCompactResultLabel(status, message) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "success" || normalizedStatus === "ok") {
    return "OK";
  }
  if (normalizedStatus === "error" || normalizedStatus === "failed") {
    return "Error";
  }
  const rawMessage = String(message || "").trim();
  if (!rawMessage || rawMessage === "-") {
    return "Idle";
  }
  if (rawMessage.length <= 40) {
    return rawMessage;
  }
  return `${rawMessage.slice(0, 39)}…`;
}

function renderListingsStatsStrip(activeMonitor, allListings, filteredListings) {
  if (!els.listingsStatsStrip) {
    return;
  }
  const total = Number(allListings?.length || 0);
  const shown = Number(filteredListings?.length || 0);
  const newCount = Number(activeMonitor?.newListings || 0);
  const updatedCount = Number((allListings || []).reduce(
    (count, listing) => (isRecentlyUpdated(listing) ? count + 1 : count),
    0
  ));
  const staleCount = Number(activeMonitor?.staleListings || 0);
  const chips = [
    { key: "shown", label: "Shown", value: shown },
    { key: "total", label: "Total", value: total },
    { key: "new", label: "New", value: newCount },
    { key: "updated", label: "Updated", value: updatedCount },
    { key: "stale", label: "Stale", value: staleCount },
  ];
  els.listingsStatsStrip.innerHTML = chips
    .map(
      (chip) => `
      <span class="listings-stat-chip ${chip.key}">
        <span class="chip-dot" aria-hidden="true"></span>
        <span class="chip-label">${chip.label}</span>
        <strong class="chip-value">${chip.value}</strong>
      </span>`
    )
    .join("");
}

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
      "Claude fallback currently unavailable. Set API key below and save settings.";
    applyActiveMonitorPollStatusDisplay();
    return;
  }

  els.claudeStatusText.textContent = enabled
    ? `Claude fallback enabled (${settings.claudeApiKeySource || "unknown"} key source).`
    : "Deterministic parser only.";
  applyActiveMonitorPollStatusDisplay();
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
  if (!listing || !listing.changedInLastPoll) {
    return false;
  }
  return true;
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

function sanitizeLocationDisplayValue(value) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length > 42) {
    return null;
  }
  if (/\d/.test(normalized) && /€|eur|kw|km|benzinas|dyzelinas|automatin/i.test(normalized)) {
    return null;
  }
  return normalized;
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

function parsePriceAmount(listing) {
  const raw = inferPrice(listing);
  if (!raw) {
    return Number.NaN;
  }
  const numeric = Number.parseFloat(String(raw).replace(/[^\d,.\-]/g, "").replace(",", "."));
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function compareTextAsc(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}

function sortListings(listings, sortBy) {
  const sorted = [...(listings || [])];
  switch (sortBy) {
    case "price_asc":
      sorted.sort((a, b) => {
        const aPrice = parsePriceAmount(a);
        const bPrice = parsePriceAmount(b);
        const aFinite = Number.isFinite(aPrice);
        const bFinite = Number.isFinite(bPrice);
        if (!aFinite && !bFinite) {
          return 0;
        }
        if (!aFinite) {
          return 1;
        }
        if (!bFinite) {
          return -1;
        }
        return aPrice - bPrice;
      });
      break;
    case "price_desc":
      sorted.sort((a, b) => {
        const aPrice = parsePriceAmount(a);
        const bPrice = parsePriceAmount(b);
        const aFinite = Number.isFinite(aPrice);
        const bFinite = Number.isFinite(bPrice);
        if (!aFinite && !bFinite) {
          return 0;
        }
        if (!aFinite) {
          return 1;
        }
        if (!bFinite) {
          return -1;
        }
        return bPrice - aPrice;
      });
      break;
    case "year_desc":
      sorted.sort((a, b) => {
        const aYear = Number(inferYear(a));
        const bYear = Number(inferYear(b));
        const aFinite = Number.isFinite(aYear);
        const bFinite = Number.isFinite(bYear);
        if (!aFinite && !bFinite) {
          return compareTextAsc(inferModel(a), inferModel(b));
        }
        if (!aFinite) {
          return 1;
        }
        if (!bFinite) {
          return -1;
        }
        if (bYear !== aYear) {
          return bYear - aYear;
        }
        return compareTextAsc(inferModel(a), inferModel(b));
      });
      break;
    case "year_asc":
      sorted.sort((a, b) => {
        const aYear = Number(inferYear(a));
        const bYear = Number(inferYear(b));
        const aFinite = Number.isFinite(aYear);
        const bFinite = Number.isFinite(bYear);
        if (!aFinite && !bFinite) {
          return compareTextAsc(inferModel(a), inferModel(b));
        }
        if (!aFinite) {
          return 1;
        }
        if (!bFinite) {
          return -1;
        }
        if (aYear !== bYear) {
          return aYear - bYear;
        }
        return compareTextAsc(inferModel(a), inferModel(b));
      });
      break;
    case "model_asc":
      sorted.sort((a, b) => compareTextAsc(inferModel(a), inferModel(b)));
      break;
    case "recently_changed":
      sorted.sort((a, b) => {
        const aChanged = Date.parse(a.lastChangedAt || "") || 0;
        const bChanged = Date.parse(b.lastChangedAt || "") || 0;
        return bChanged - aChanged;
      });
      break;
    case "location_asc":
      sorted.sort((a, b) =>
        compareTextAsc(
          `${inferCity(a) || ""}, ${inferCountry(a) || ""}`,
          `${inferCity(b) || ""}, ${inferCountry(b) || ""}`
        )
      );
      break;
    case "newest":
    default:
      sorted.sort((a, b) => {
        const aFirstSeen = Date.parse(a.firstSeenAt || "") || 0;
        const bFirstSeen = Date.parse(b.firstSeenAt || "") || 0;
        return bFirstSeen - aFirstSeen;
      });
      break;
  }
  return sorted;
}

function formatConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }
  return `${Math.round(numeric * 100)}%`;
}

function formatChangeType(value) {
  const normalized = (value || "").toString().trim().toLowerCase();
  const labels = {
    price_drop: "Price drop",
    price_increase: "Price increase",
    details_update: "Details update",
    photo_update: "Photo update",
    link_update: "Link update",
    repost: "Repost",
  };
  return labels[normalized] || "-";
}

function formatRiskLevel(value) {
  const normalized = (value || "").toString().trim().toLowerCase();
  const labels = {
    low: "Low risk",
    medium: "Medium risk",
    high: "High risk",
  };
  return labels[normalized] || "-";
}

function buildRiskBadge(listing) {
  const level = (listing?.riskLevel || "").toString().trim().toLowerCase();
  const score = Number(listing?.riskScore);
  if (!level && !Number.isFinite(score)) {
    return null;
  }
  const badge = document.createElement("span");
  const normalizedLevel = level || (score >= 55 ? "high" : score >= 25 ? "medium" : "low");
  badge.className = `badge risk risk-${normalizedLevel}`;
  const scoreLabel = Number.isFinite(score) ? ` ${Math.round(score)}` : "";
  badge.textContent = `RISK${scoreLabel}`;
  return badge;
}

function buildChangeBadge(changeType) {
  const normalized = (changeType || "").toString().trim().toLowerCase();
  const specs = {
    price_drop: {
      label: "PRICE DROP",
      className: "change-price-drop",
    },
    price_increase: {
      label: "PRICE UP",
      className: "change-price-increase",
    },
    details_update: {
      label: "DETAILS UPDATED",
      className: "change-details",
    },
    photo_update: {
      label: "PHOTO UPDATED",
      className: "change-photo",
    },
    link_update: {
      label: "LINK UPDATED",
      className: "change-link",
    },
    repost: {
      label: "REPOST",
      className: "change-repost",
    },
  };
  const spec = specs[normalized];
  if (!spec) {
    return null;
  }
  const badge = document.createElement("span");
  badge.className = `badge ${spec.className}`;
  badge.textContent = spec.label;
  return badge;
}

function makeDetailItem(label, value) {
  const row = document.createElement("div");
  row.className = "listing-detail-item";

  const labelNode = document.createElement("span");
  labelNode.className = "detail-label";
  labelNode.textContent = label;

  const valueNode = document.createElement("span");
  valueNode.className = "detail-value";
  valueNode.textContent = value || "-";

  row.append(labelNode, valueNode);
  return row;
}

function buildListingDetails(listing, model, year, price, locationLabel) {
  const details = document.createElement("div");
  details.className = "listing-details";

  const mediaColumn = document.createElement("div");
  mediaColumn.className = "listing-media";

  if (listing.imageUrl) {
    const thumb = document.createElement("img");
    thumb.className = "listing-thumb";
    thumb.src = listing.imageUrl;
    thumb.alt = `${model} thumbnail`;
    thumb.loading = "lazy";
    thumb.decoding = "async";
    thumb.width = 128;
    thumb.height = 128;
    mediaColumn.appendChild(thumb);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "listing-thumb placeholder";
    placeholder.textContent = "No image";
    mediaColumn.appendChild(placeholder);
  }

  const detailGrid = document.createElement("div");
  detailGrid.className = "listing-detail-grid";
  detailGrid.append(
    makeDetailItem("Model", model),
    makeDetailItem("Year", year || "-"),
    makeDetailItem("Price", price || "-"),
    makeDetailItem("Location", locationLabel),
    makeDetailItem("Change type", formatChangeType(listing.changeType)),
    makeDetailItem("Change reason", listing.changeReason || "-"),
    makeDetailItem("Change confidence", formatConfidence(listing.changeConfidence)),
    makeDetailItem("Classified by", listing.changedBy || "-"),
    makeDetailItem("Risk score", Number.isFinite(Number(listing.riskScore)) ? String(Math.round(Number(listing.riskScore))) : "-"),
    makeDetailItem("Risk level", formatRiskLevel(listing.riskLevel)),
    makeDetailItem(
      "Risk reasons",
      Array.isArray(listing.riskReasons) && listing.riskReasons.length > 0
        ? listing.riskReasons.join(" | ")
        : "-"
    ),
    makeDetailItem("Risk confidence", formatConfidence(listing.riskConfidence)),
    makeDetailItem("Risk scored by", listing.riskScoredBy || "-"),
    makeDetailItem("Repost of ID", listing.repostOfId || "-"),
    makeDetailItem("Title", listing.title || "-"),
    makeDetailItem("Updated text", listing.updatedText || "-"),
    makeDetailItem("First seen", formatDateTime(listing.firstSeenAt)),
    makeDetailItem("Last changed", formatDateTime(listing.lastChangedAt)),
    makeDetailItem("Last seen", formatDateTime(listing.lastSeenAt)),
    makeDetailItem("Parse confidence", formatConfidence(listing.parseConfidence))
  );

  const sourceRow = document.createElement("div");
  sourceRow.className = "listing-source-row";
  const sourceLink = document.createElement("a");
  sourceLink.href = listing.url;
  sourceLink.target = "_blank";
  sourceLink.rel = "noopener noreferrer";
  sourceLink.textContent = "Open full listing";
  sourceLink.className = "source-link";
  sourceRow.appendChild(sourceLink);

  const contentColumn = document.createElement("div");
  contentColumn.className = "listing-content";
  contentColumn.append(detailGrid, sourceRow);

  details.append(mediaColumn, contentColumn);
  return details;
}

function monitorCard(monitor, isActive) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `monitor-tab${isActive ? " active" : ""}`;
  button.dataset.monitorId = monitor.id;
  button.setAttribute("aria-selected", String(isActive));
  const monitorName = String(monitor.name || "Monitor");
  const pollingIndicator = monitor.pollingInProgress ? '<span class="monitor-tab-dot polling" aria-hidden="true"></span>' : "";
  button.innerHTML = `
    <span class="monitor-tab-name">${monitorName}</span>
    <span class="monitor-tab-meta">
      ${pollingIndicator}
      <span>${monitor.newListings || 0} new</span>
      <span>${monitor.totalListings || 0} total</span>
    </span>
  `;
  return button;
}

function monitorAddTab() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "monitor-tab monitor-tab-add";
  button.dataset.action = "add-monitor";
  button.setAttribute("aria-label", "Add monitor");
  button.innerHTML = `
    <span class="monitor-tab-add-icon" aria-hidden="true">+</span>
    <span class="monitor-tab-add-text">New monitor</span>
  `;
  return button;
}

function listingCard(listing) {
  const updated = isRecentlyUpdated(listing);
  const model = inferModel(listing);
  const year = inferYear(listing);
  const price = inferPrice(listing) || "-";
  const city = sanitizeLocationDisplayValue(inferCity(listing));
  const country = sanitizeLocationDisplayValue(inferCountry(listing));
  const locationLabel = city && country ? `${city}, ${country}` : city || country || "-";
  const expanded = appState.expandedListingIds.has(listing.id);
  const wrapper = document.createElement("article");
  wrapper.className = `listing${listing.isNew ? " new" : ""}${updated ? " updated" : ""}${listing.isStale ? " stale" : ""}${expanded ? " expanded" : ""}`;
  wrapper.dataset.listingId = listing.id;

  const compactRow = document.createElement("div");
  compactRow.className = "listing-main";

  const indicator = document.createElement("span");
  indicator.className = "listing-indicator";
  indicator.setAttribute("aria-hidden", "true");

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
  yearCell.className = "listing-cell year";
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
    const sourceChangedAt = formatDateTime(listing.lastSourceChangeAt || listing.lastChangedAt);
    badge.textContent = `UPDATED ${sourceChangedAt}`;
    badges.appendChild(badge);
  }
  if (listing.isStale) {
    const badge = document.createElement("span");
    badge.className = "badge stale";
    badge.textContent = "NOT IN LATEST SCAN";
    badges.appendChild(badge);
  }
  const changeBadge = buildChangeBadge(listing.changeType);
  if (changeBadge) {
    badges.appendChild(changeBadge);
  }
  const riskBadge = buildRiskBadge(listing);
  if (riskBadge) {
    badges.appendChild(riskBadge);
  }

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "listing-expand-btn";
  toggleBtn.dataset.listingId = listing.id;
  toggleBtn.setAttribute("aria-expanded", String(expanded));
  toggleBtn.textContent = expanded ? "Collapse" : "Expand";

  const rowTail = document.createElement("div");
  rowTail.className = "listing-row-tail";
  rowTail.append(badges, toggleBtn);

  const topRow = document.createElement("div");
  topRow.className = "listing-top-row";
  topRow.append(indicator, compactRow, rowTail);

  wrapper.append(topRow);
  if (expanded) {
    wrapper.append(buildListingDetails(listing, model, year, price, locationLabel));
  }
  return wrapper;
}

function renderMonitorList(payload) {
  const monitors = payload.monitors || [];
  if (!els.monitorTabs) {
    return;
  }
  els.monitorTabs.innerHTML = "";

  monitors.forEach((monitor) => {
    const active = monitor.id === payload.activeMonitorId;
    els.monitorTabs.appendChild(monitorCard(monitor, active));
  });
  els.monitorTabs.appendChild(monitorAddTab());
}

function renderActiveMonitor(payload) {
  const activeMonitor = payload.activeMonitor;
  if (!activeMonitor) {
    appState.expandedListingIds.clear();
    appState.expandedListingMonitorId = null;
    els.activeMonitorTitle.textContent = "No active monitor";
    els.activeMonitorName.value = "";
    els.activeMonitorUrl.value = "";
    els.activePollInterval.value = 60;
    els.activeNewBadge.value = 120;
    els.statusLastPoll.textContent = "-";
    els.statusMessage.textContent = "-";
    applyActiveMonitorPollStatusDisplay();
    if (els.topbarListingCount) {
      els.topbarListingCount.textContent = "0";
    }
    if (els.topbarPollState) {
      els.topbarPollState.textContent = "Idle";
    }
    if (els.topbarPollDot) {
      els.topbarPollDot.classList.remove("active");
    }
    if (els.activeMonitorSummaryTotal) {
      els.activeMonitorSummaryTotal.textContent = "0";
    }
    if (els.activeMonitorSummaryNew) {
      els.activeMonitorSummaryNew.textContent = "0";
    }
    if (els.activeMonitorSummaryUpdated) {
      els.activeMonitorSummaryUpdated.textContent = "0";
    }
    if (els.activeMonitorCollapsedSummary) {
      els.activeMonitorCollapsedSummary.hidden = true;
    }
    if (els.listingsStatsStrip) {
      els.listingsStatsStrip.innerHTML = "";
    }
    if (els.listingColumnsHead) {
      els.listingColumnsHead.hidden = true;
    }
    appState.monitorSettingsCollapsed = true;
    applyMonitorSettingsPanelState();
    els.listingsCount.textContent = "0";
    els.segmentSummary.textContent = "No monitor selected.";
    els.listingFeed.innerHTML = '<div class="empty-state">Select or create a monitor to view listings.</div>';
    return;
  }

  els.activeMonitorTitle.textContent = activeMonitor.name;
  els.activeMonitorName.value = activeMonitor.name || "";
  els.activeMonitorUrl.value = activeMonitor.searchUrl || "";
  els.activePollInterval.value = Math.round((activeMonitor.pollIntervalMs || 0) / 1000);
  els.activeNewBadge.value = activeMonitor.newBadgeMinutes || 120;

  const pollStatus = activeMonitor.lastPoll || {};
  els.statusLastPoll.textContent = pollStatus.at ? formatDateTime(pollStatus.at) : "-";
  els.statusMessage.textContent = formatCompactResultLabel(pollStatus.status, pollStatus.message);
  applyActiveMonitorPollStatusDisplay();

  const allListings = activeMonitor.listings || [];
  if (els.topbarListingCount) {
    els.topbarListingCount.textContent = String(allListings.length);
  }
  const updatedCount = allListings.reduce(
    (count, listing) => (isRecentlyUpdated(listing) ? count + 1 : count),
    0
  );
  if (els.activeMonitorSummaryTotal) {
    els.activeMonitorSummaryTotal.textContent = String(allListings.length);
  }
  if (els.activeMonitorSummaryNew) {
    els.activeMonitorSummaryNew.textContent = String(activeMonitor.newListings || 0);
  }
  if (els.activeMonitorSummaryUpdated) {
    els.activeMonitorSummaryUpdated.textContent = String(updatedCount);
  }

  const pollingNow =
    Boolean(activeMonitor.pollingInProgress) ||
    actionState.pollingMonitor ||
    actionState.savingMonitor;
  els.pollingIndicator.classList.toggle("polling", pollingNow);
  els.pollingIndicator.classList.toggle("idle", !pollingNow);
  els.pollingText.textContent = pollingNow
    ? `Polling ${activeMonitor.name}...`
    : "Idle - waiting for next poll";
  if (els.topbarPollState) {
    els.topbarPollState.textContent = pollingNow ? "Polling" : "Idle";
  }
  if (els.topbarPollDot) {
    els.topbarPollDot.classList.toggle("active", pollingNow);
  }
  applyMonitorSettingsPanelState();
  if (appState.expandedListingMonitorId !== activeMonitor.id) {
    appState.expandedListingIds.clear();
    appState.expandedListingMonitorId = activeMonitor.id;
  }
  const allListingIds = new Set(allListings.map((listing) => listing.id));
  for (const listingId of Array.from(appState.expandedListingIds)) {
    if (!allListingIds.has(listingId)) {
      appState.expandedListingIds.delete(listingId);
    }
  }
  const filteredListings = sortListings(
    buildFilteredListings(activeMonitor, appState.activeSegment),
    appState.sortBy
  );
  renderListingsStatsStrip(activeMonitor, allListings, filteredListings);
  if (els.listingColumnsHead) {
    els.listingColumnsHead.hidden = filteredListings.length === 0;
  }
  els.listingsCount.textContent = String(filteredListings.length);
  if (els.listingSortBy) {
    els.listingSortBy.value = appState.sortBy;
  }

  const normalizationSummary = activeMonitor.lastPoll?.normalization;
  const riskSummary = activeMonitor.lastPoll?.riskAssessment;
  const classificationSummary = activeMonitor.lastPoll?.changeClassification;
  const normalizationText =
    normalizationSummary && typeof normalizationSummary.message === "string"
      ? normalizationSummary.message
      : "Normalization unavailable.";
  const classificationText =
    classificationSummary && typeof classificationSummary.message === "string"
      ? classificationSummary.message
      : "Change classification unavailable.";
  const riskText =
    riskSummary && typeof riskSummary.message === "string"
      ? riskSummary.message
      : "Risk scoring unavailable.";
  els.segmentSummary.textContent = `${filteredListings.length} shown / ${allListings.length} total · ${activeMonitor.newListings} marked NEW · ${activeMonitor.staleListings} stale · ${normalizationText} · ${riskText} · ${classificationText}`;

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
  const activeMonitor = payload?.activeMonitor;
  if (activeMonitor?.lastPoll) {
    const claude = activeMonitor.lastPoll.claude || {};
    const normalization = activeMonitor.lastPoll.normalization || {};
    const riskAssessment = activeMonitor.lastPoll.riskAssessment || {};
    const classification = activeMonitor.lastPoll.changeClassification || {};
    pushDebugLog(
      "info",
      `Dashboard update: poll=${activeMonitor.lastPoll.status || "unknown"}, source=${activeMonitor.lastPoll.source || "n/a"}, monitor=${activeMonitor.name || "n/a"}`,
      {
        parserMode: activeMonitor.lastPoll.parserMode || "n/a",
        claudeUsed: Boolean(claude.used),
        claudeMessage: claude.message || null,
        normalizationMessage: normalization.message || null,
        riskAssessmentMessage: riskAssessment.message || null,
        changeClassificationMessage: classification.message || null,
      }
    );
  } else {
    pushDebugLog("info", "Dashboard update received.");
  }
}

async function callJson(url, method, body) {
  pushDebugLog("info", `API ${method} ${url} request`, body && typeof body === "object" ? body : null);
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
    const errorMessage = `${method} ${url} failed (${response.status})${details}`;
    pushDebugLog("error", errorMessage);
    throw new Error(errorMessage);
  }
  const payload = await response.json().catch(() => ({}));
  pushDebugLog("ok", `API ${method} ${url} success`, {
    status: response.status,
  });
  return payload;
}

async function refreshDashboard() {
  pushDebugLog("info", "Refreshing dashboard...");
  const payload = await callJson("/api/dashboard", "GET");
  renderDashboard(payload);
}

if (els.monitorTabs) {
  els.monitorTabs.addEventListener("click", async (event) => {
    const addButton = event.target.closest("[data-action='add-monitor']");
    if (addButton) {
      appState.monitorAddModalOpen = true;
      applyMonitorAddModalState();
      return;
    }
    const button = event.target.closest("[data-monitor-id]");
    if (!button) {
      return;
    }
    const monitorId = button.dataset.monitorId;
    if (!monitorId || monitorId === appState.dashboard?.activeMonitorId) {
      return;
    }
    try {
      pushDebugLog("info", "Switching active monitor", { monitorId });
      const payload = await callJson(`/api/monitors/${monitorId}/activate`, "POST");
      renderDashboard(payload);
    } catch (error) {
      pushDebugLog("error", "Failed to activate monitor", { monitorId, error: error.message });
      alert(`Failed to activate monitor: ${error.message}`);
    }
  });
}

els.addMonitorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  actionState.addingMonitor = true;
  applyLoadingStates();
  try {
    pushDebugLog("info", "Adding monitor", {
      name: els.addMonitorName.value.trim() || null,
      searchUrl: els.addMonitorUrl.value.trim() || null,
    });
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
    appState.monitorAddModalOpen = false;
    applyMonitorAddModalState();
    renderDashboard(payload);
  } catch (error) {
    pushDebugLog("error", "Failed to add monitor", { error: error.message });
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
    pushDebugLog("info", "Updating Claude toggle", { nextEnabled: !current });
    const payload = await callJson("/api/settings", "PATCH", {
      claudeParsingEnabled: !current,
    });
    renderDashboard(payload);
  } catch (error) {
    pushDebugLog("error", "Failed to update Claude toggle", { error: error.message });
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
  const current = appState.dashboard?.settings || {};
  const claudeCurrent = current.claude || {};
  actionState.savingClaudeSettings = true;
  applyLoadingStates();
  try {
    pushDebugLog("info", "Saving Claude settings", {
      model: els.claudeModel.value.trim(),
      reasoningStrength: els.claudeReasoningStrength.value,
      maxCandidates: Number(els.claudeMaxCandidates.value),
      minConfidence: Number(els.claudeMinConfidence.value),
      temperature: Number(els.claudeTemperature.value),
      maxTokens: Number(els.claudeMaxTokens.value),
      providedApiKey: Boolean(els.claudeApiKey.value.trim()),
    });
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
    pushDebugLog("error", "Failed to save Claude settings", { error: error.message });
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
    pushDebugLog("info", "Saving active monitor settings", {
      monitorId,
      searchUrl: els.activeMonitorUrl.value.trim(),
      pollIntervalSeconds: Number(els.activePollInterval.value),
      newBadgeMinutes: Number(els.activeNewBadge.value),
    });
    const payload = await callJson(`/api/monitors/${monitorId}`, "PATCH", {
      name: els.activeMonitorName.value.trim(),
      searchUrl: els.activeMonitorUrl.value.trim(),
      pollIntervalMs: Number(els.activePollInterval.value) * 1000,
      newBadgeMinutes: Number(els.activeNewBadge.value),
      active: true,
    });
    renderDashboard(payload);
  } catch (error) {
    pushDebugLog("error", "Failed to save active monitor", { monitorId, error: error.message });
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
    pushDebugLog("info", "Triggering manual poll", { monitorId });
    await callJson(`/api/monitors/${monitorId}/poll-now`, "POST");
    await refreshDashboard();
  } catch (error) {
    pushDebugLog("error", "Manual poll failed", { monitorId, error: error.message });
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
    pushDebugLog("info", "Delete monitor cancelled", { monitorId, monitorName });
    return;
  }
  actionState.deletingMonitor = true;
  applyLoadingStates();
  try {
    pushDebugLog("info", "Deleting monitor", { monitorId, monitorName });
    const payload = await callJson(`/api/monitors/${monitorId}`, "DELETE");
    renderDashboard(payload);
  } catch (error) {
    pushDebugLog("error", "Failed to delete monitor", { monitorId, error: error.message });
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
  pushDebugLog("info", "Listing segment changed", { segment });
  if (appState.dashboard) {
    renderDashboard(appState.dashboard);
  }
});

if (els.listingSortBy) {
  els.listingSortBy.addEventListener("change", (event) => {
    const nextSort = event.target.value || "newest";
    if (nextSort === appState.sortBy) {
      return;
    }
    appState.sortBy = nextSort;
    pushDebugLog("info", "Listing sort changed", { sortBy: nextSort });
    if (appState.dashboard) {
      renderActiveMonitor(appState.dashboard);
    }
  });
}

if (els.dashboardThemeSelect) {
  els.dashboardThemeSelect.addEventListener("change", (event) => {
    const nextTheme = sanitizeThemeName(event.target.value);
    applyDashboardTheme(nextTheme);
    pushDebugLog("info", "Dashboard theme changed", { theme: nextTheme });
  });
}

if (els.globalSettingsToggleBtn) {
  els.globalSettingsToggleBtn.addEventListener("click", () => {
    appState.globalSettingsOpen = !appState.globalSettingsOpen;
    applyGlobalSettingsPanelState();
  });
}

if (els.globalSettingsCloseBtn) {
  els.globalSettingsCloseBtn.addEventListener("click", () => {
    appState.globalSettingsOpen = false;
    applyGlobalSettingsPanelState();
  });
}

if (els.globalSettingsBackdrop) {
  els.globalSettingsBackdrop.addEventListener("click", () => {
    appState.globalSettingsOpen = false;
    applyGlobalSettingsPanelState();
  });
}

if (els.monitorAddCloseBtn) {
  els.monitorAddCloseBtn.addEventListener("click", () => {
    appState.monitorAddModalOpen = false;
    applyMonitorAddModalState();
  });
}

if (els.monitorAddCancelBtn) {
  els.monitorAddCancelBtn.addEventListener("click", () => {
    appState.monitorAddModalOpen = false;
    applyMonitorAddModalState();
  });
}

if (els.monitorSettingsToggleBtn) {
  els.monitorSettingsToggleBtn.addEventListener("click", () => {
    appState.monitorSettingsCollapsed = !appState.monitorSettingsCollapsed;
    applyMonitorSettingsPanelState();
  });
}

if (els.debugLogClearBtn) {
  els.debugLogClearBtn.addEventListener("click", () => {
    if (els.debugLogFeed) {
      els.debugLogFeed.innerHTML = "";
    }
    pushDebugLog("info", "Debug log cleared.");
  });
}

if (els.debugLogPauseBtn) {
  els.debugLogPauseBtn.addEventListener("click", () => {
    appState.debugLogPaused = !appState.debugLogPaused;
    els.debugLogPauseBtn.textContent = appState.debugLogPaused ? "Resume" : "Pause";
    if (!appState.debugLogPaused) {
      pushDebugLog("info", "Debug log resumed.");
    } else {
      pushDebugLog("warn", "Debug log paused.");
    }
  });
}

if (els.monitorAddModal) {
  els.monitorAddModal.addEventListener("click", (event) => {
    if (event.target === els.monitorAddModal) {
      appState.monitorAddModalOpen = false;
      applyMonitorAddModalState();
    }
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (appState.monitorAddModalOpen) {
      appState.monitorAddModalOpen = false;
      applyMonitorAddModalState();
      return;
    }
    if (appState.globalSettingsOpen) {
      appState.globalSettingsOpen = false;
      applyGlobalSettingsPanelState();
    }
  });
}

els.listingFeed.addEventListener("click", (event) => {
  const interactiveTarget = event.target.closest(
    "a, button, input, select, textarea, label, [role='button'], [data-ignore-card-toggle='true']"
  );
  const toggleButton = event.target.closest(".listing-expand-btn");
  if (interactiveTarget && !toggleButton) {
    return;
  }
  const listingRow = event.target.closest(".listing");
  const listingId = toggleButton?.dataset.listingId || listingRow?.dataset.listingId;
  if (!listingId) {
    return;
  }
  if (appState.expandedListingIds.has(listingId)) {
    appState.expandedListingIds.delete(listingId);
  } else {
    appState.expandedListingIds.add(listingId);
  }
  if (appState.dashboard) {
    renderActiveMonitor(appState.dashboard);
  }
});

function connectSse() {
  const events = new EventSource("/api/events");
  pushDebugLog("info", "SSE connection opened.");
  events.addEventListener("dashboard-update", (event) => {
    try {
      renderDashboard(JSON.parse(event.data));
      pushDebugLog("ok", "SSE dashboard-update received.");
    } catch {
      // Ignore malformed payloads.
      pushDebugLog("error", "Malformed SSE dashboard payload.");
    }
  });
  events.onerror = () => {
    pushDebugLog("error", "SSE connection error. Reconnecting in 3s.");
    events.close();
    setTimeout(connectSse, 3000);
  };
}

refreshDashboard().catch((error) => {
  pushDebugLog("error", "Initial dashboard load failed", { error: error.message });
  alert(`Failed to load dashboard: ${error.message}`);
});
applyDashboardTheme(appState.dashboardTheme);
pushDebugLog("info", "Initial UI ready.");
applyMonitorSettingsPanelState();
applyMonitorAddModalState();
applyGlobalSettingsPanelState();
connectSse();
