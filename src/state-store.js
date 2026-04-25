const fs = require("fs/promises");
const path = require("path");

const DEFAULT_STATE = {
  filters: {
    searchUrl:
      "https://autoplius.lt/skelbimai/naudoti-automobiliai/bmw/x3-m?year_min=2020&year_max=2022",
    pollIntervalMs: 60000,
    newBadgeMinutes: 120,
  },
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
  },
};

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
    const merged = {
      ...structuredClone(DEFAULT_STATE),
      ...(rawState || {}),
      filters: {
        ...structuredClone(DEFAULT_STATE.filters),
        ...((rawState && rawState.filters) || {}),
      },
      lastPoll: {
        ...structuredClone(DEFAULT_STATE.lastPoll),
        ...((rawState && rawState.lastPoll) || {}),
      },
    };

    if (!merged.listingsById || typeof merged.listingsById !== "object") {
      merged.listingsById = {};
    }

    if (!Array.isArray(merged.listingOrder)) {
      merged.listingOrder = [];
    }

    return merged;
  }
}

module.exports = {
  StateStore,
  DEFAULT_STATE,
};
