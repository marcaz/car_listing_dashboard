const path = require("path");
const express = require("express");
const { StateStore } = require("./state-store");
const { scrapeAutoplius } = require("./scraper");
const {
  classifyListingChangesWithClaude,
  enrichListingsWithClaude,
  getClaudeAvailability,
  getClaudeApiKeySource,
  normalizeListingsWithClaude,
  scoreListingsQualityWithClaude,
  resolveAnthropicConfig,
} = require("./anthropic-parser");

const PORT = Number.parseInt(process.env.PORT || "3100", 10);
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "..", "data", "state.json");
const MIN_POLL_INTERVAL_MS = 15000;

const app = express();
const store = new StateStore(STATE_FILE);
const sseClients = new Set();
const pollTimersByMonitorId = new Map();
const pollingMonitorIds = new Set();

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function toIsoNow() {
  return new Date().toISOString();
}

function makeMonitorId() {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `monitor-${Date.now().toString(36)}-${suffix}`;
}

function clampPollIntervalMs(value) {
  return Math.max(Number(value) || MIN_POLL_INTERVAL_MS, MIN_POLL_INTERVAL_MS);
}

function clampNewBadgeMinutes(value) {
  return Math.max(Number(value) || 120, 1);
}

function normalizeMonitorName(name, fallback) {
  if (typeof name !== "string") {
    return fallback;
  }
  const trimmed = name.trim();
  return trimmed || fallback;
}

function buildListingsForMonitor(monitor) {
  return monitor.listingOrder
    .map((id) => monitor.listingsById[id])
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt));
}

function computeMonitorStats(monitor) {
  let totalListings = 0;
  let newListings = 0;
  let staleListings = 0;

  for (const listing of Object.values(monitor.listingsById || {})) {
    totalListings += 1;
    if (listing.isNew) {
      newListings += 1;
    }
    if (listing.isStale) {
      staleListings += 1;
    }
  }

  return { totalListings, newListings, staleListings };
}

function buildMonitorSummary(monitorId, monitor) {
  const stats = computeMonitorStats(monitor);
  return {
    id: monitorId,
    name: monitor.name,
    searchUrl: monitor.searchUrl,
    pollIntervalMs: monitor.pollIntervalMs,
    newBadgeMinutes: monitor.newBadgeMinutes,
    lastPoll: monitor.lastPoll,
    pollingInProgress: pollingMonitorIds.has(monitorId),
    totalListings: stats.totalListings,
    newListings: stats.newListings,
    staleListings: stats.staleListings,
    createdAt: monitor.createdAt,
    updatedAt: monitor.updatedAt,
  };
}

function activeMonitorIdFromState(state) {
  if (state.monitorsById[state.activeMonitorId]) {
    return state.activeMonitorId;
  }
  return state.monitorOrder[0] || null;
}

function buildSettingsForPayload(rawSettings) {
  const resolvedClaudeConfig = resolveAnthropicConfig(rawSettings?.claude || {});
  const claudeAvailable = getClaudeAvailability(rawSettings?.claude || {});
  const explicitModel =
    typeof rawSettings?.claude?.model === "string" && rawSettings.claude.model.trim()
      ? rawSettings.claude.model.trim()
      : "";
  return {
    ...(rawSettings || {}),
    claudeAvailable,
    claudeApiKeySource: getClaudeApiKeySource(rawSettings?.claude || {}),
    claude: {
      ...(rawSettings?.claude || {}),
      model: explicitModel || resolvedClaudeConfig.model,
      apiKey: undefined,
      hasApiKey: Boolean(resolvedClaudeConfig.apiKey),
      apiKeyMasked: resolvedClaudeConfig.apiKey ? "********" : "",
    },
  };
}

