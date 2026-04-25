const path = require("path");
const express = require("express");
const { StateStore } = require("./state-store");
const { scrapeAutoplius } = require("./scraper");

const PORT = Number.parseInt(process.env.PORT || "3100", 10);
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "..", "data", "state.json");
const MIN_POLL_INTERVAL_MS = 15000;

const app = express();
const store = new StateStore(STATE_FILE);
const sseClients = new Set();

let pollTimer = null;
let pollInProgress = false;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function toIsoNow() {
  return new Date().toISOString();
}

function buildDashboardPayload() {
  const state = store.getState();
  const listings = state.listingOrder
    .map((id) => state.listingsById[id])
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt));

  return {
    filters: state.filters,
    lastPoll: state.lastPoll,
    listings,
    generatedAt: toIsoNow(),
  };
}

function broadcastUpdate(type, payload) {
  const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const response of sseClients) {
    response.write(message);
  }
}

async function runPollCycle(reason) {
  if (pollInProgress) {
    return;
  }
  pollInProgress = true;

  const pollStartedAt = toIsoNow();

  try {
    const stateBefore = store.getState();
    const scrapeResult = await scrapeAutoplius(stateBefore.filters.searchUrl);
    const scrapeIds = new Set(scrapeResult.listings.map((item) => item.id));

    const addedIds = [];
    const updatedIds = [];

    await store.update((draft) => {
      for (const incoming of scrapeResult.listings) {
        const existing = draft.listingsById[incoming.id];
        if (!existing) {
          draft.listingsById[incoming.id] = {
            ...incoming,
            firstSeenAt: pollStartedAt,
            lastSeenAt: pollStartedAt,
            lastChangedAt: pollStartedAt,
            isNew: true,
          };
          draft.listingOrder.unshift(incoming.id);
          addedIds.push(incoming.id);
          continue;
        }

        const changed =
          existing.title !== incoming.title ||
          existing.price !== incoming.price ||
          existing.updatedText !== incoming.updatedText ||
          existing.imageUrl !== incoming.imageUrl ||
          existing.url !== incoming.url;

        draft.listingsById[incoming.id] = {
          ...existing,
          ...incoming,
          lastSeenAt: pollStartedAt,
          lastChangedAt: changed ? pollStartedAt : existing.lastChangedAt,
        };

        if (changed) {
          updatedIds.push(incoming.id);
        }
      }

      // Mark entries no longer found in current scan as stale, but keep in history.
      for (const listingId of draft.listingOrder) {
        if (!scrapeIds.has(listingId) && draft.listingsById[listingId]) {
          draft.listingsById[listingId].isStale = true;
        } else if (draft.listingsById[listingId]) {
          draft.listingsById[listingId].isStale = false;
        }
      }

      const freshThresholdMs = draft.filters.newBadgeMinutes * 60 * 1000;
      const nowMs = Date.parse(pollStartedAt);
      for (const listing of Object.values(draft.listingsById)) {
        const seenMs = Date.parse(listing.firstSeenAt);
        listing.isNew = Number.isFinite(seenMs) && nowMs - seenMs <= freshThresholdMs;
      }

      draft.lastPoll = {
        at: pollStartedAt,
        status: "ok",
        message:
          addedIds.length > 0
            ? `Found ${addedIds.length} new listing(s) out of ${scrapeResult.listings.length} visible results.`
            : `No new listings. ${scrapeResult.listings.length} visible results scanned.`,
        addedIds,
        updatedIds,
        totalSeenThisPoll: scrapeResult.listings.length,
        source: scrapeResult.source,
        reason,
      };

      return draft;
    });

    broadcastUpdate("dashboard-update", buildDashboardPayload());
  } catch (error) {
    await store.update((draft) => {
      draft.lastPoll = {
        ...draft.lastPoll,
        at: pollStartedAt,
        status: "error",
        message: error.message,
        reason,
      };
      return draft;
    });
    broadcastUpdate("dashboard-update", buildDashboardPayload());
  } finally {
    pollInProgress = false;
  }
}

function resetPollingTimer() {
  if (pollTimer) {
    clearInterval(pollTimer);
  }

  const state = store.getState();
  const interval = Math.max(
    Number.parseInt(state.filters.pollIntervalMs, 10) || MIN_POLL_INTERVAL_MS,
    MIN_POLL_INTERVAL_MS
  );
  pollTimer = setInterval(() => {
    runPollCycle("scheduled");
  }, interval);
}

app.get("/api/dashboard", (_req, res) => {
  res.json(buildDashboardPayload());
});

app.post("/api/poll-now", async (_req, res) => {
  runPollCycle("manual");
  res.status(202).json({
    ok: true,
    message: "Manual poll started.",
    inProgress: pollInProgress,
    lastPoll: store.getState().lastPoll,
  });
});

app.post("/api/filters", async (req, res) => {
  const { searchUrl, pollIntervalMs, newBadgeMinutes } = req.body || {};

  await store.update((draft) => {
    if (typeof searchUrl === "string" && searchUrl.startsWith("http")) {
      draft.filters.searchUrl = searchUrl.trim();
    }
    if (Number.isFinite(Number(pollIntervalMs))) {
      draft.filters.pollIntervalMs = Math.max(Number(pollIntervalMs), MIN_POLL_INTERVAL_MS);
    }
    if (Number.isFinite(Number(newBadgeMinutes))) {
      draft.filters.newBadgeMinutes = Math.max(Number(newBadgeMinutes), 1);
    }
    return draft;
  });

  resetPollingTimer();
  runPollCycle("filters-updated");
  res.status(202).json({
    ok: true,
    message: "Filters saved. Poll started in background.",
    inProgress: pollInProgress,
    filters: store.getState().filters,
    lastPoll: store.getState().lastPoll,
  });
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
  resetPollingTimer();
  await runPollCycle("startup");
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
