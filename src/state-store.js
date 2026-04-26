const fs = require("fs/promises");
const path = require("path");

const DEFAULT_SEARCH_URL =
  "https://autoplius.lt/skelbimai/naudoti-automobiliai/bmw/x3-m?year_min=2020&year_max=2022";
const DEFAULT_MONITOR_ID = "monitor-default-bmw-x3m";

const DEFAULT_LAST_POLL = {
  at: null,
  status: "never",
  message: "Polling has not started yet.",
  addedIds: [],
  updatedIds: [],
  totalSeenThisPoll: 0,
  source: null,
  reason: null,
};

const DEFAULT_MONITOR_TEMPLATE = {
  id: DEFAULT_MONITOR_ID,
  name: "BMW X3 M (2020-2022)",
  searchUrl: DEFAULT_SEARCH_URL,
  pollIntervalMs: 60000,
  newBadgeMinutes: 120,
  listingsById: {},
  listingOrder: [],
  lastPoll: DEFAULT_LAST_POLL,
  createdAt: null,
  updatedAt: null,
};

const DEFAULT_CLAUDE_SETTINGS = {
  apiKey: "",
  model: "claude-3-5-haiku-latest",
  reasoningStrength: "balanced",
  maxCandidates: 10,
  minConfidence: 0.55,
  temperature: 0,
  maxTokens: 220,
};

const DEFAULT_SETTINGS = {
  claudeParsingEnabled: false,
  claude: { ...DEFAULT_CLAUDE_SETTINGS },
  updatedAt: null,
};

const DEFAULT_STATE = {
  activeMonitorId: DEFAULT_MONITOR_ID,
  settings: { ...DEFAULT_SETTINGS },
  monitorOrder: [DEFAULT_MONITOR_ID],
  monitorsById: {
    [DEFAULT_MONITOR_ID]: {
      ...DEFAULT_MONITOR_TEMPLATE,
    },
  },
};

function toIsoNow() {
  return new Date().toISOString();
}

function normalizeLastPoll(rawLastPoll) {
  return {
    ...structuredClone(DEFAULT_LAST_POLL),
    ...(rawLastPoll || {}),
    addedIds: Array.isArray(rawLastPoll?.addedIds) ? rawLastPoll.addedIds : [],
    updatedIds: Array.isArray(rawLastPoll?.updatedIds) ? rawLastPoll.updatedIds : [],
  };
}

function normalizeMonitor(monitorId, rawMonitor) {
  const merged = {
    ...structuredClone(DEFAULT_MONITOR_TEMPLATE),
    ...(rawMonitor || {}),
    id: monitorId,
    lastPoll: normalizeLastPoll(rawMonitor?.lastPoll),
  };

  if (!merged.createdAt) {
    merged.createdAt = toIsoNow();
  }
  if (!merged.updatedAt) {
    merged.updatedAt = merged.createdAt;
  }

  if (!merged.name || typeof merged.name !== "string") {
    merged.name = `Monitor ${monitorId}`;
  } else {
    merged.name = merged.name.trim() || `Monitor ${monitorId}`;
  }

  if (typeof merged.searchUrl !== "string" || !merged.searchUrl.startsWith("http")) {
    merged.searchUrl = DEFAULT_SEARCH_URL;
  } else {
    merged.searchUrl = merged.searchUrl.trim();
  }

  merged.pollIntervalMs = Math.max(Number(merged.pollIntervalMs) || 60000, 15000);
  merged.newBadgeMinutes = Math.max(Number(merged.newBadgeMinutes) || 120, 1);

  if (!merged.listingsById || typeof merged.listingsById !== "object") {
    merged.listingsById = {};
  }
  for (const [listingId, listing] of Object.entries(merged.listingsById)) {
    if (!listing || typeof listing !== "object") {
      delete merged.listingsById[listingId];
      continue;
    }
    if (typeof listing.sourceFingerprint !== "string" || !listing.sourceFingerprint) {
      listing.sourceFingerprint = "";
    }
    if (typeof listing.changedInLastPoll !== "boolean") {
      listing.changedInLastPoll = false;
    }
    if (typeof listing.lastSourceChangeAt !== "string" || !listing.lastSourceChangeAt) {
      listing.lastSourceChangeAt = listing.lastChangedAt || listing.firstSeenAt || null;
    }
  }

  if (!Array.isArray(merged.listingOrder)) {
    merged.listingOrder = [];
  } else {
    merged.listingOrder = merged.listingOrder.filter((id) => typeof id === "string");
  }

  return merged;
}