function buildDashboardPayload() {
  const state = store.getState();
  const activeMonitorId = activeMonitorIdFromState(state);
  const monitors = state.monitorOrder
    .filter((monitorId) => Boolean(state.monitorsById[monitorId]))
    .map((monitorId) => buildMonitorSummary(monitorId, state.monitorsById[monitorId]));

  let activeMonitor = null;
  if (activeMonitorId) {
    const monitor = state.monitorsById[activeMonitorId];
    if (monitor) {
      activeMonitor = {
        ...buildMonitorSummary(activeMonitorId, monitor),
        listings: buildListingsForMonitor(monitor),
      };
    }
  }

  return {
    activeMonitorId,
    settings: buildSettingsForPayload(state.settings),
    monitors,
    activeMonitor,
    generatedAt: toIsoNow(),
  };
}

function broadcastUpdate(type, payload) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const response of sseClients) {
    response.write(message);
  }
}

function broadcastDashboardUpdate() {
  broadcastUpdate("dashboard-update", buildDashboardPayload());
}

function recalculateNewFlags(monitor, nowIso) {
  const nowMs = Date.parse(nowIso);
  const freshThresholdMs = monitor.newBadgeMinutes * 60 * 1000;
  for (const listing of Object.values(monitor.listingsById || {})) {
    const seenMs = Date.parse(listing.firstSeenAt);
    listing.isNew = Number.isFinite(seenMs) && nowMs - seenMs <= freshThresholdMs;
  }
}

function createLastPollErrorSnapshot(previousLastPoll, message, reason) {
  return {
    ...(previousLastPoll || {}),
    at: toIsoNow(),
    status: "error",
    message,
    reason,
    source: previousLastPoll?.source || null,
  };
}

function buildDefaultClaudeSnapshot() {
  return {
    used: false,
    available: getClaudeAvailability(store.getState().settings?.claude || {}),
    message: "Claude fallback disabled.",
  };
}

function buildListingFingerprint(listing) {
  return JSON.stringify({
    model: (listing?.model || "").toLowerCase(),
    year: listing?.year || null,
    price: (listing?.price || "").toLowerCase(),
    city: (listing?.city || "").toLowerCase(),
    country: (listing?.country || "").toLowerCase(),
    title: (listing?.title || "").toLowerCase().slice(0, 120),
  });
}

