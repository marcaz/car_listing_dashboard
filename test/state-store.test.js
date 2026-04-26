const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  DEFAULT_MONITOR_ID,
  DEFAULT_SEARCH_URL,
  StateStore,
} = require("../src/state-store");

async function createTempStateFile(t, contents) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "car-dashboard-state-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "state.json");
  if (contents !== undefined) {
    await fs.writeFile(filePath, contents, "utf8");
  }
  return filePath;
}

test("StateStore recovers empty state files with defaults", async (t) => {
  const filePath = await createTempStateFile(t, "");
  const store = new StateStore(filePath);

  await store.init();

  const state = store.getState();
  assert.equal(state.activeMonitorId, DEFAULT_MONITOR_ID);
  assert.equal(state.monitorsById[DEFAULT_MONITOR_ID].searchUrl, DEFAULT_SEARCH_URL);

  const persisted = JSON.parse(await fs.readFile(filePath, "utf8"));
  assert.equal(persisted.activeMonitorId, DEFAULT_MONITOR_ID);
});

test("StateStore migrates legacy state and normalizes monitor/settings fields", async (t) => {
  const filePath = await createTempStateFile(
    t,
    JSON.stringify({
      filters: {
        searchUrl: "https://example.com/autoplius-search",
        pollIntervalMs: 1000,
        newBadgeMinutes: -5,
      },
      listingsById: {
        listing1: {
          id: "listing1",
          firstSeenAt: "2026-04-26T12:00:00.000Z",
          lastChangedAt: "2026-04-26T13:00:00.000Z",
        },
        junk: null,
      },
      listingOrder: ["listing1", 42],
      lastPoll: {
        addedIds: "bad",
        updatedIds: ["listing1"],
      },
      settings: {
        claudeParsingEnabled: true,
        claude: {
          apiKey: "  saved-key  ",
          reasoningStrength: "extreme",
          maxCandidates: 99,
          minConfidence: 2,
          temperature: -1,
          maxTokens: 5,
        },
      },
    })
  );
  const store = new StateStore(filePath);

  await store.init();

  const state = store.getState();
  const monitor = state.monitorsById[DEFAULT_MONITOR_ID];
  assert.equal(state.activeMonitorId, DEFAULT_MONITOR_ID);
  assert.deepEqual(state.monitorOrder, [DEFAULT_MONITOR_ID]);
  assert.equal(monitor.searchUrl, "https://example.com/autoplius-search");
  assert.equal(monitor.pollIntervalMs, 15000);
  assert.equal(monitor.newBadgeMinutes, 1);
  assert.deepEqual(monitor.listingOrder, ["listing1"]);
  assert.equal(monitor.listingsById.junk, undefined);
  assert.equal(monitor.listingsById.listing1.sourceFingerprint, "");
  assert.equal(monitor.listingsById.listing1.changedInLastPoll, false);
  assert.equal(monitor.listingsById.listing1.lastSourceChangeAt, "2026-04-26T13:00:00.000Z");
  assert.deepEqual(monitor.lastPoll.addedIds, []);
  assert.deepEqual(monitor.lastPoll.updatedIds, ["listing1"]);
  assert.equal(state.settings.claudeParsingEnabled, true);
  assert.equal(state.settings.claude.apiKey, "saved-key");
  assert.equal(state.settings.claude.reasoningStrength, "balanced");
  assert.equal(state.settings.claude.maxCandidates, 30);
  assert.equal(state.settings.claude.minConfidence, 1);
  assert.equal(state.settings.claude.temperature, 0);
  assert.equal(state.settings.claude.maxTokens, 80);
});

test("StateStore update persists and re-normalizes drafts", async (t) => {
  const filePath = await createTempStateFile(t);
  const store = new StateStore(filePath);
  await store.init();

  await store.update((draft) => {
    const monitor = draft.monitorsById[DEFAULT_MONITOR_ID];
    monitor.pollIntervalMs = 10;
    draft.settings.claude.maxTokens = 5000;
    return draft;
  });

  const state = store.getState();
  assert.equal(state.monitorsById[DEFAULT_MONITOR_ID].pollIntervalMs, 15000);
  assert.equal(state.settings.claude.maxTokens, 1200);

  const persisted = JSON.parse(await fs.readFile(filePath, "utf8"));
  assert.equal(persisted.monitorsById[DEFAULT_MONITOR_ID].pollIntervalMs, 15000);
  assert.equal(persisted.settings.claude.maxTokens, 1200);
});
