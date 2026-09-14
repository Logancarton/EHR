import type { TeamPresence } from "../../domain/team-collaboration";

export interface UserPresenceRecord {
  userId: string;
  presence: TeamPresence;
  lastActiveAt: string;
  explicitStatus?: TeamPresence;
  currentLocation?: string;
}

interface InternalPresenceEntry {
  userId: string;
  lastActiveTimestamp: number;
  explicitStatus?: TeamPresence;
  currentLocation?: string;
}

const presenceStore = new Map<string, InternalPresenceEntry>();

const ONLINE_THRESHOLD_MS = 30_000; // < 30s is online
const AWAY_THRESHOLD_MS = 90_000;   // 30s–90s is away, >90s is offline

export const PresenceTracker = {
  recordHeartbeat(
    userId: string,
    location?: string,
    explicitStatus?: TeamPresence,
  ): UserPresenceRecord {
    const now = Date.now();
    const entry: InternalPresenceEntry = {
      userId,
      lastActiveTimestamp: now,
      explicitStatus: explicitStatus || undefined,
      currentLocation: location,
    };
    presenceStore.set(userId, entry);
    return this.getUserPresence(userId);
  },

  setExplicitStatus(userId: string, status: TeamPresence): UserPresenceRecord {
    const existing = presenceStore.get(userId);
    const now = Date.now();
    const entry: InternalPresenceEntry = {
      userId,
      lastActiveTimestamp: existing ? existing.lastActiveTimestamp : now,
      explicitStatus: status,
      currentLocation: existing?.currentLocation,
    };
    presenceStore.set(userId, entry);
    return this.getUserPresence(userId);
  },

  getUserPresence(userId: string): UserPresenceRecord {
    const entry = presenceStore.get(userId);
    if (!entry) {
      return {
        userId,
        presence: "offline",
        lastActiveAt: new Date(0).toISOString(),
      };
    }

    if (entry.explicitStatus === "offline") {
      return {
        userId,
        presence: "offline",
        lastActiveAt: new Date(entry.lastActiveTimestamp).toISOString(),
        explicitStatus: "offline",
        currentLocation: entry.currentLocation,
      };
    }

    const elapsed = Date.now() - entry.lastActiveTimestamp;
    let computedPresence: TeamPresence = "offline";
    if (elapsed < ONLINE_THRESHOLD_MS) {
      computedPresence = entry.explicitStatus === "away" ? "away" : "online";
    } else if (elapsed < AWAY_THRESHOLD_MS) {
      computedPresence = "away";
    } else {
      computedPresence = "offline";
    }

    return {
      userId,
      presence: computedPresence,
      lastActiveAt: new Date(entry.lastActiveTimestamp).toISOString(),
      explicitStatus: entry.explicitStatus,
      currentLocation: entry.currentLocation,
    };
  },

  listPresence(): UserPresenceRecord[] {
    const results: UserPresenceRecord[] = [];
    for (const userId of presenceStore.keys()) {
      results.push(this.getUserPresence(userId));
    }
    return results;
  },

  /** Clear for testing purposes */
  _resetForTesting(): void {
    presenceStore.clear();
  },

  /** Inject custom timestamp for testing expiry */
  _setTimestampForTesting(userId: string, timestamp: number, explicitStatus?: TeamPresence): void {
    presenceStore.set(userId, {
      userId,
      lastActiveTimestamp: timestamp,
      explicitStatus,
    });
  },
};