function normalizeTrackedField(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function buildSourceFingerprint(listing) {
  return JSON.stringify({
    title: normalizeTrackedField(listing?.title),
    price: normalizeTrackedField(listing?.price),
    model: normalizeTrackedField(listing?.model),
    year: listing?.year || null,
    city: normalizeTrackedField(listing?.city),
    country: normalizeTrackedField(listing?.country),
    updatedText: normalizeTrackedField(listing?.updatedText),
    imageUrl: normalizeTrackedField(listing?.imageUrl),
    url: normalizeTrackedField(listing?.url),
  });
}

function detectReposts(effectiveListings, monitor) {
  const repostsById = new Map();
  if (!Array.isArray(effectiveListings) || !monitor) {
    return repostsById;
  }

  const currentIds = new Set(effectiveListings.map((listing) => listing.id));
  const staleByFingerprint = new Map();
  for (const staleId of monitor.listingOrder || []) {
    if (currentIds.has(staleId)) {
      continue;
    }
    const staleListing = monitor.listingsById[staleId];
    if (!staleListing) {
      continue;
    }
    const fingerprint = buildListingFingerprint(staleListing);
    if (fingerprint === "{}") {
      continue;
    }
    staleByFingerprint.set(fingerprint, staleId);
  }

  for (const listing of effectiveListings) {
    const fingerprint = buildListingFingerprint(listing);
    const previousId = staleByFingerprint.get(fingerprint);
    if (previousId && previousId !== listing.id) {
      repostsById.set(listing.id, {
        repostOfId: previousId,
        reason: "Likely repost of a previously seen listing with matching fingerprint.",
      });
    }
  }
  return repostsById;
}

function computeChangedPairs(effectiveListings, monitor) {
  const changedPairs = [];
  if (!Array.isArray(effectiveListings) || !monitor) {
    return changedPairs;
  }
  for (const incoming of effectiveListings) {
    const existing = monitor.listingsById?.[incoming.id];
    if (!existing) {
      continue;
    }
    const changed =
      existing.title !== incoming.title ||
      existing.price !== incoming.price ||
      existing.model !== incoming.model ||
      existing.year !== incoming.year ||
      existing.city !== incoming.city ||
      existing.country !== incoming.country ||
      existing.updatedText !== incoming.updatedText ||
      existing.imageUrl !== incoming.imageUrl ||
      existing.url !== incoming.url;
    if (!changed) {
      continue;
    }
    changedPairs.push({
      id: incoming.id,
      before: existing,
      after: {
        ...existing,
        ...incoming,
      },
    });
  }
  return changedPairs;
}

function ensureMonitorExists(monitorId) {
  const state = store.getState();
  return Boolean(state.monitorsById[monitorId]);
}

async function runPollCycle(monitorId, reason) {
  if (!ensureMonitorExists(monitorId) || pollingMonitorIds.has(monitorId)) {
    return;
  }

  pollingMonitorIds.add(monitorId);
  broadcastDashboardUpdate();
  const pollStartedAt = toIsoNow();

  try {
    const monitorBefore = store.getState().monitorsById[monitorId];
    if (!monitorBefore) {
      return;
    }

    const scrapeResult = await scrapeAutoplius(monitorBefore.searchUrl);
    const claudeSettings = store.getState().settings?.claude || {};
    const claudeEnabled = Boolean(store.getState().settings?.claudeParsingEnabled);
    const normalization = await normalizeListingsWithClaude(scrapeResult.listings, {
      settings: claudeSettings,
      allowClaude: claudeEnabled,
    });
    let effectiveListings = normalization.listings;
    let claudeEnrichment = buildDefaultClaudeSnapshot();
    if (claudeEnabled) {
      try {
        claudeEnrichment = await enrichListingsWithClaude(effectiveListings, {
          settings: claudeSettings,
        });
      } catch (claudeError) {
        claudeEnrichment = {
          used: false,
          available: getClaudeAvailability(claudeSettings),
          message: `Claude fallback error: ${claudeError.message}`,
        };
      }
      effectiveListings = claudeEnrichment.listings;
    }
    const riskAssessment = await scoreListingsQualityWithClaude(effectiveListings, {
      settings: claudeSettings,
      allowClaude: claudeEnabled,
    });
    effectiveListings = riskAssessment.listings;

    const repostsById = detectReposts(effectiveListings, monitorBefore);
    const changedPairs = computeChangedPairs(effectiveListings, monitorBefore);
    const changedIds = new Set(changedPairs.map((pair) => pair.id));
    const classifiedChanges = await classifyListingChangesWithClaude(changedPairs, {
      settings: claudeSettings,
      allowClaude: claudeEnabled,
    });

    const scrapeIds = new Set(effectiveListings.map((item) => item.id));
    const addedIds = [];
    const updatedIds = [];

    await store.update((draft) => {
      const monitor = draft.monitorsById[monitorId];
      if (!monitor) {
        return draft;
      }

      for (const incoming of effectiveListings) {
        const existing = monitor.listingsById[incoming.id];
        if (!existing) {
          const repost = repostsById.get(incoming.id);
          const incomingFingerprint = buildSourceFingerprint(incoming);
          monitor.listingsById[incoming.id] = {
            ...incoming,
            firstSeenAt: pollStartedAt,
            lastSeenAt: pollStartedAt,
            lastChangedAt: pollStartedAt,
            lastSourceChangeAt: pollStartedAt,
            sourceFingerprint: incomingFingerprint,
            changedInLastPoll: false,
            isNew: true,
            repostOfId: repost?.repostOfId || null,
            changeType: repost ? "repost" : null,
            changeReason: repost?.reason || null,
            changeConfidence: repost ? 0.85 : null,
            changedBy: repost ? "deterministic" : null,
            riskScore: Number.isFinite(Number(incoming.riskScore)) ? Number(incoming.riskScore) : null,
            riskLevel: incoming.riskLevel || null,
            riskReasons: Array.isArray(incoming.riskReasons) ? incoming.riskReasons : [],
            riskConfidence:
              Number.isFinite(Number(incoming.riskConfidence)) ? Number(incoming.riskConfidence) : null,
            riskScoredBy: incoming.riskScoredBy || null,
          };
          monitor.listingOrder.unshift(incoming.id);
          addedIds.push(incoming.id);
          continue;
        }

        const changed = changedIds.has(incoming.id);
        const incomingFingerprint = buildSourceFingerprint(incoming);
        const previousFingerprint = existing.sourceFingerprint || buildSourceFingerprint(existing);
        const sourceChanged = previousFingerprint !== incomingFingerprint;

        monitor.listingsById[incoming.id] = {
          ...existing,
          ...incoming,
          lastSeenAt: pollStartedAt,
          lastChangedAt: changed ? pollStartedAt : existing.lastChangedAt,
          lastSourceChangeAt: sourceChanged ? pollStartedAt : existing.lastSourceChangeAt || null,
          sourceFingerprint: incomingFingerprint,
          changedInLastPoll: sourceChanged,
          changeType: existing.changeType || null,
          changeReason: existing.changeReason || null,
          changeConfidence: existing.changeConfidence || null,
          changedBy: existing.changedBy || null,
          repostOfId: existing.repostOfId || null,
          riskScore:
            Number.isFinite(Number(incoming.riskScore)) || Number.isFinite(Number(existing.riskScore))
              ? Number.isFinite(Number(incoming.riskScore))
                ? Number(incoming.riskScore)
                : Number(existing.riskScore)
              : null,
          riskLevel: incoming.riskLevel || existing.riskLevel || null,
          riskReasons: Array.isArray(incoming.riskReasons)
            ? incoming.riskReasons
            : Array.isArray(existing.riskReasons)
              ? existing.riskReasons
              : [],
          riskConfidence:
            Number.isFinite(Number(incoming.riskConfidence)) || Number.isFinite(Number(existing.riskConfidence))
              ? Number.isFinite(Number(incoming.riskConfidence))
                ? Number(incoming.riskConfidence)
                : Number(existing.riskConfidence)
              : null,
          riskScoredBy: incoming.riskScoredBy || existing.riskScoredBy || null,
        };

        if (changed) {
          updatedIds.push(incoming.id);
          const classification = classifiedChanges.byId.get(incoming.id);
          if (classification) {
            monitor.listingsById[incoming.id].changeType = classification.type || null;
            monitor.listingsById[incoming.id].changeReason = classification.reason || null;
            monitor.listingsById[incoming.id].changeConfidence = Number.isFinite(
              Number(classification.confidence)
            )
              ? Number(classification.confidence)
              : null;
            monitor.listingsById[incoming.id].changedBy = classification.source || "deterministic";
          } else {
            monitor.listingsById[incoming.id].changeType = "details_update";
            monitor.listingsById[incoming.id].changeReason = "Listing details changed.";
            monitor.listingsById[incoming.id].changeConfidence = 0.6;
            monitor.listingsById[incoming.id].changedBy = "deterministic";
          }
        }
      }

      for (const listingId of monitor.listingOrder) {
        if (!scrapeIds.has(listingId) && monitor.listingsById[listingId]) {
          monitor.listingsById[listingId].isStale = true;
          monitor.listingsById[listingId].changedInLastPoll = false;
        } else if (monitor.listingsById[listingId]) {
          monitor.listingsById[listingId].isStale = false;
        }
      }

      recalculateNewFlags(monitor, pollStartedAt);
      monitor.lastPoll = {
        at: pollStartedAt,
        status: "ok",
        message:
          addedIds.length > 0
            ? `Found ${addedIds.length} new listing(s) out of ${effectiveListings.length} visible results.`
            : `No new listings. ${effectiveListings.length} visible results scanned.`,
        addedIds,
        updatedIds,
        totalSeenThisPoll: effectiveListings.length,
        source: scrapeResult.source,
        reason,
        parserMode: claudeEnabled ? "deterministic+claude-optional" : "deterministic-only",
        claude: claudeEnrichment,
        normalization,
        riskAssessment,
        changeClassification: {
          used: classifiedChanges.used,
          available: classifiedChanges.available,
          message: classifiedChanges.message,
          apiKeySource: classifiedChanges.apiKeySource,
        },
      };
      monitor.updatedAt = pollStartedAt;
      return draft;
    });
  } catch (error) {
    await store.update((draft) => {
      const monitor = draft.monitorsById[monitorId];
      if (!monitor) {
        return draft;
      }
      monitor.lastPoll = createLastPollErrorSnapshot(monitor.lastPoll, error.message, reason);
      monitor.lastPoll.claude = buildDefaultClaudeSnapshot();
      monitor.lastPoll.parserMode = "deterministic-only";
      monitor.lastPoll.normalization = {
        used: false,
        available: false,
        deterministicUpdated: 0,
        message: "Normalization skipped due to poll error.",
      };
      monitor.lastPoll.riskAssessment = {
        used: false,
        available: false,
        assessedCount: 0,
        message: "Risk scoring skipped due to poll error.",
      };
      monitor.lastPoll.changeClassification = {
        used: false,
        available: false,
        message: "Change classification skipped due to poll error.",
      };
      monitor.updatedAt = toIsoNow();
      return draft;
    });
  } finally {
    pollingMonitorIds.delete(monitorId);
    broadcastDashboardUpdate();
  }
}

function clearMonitorTimer(monitorId) {
  const timer = pollTimersByMonitorId.get(monitorId);
  if (timer) {
    clearInterval(timer);
    pollTimersByMonitorId.delete(monitorId);
  }
}

function scheduleMonitorTimer(monitorId) {
  clearMonitorTimer(monitorId);
  const monitor = store.getState().monitorsById[monitorId];
  if (!monitor) {
    return;
  }
  const interval = clampPollIntervalMs(monitor.pollIntervalMs);
  const timer = setInterval(() => {
    runPollCycle(monitorId, "scheduled");
  }, interval);
  pollTimersByMonitorId.set(monitorId, timer);
}

function syncMonitorTimers() {
  const state = store.getState();
  const desiredIds = new Set(state.monitorOrder);

  for (const [monitorId] of pollTimersByMonitorId.entries()) {
    if (!desiredIds.has(monitorId)) {
      clearMonitorTimer(monitorId);
    }
  }

  for (const monitorId of state.monitorOrder) {
    if (state.monitorsById[monitorId]) {
      scheduleMonitorTimer(monitorId);
    }
  }
}

async function updateMonitorConfig(monitorId, updates, reason) {
  let changedSearchUrl = false;
  let changedInterval = false;
  const updatedAt = toIsoNow();

  await store.update((draft) => {
    const monitor = draft.monitorsById[monitorId];
    if (!monitor) {
      return draft;
    }

    if (typeof updates.name === "string") {
      monitor.name = normalizeMonitorName(updates.name, monitor.name);
    }

    if (typeof updates.searchUrl === "string" && updates.searchUrl.startsWith("http")) {
      const nextSearchUrl = updates.searchUrl.trim();
      if (nextSearchUrl !== monitor.searchUrl) {
        monitor.searchUrl = nextSearchUrl;
        changedSearchUrl = true;
      }
    }

    if (Number.isFinite(Number(updates.pollIntervalMs))) {
      const nextInterval = clampPollIntervalMs(updates.pollIntervalMs);
      if (nextInterval !== monitor.pollIntervalMs) {
        monitor.pollIntervalMs = nextInterval;
        changedInterval = true;
      }
    }

    if (Number.isFinite(Number(updates.newBadgeMinutes))) {
      monitor.newBadgeMinutes = clampNewBadgeMinutes(updates.newBadgeMinutes);
      recalculateNewFlags(monitor, updatedAt);
    }

    if (updates.active === true) {
      draft.activeMonitorId = monitorId;
    }

    monitor.updatedAt = updatedAt;
    return draft;
  });

  if (changedInterval) {
    scheduleMonitorTimer(monitorId);
  }
  if (changedSearchUrl) {
    runPollCycle(monitorId, reason);
  }
}

app.get("/api/dashboard", (_req, res) => {
  res.json(buildDashboardPayload());
});

app.patch("/api/settings", async (req, res) => {
  const { claudeParsingEnabled, claude = {} } = req.body || {};
  if (typeof claudeParsingEnabled !== "boolean") {
    res.status(400).json({ error: "claudeParsingEnabled must be boolean." });
    return;
  }
  if (claude && typeof claude !== "object") {
    res.status(400).json({ error: "claude must be an object." });
    return;
  }

  const allowedReasoning = new Set(["low", "balanced", "high"]);
  if (
    claude.reasoningStrength !== undefined &&
    (typeof claude.reasoningStrength !== "string" || !allowedReasoning.has(claude.reasoningStrength))
  ) {
    res.status(400).json({ error: "reasoningStrength must be one of: low, balanced, high." });
    return;
  }

  const numericRules = [
    ["maxCandidates", 1, 30],
    ["minConfidence", 0, 1],
    ["temperature", 0, 1],
    ["maxTokens", 80, 1200],
  ];
  for (const [field, min, max] of numericRules) {
    if (claude[field] === undefined) {
      continue;
    }
    const parsed = Number(claude[field]);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      res.status(400).json({ error: `${field} must be between ${min} and ${max}.` });
      return;
    }
  }

  const integerFields = new Set(["maxCandidates", "maxTokens"]);
  for (const field of integerFields) {
    if (claude[field] === undefined) {
      continue;
    }
    if (!Number.isInteger(Number(claude[field]))) {
      res.status(400).json({ error: `${field} must be an integer.` });
      return;
    }
  }

  const updatedAt = toIsoNow();
  await store.update((draft) => {
    draft.settings = draft.settings || {};
    draft.settings.claudeParsingEnabled = claudeParsingEnabled;
    draft.settings.claude = draft.settings.claude || {};
    if (typeof claude.apiKey === "string") {
      draft.settings.claude.apiKey = claude.apiKey.trim();
    }
    if (typeof claude.model === "string") {
      draft.settings.claude.model = claude.model.trim();
    }
    if (typeof claude.reasoningStrength === "string") {
      draft.settings.claude.reasoningStrength = claude.reasoningStrength;
    }
    if (claude.maxCandidates !== undefined) {
      draft.settings.claude.maxCandidates = Number.parseInt(String(claude.maxCandidates), 10);
    }
    if (claude.minConfidence !== undefined) {
      draft.settings.claude.minConfidence = Number(claude.minConfidence);
    }
    if (claude.temperature !== undefined) {
      draft.settings.claude.temperature = Number(claude.temperature);
    }
    if (claude.maxTokens !== undefined) {
      draft.settings.claude.maxTokens = Number.parseInt(String(claude.maxTokens), 10);
    }
    draft.settings.updatedAt = updatedAt;
    return draft;
  });

  broadcastDashboardUpdate();
  res.json(buildDashboardPayload());
});