function normalizeSettings(rawSettings) {
  const merged = {
    ...structuredClone(DEFAULT_SETTINGS),
    ...(rawSettings || {}),
  };
  merged.claudeParsingEnabled = Boolean(merged.claudeParsingEnabled);
  merged.claude = normalizeClaudeSettings(rawSettings?.claude);
  return merged;
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

function normalizeClaudeSettings(rawClaudeSettings) {
  const merged = {
    ...structuredClone(DEFAULT_CLAUDE_SETTINGS),
    ...(rawClaudeSettings || {}),
  };

  merged.apiKey = typeof merged.apiKey === "string" ? merged.apiKey.trim() : "";
  merged.model =
    typeof merged.model === "string" && merged.model.trim()
      ? merged.model.trim()
      : DEFAULT_CLAUDE_SETTINGS.model;

  const allowedReasoningStrength = new Set(["low", "balanced", "high"]);
  merged.reasoningStrength = allowedReasoningStrength.has(merged.reasoningStrength)
    ? merged.reasoningStrength
    : DEFAULT_CLAUDE_SETTINGS.reasoningStrength;

  merged.maxCandidates = clampInteger(
    merged.maxCandidates,
    1,
    30,
    DEFAULT_CLAUDE_SETTINGS.maxCandidates
  );
  merged.minConfidence = clampNumber(
    merged.minConfidence,
    0,
    1,
    DEFAULT_CLAUDE_SETTINGS.minConfidence
  );
  merged.temperature = clampNumber(
    merged.temperature,
    0,
    1,
    DEFAULT_CLAUDE_SETTINGS.temperature
  );
  merged.maxTokens = clampInteger(merged.maxTokens, 80, 1200, DEFAULT_CLAUDE_SETTINGS.maxTokens);

  return merged;
}

function normalizeNewFormat(rawState) {
  const monitorsById = {};
  const seenIds = new Set();
  const rawMonitorsById = rawState?.monitorsById || {};
  const rawMonitorOrder = Array.isArray(rawState?.monitorOrder) ? rawState.monitorOrder : [];

  for (const monitorId of rawMonitorOrder) {
    if (typeof monitorId !== "string" || seenIds.has(monitorId)) {
      continue;
    }
    if (!rawMonitorsById[monitorId]) {
      continue;
    }
    monitorsById[monitorId] = normalizeMonitor(monitorId, rawMonitorsById[monitorId]);
    seenIds.add(monitorId);
  }

  for (const monitorId of Object.keys(rawMonitorsById)) {
    if (seenIds.has(monitorId)) {
      continue;
    }
    monitorsById[monitorId] = normalizeMonitor(monitorId, rawMonitorsById[monitorId]);
    seenIds.add(monitorId);
  }

  let monitorOrder = Object.keys(monitorsById);
  if (monitorOrder.length === 0) {
    monitorsById[DEFAULT_MONITOR_ID] = normalizeMonitor(DEFAULT_MONITOR_ID, DEFAULT_MONITOR_TEMPLATE);
    monitorOrder = [DEFAULT_MONITOR_ID];
  }

  const requestedActiveMonitorId = rawState?.activeMonitorId;
  const activeMonitorId = monitorsById[requestedActiveMonitorId]
    ? requestedActiveMonitorId
    : monitorOrder[0];

  return {
    activeMonitorId,
    settings: normalizeSettings(rawState?.settings),
    monitorOrder,
    monitorsById,
  };
}

function normalizeLegacyFormat(rawState) {
  const legacyFilters = rawState?.filters || {};
  const legacyMonitor = normalizeMonitor(DEFAULT_MONITOR_ID, {
    id: DEFAULT_MONITOR_ID,
    name: "BMW X3 M (2020-2022)",
    searchUrl: legacyFilters.searchUrl || DEFAULT_SEARCH_URL,
    pollIntervalMs: legacyFilters.pollIntervalMs,
    newBadgeMinutes: legacyFilters.newBadgeMinutes,
    listingsById: rawState?.listingsById || {},
    listingOrder: rawState?.listingOrder || [],
    lastPoll: rawState?.lastPoll || {},
  });

  return {
    activeMonitorId: DEFAULT_MONITOR_ID,
    settings: normalizeSettings(rawState?.settings),
    monitorOrder: [DEFAULT_MONITOR_ID],
    monitorsById: {
      [DEFAULT_MONITOR_ID]: legacyMonitor,
    },
  };
}

class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = null;
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const trimmed = raw.trim();
      if (!trimmed) {
        throw new SyntaxError("State file is empty");
      }
      this.state = this.normalizeState(JSON.parse(trimmed));
    } catch (error) {
      const recoverableParseError =
        error instanceof SyntaxError ||
        error.code === "ENOENT" ||
        error.code === "ERR_INVALID_ARG_TYPE";
      if (!recoverableParseError) {
        throw error;
      }

      this.state = structuredClone(DEFAULT_STATE);
      await this.save();
    }
  }

  getState() {
    if (!this.state) {
      throw new Error("StateStore is not initialized. Call init() first.");
    }
    return this.state;
  }

  async update(updater) {
    const nextState = updater(structuredClone(this.getState()));
    this.state = this.normalizeState(nextState);
    await this.save();
    return this.state;
  }

  async save() {
    await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  normalizeState(rawState) {
    if (
      rawState &&
      typeof rawState === "object" &&
      rawState.monitorsById &&
      typeof rawState.monitorsById === "object"
    ) {
      return normalizeNewFormat(rawState);
    }

    if (rawState && typeof rawState === "object" && (rawState.filters || rawState.listingsById)) {
      return normalizeLegacyFormat(rawState);
    }

    return normalizeNewFormat(DEFAULT_STATE);
  }
}

module.exports = {
  StateStore,
  DEFAULT_STATE,
  DEFAULT_MONITOR_ID,
  DEFAULT_SEARCH_URL,
};
