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

const DEFAULT_STATE = {
  activeMonitorId: DEFAULT_MONITOR_ID,
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

  if (!Array.isArray(merged.listingOrder)) {
    merged.listingOrder = [];
  } else {
    merged.listingOrder = merged.listingOrder.filter((id) => typeof id === "string");
  }

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
      this.state = this.normalizeState(JSON.parse(raw));
    } catch (error) {
      if (error.code !== "ENOENT") {
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