app.post("/api/monitors", async (req, res) => {
  const {
    name,
    searchUrl,
    pollIntervalMs = 60000,
    newBadgeMinutes = 120,
    activate = true,
  } = req.body || {};

  if (typeof searchUrl !== "string" || !searchUrl.startsWith("http")) {
    res.status(400).json({ error: "searchUrl must be a valid absolute URL." });
    return;
  }

  const monitorId = makeMonitorId();
  const nowIso = toIsoNow();

  await store.update((draft) => {
    const friendlyName = normalizeMonitorName(name, `Monitor ${draft.monitorOrder.length + 1}`);
    draft.monitorsById[monitorId] = {
      id: monitorId,
      name: friendlyName,
      searchUrl: searchUrl.trim(),
      pollIntervalMs: clampPollIntervalMs(pollIntervalMs),
      newBadgeMinutes: clampNewBadgeMinutes(newBadgeMinutes),
      listingsById: {},
      listingOrder: [],
      lastPoll: {
        at: null,
        status: "never",
        message: "Polling has not started yet.",
        addedIds: [],
        updatedIds: [],
        totalSeenThisPoll: 0,
        source: null,
        reason: null,
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    draft.monitorOrder.unshift(monitorId);
    if (activate || !draft.activeMonitorId) {
      draft.activeMonitorId = monitorId;
    }
    return draft;
  });

  scheduleMonitorTimer(monitorId);
  runPollCycle(monitorId, "monitor-created");
  res.status(201).json(buildDashboardPayload());
});

app.patch("/api/monitors/:monitorId", async (req, res) => {
  const { monitorId } = req.params;
  if (!ensureMonitorExists(monitorId)) {
    res.status(404).json({ error: "Monitor not found." });
    return;
  }

  await updateMonitorConfig(monitorId, req.body || {}, "monitor-updated");
  broadcastDashboardUpdate();
  res.status(202).json(buildDashboardPayload());
});

app.post("/api/monitors/:monitorId/activate", async (req, res) => {
  const { monitorId } = req.params;
  if (!ensureMonitorExists(monitorId)) {
    res.status(404).json({ error: "Monitor not found." });
    return;
  }

  await store.update((draft) => {
    draft.activeMonitorId = monitorId;
    return draft;
  });

  broadcastDashboardUpdate();
  res.json(buildDashboardPayload());
});

app.post("/api/monitors/:monitorId/poll-now", (req, res) => {
  const { monitorId } = req.params;
  if (!ensureMonitorExists(monitorId)) {
    res.status(404).json({ error: "Monitor not found." });
    return;
  }

  runPollCycle(monitorId, "manual");
  res.status(202).json({
    ok: true,
    message: "Manual poll started.",
    monitorId,
    dashboard: buildDashboardPayload(),
  });
});

app.delete("/api/monitors/:monitorId", async (req, res) => {
  const { monitorId } = req.params;
  const state = store.getState();

  if (!state.monitorsById[monitorId]) {
    res.status(404).json({ error: "Monitor not found." });
    return;
  }
  if (state.monitorOrder.length <= 1) {
    res.status(400).json({ error: "At least one monitor must remain." });
    return;
  }

  await store.update((draft) => {
    delete draft.monitorsById[monitorId];
    draft.monitorOrder = draft.monitorOrder.filter((id) => id !== monitorId);
    if (draft.activeMonitorId === monitorId) {
      draft.activeMonitorId = draft.monitorOrder[0] || null;
    }
    return draft;
  });

  pollingMonitorIds.delete(monitorId);
  clearMonitorTimer(monitorId);
  broadcastDashboardUpdate();
  res.json(buildDashboardPayload());
});

// Backward-compatible endpoints mapped to active monitor.
app.post("/api/poll-now", (req, res) => {
  const activeMonitorId = activeMonitorIdFromState(store.getState());
  if (!activeMonitorId) {
    res.status(404).json({ error: "No active monitor available." });
    return;
  }
  runPollCycle(activeMonitorId, "manual");
  res.status(202).json({
    ok: true,
    message: "Manual poll started for active monitor.",
    monitorId: activeMonitorId,
    dashboard: buildDashboardPayload(),
  });
});

app.post("/api/filters", async (req, res) => {
  const activeMonitorId = activeMonitorIdFromState(store.getState());
  if (!activeMonitorId) {
    res.status(404).json({ error: "No active monitor available." });
    return;
  }

  const { searchUrl, pollIntervalMs, newBadgeMinutes } = req.body || {};
  await updateMonitorConfig(
    activeMonitorId,
    { searchUrl, pollIntervalMs, newBadgeMinutes },
    "active-monitor-updated"
  );
  res.status(202).json(buildDashboardPayload());
});

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write("retry: 3000\n\n");
  sseClients.add(res);
  res.write(`event: dashboard-update\ndata: ${JSON.stringify(buildDashboardPayload())}\n\n`);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

async function start() {
  await store.init();
  syncMonitorTimers();

  for (const monitorId of store.getState().monitorOrder) {
    runPollCycle(monitorId, "startup");
  }

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Autoplius dashboard running at http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", error);
  process.exit(1);
});
