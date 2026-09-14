import type { ClinicalPermission } from "../server/auth/provider-context";
import {
  DASHBOARD_MODULES,
  type DashboardModuleDefinition,
  type DashboardModuleId,
  type DashboardModuleSpan,
  filterModulesByCapabilities,
  getDashboardModule,
  isKnownDashboardModuleId,
} from "../domain/dashboard-modules";

/**
 * Presentation State & Layout Model for Dashboard Shell (roadmap §21, DB-3).
 *
 * Rules:
 * - Presentation state stores only module IDs, config, and geometry — never copied patient facts.
 * - Bounded data contracts: unknown module IDs and arbitrary component names are rejected.
 * - Permanent modules (Today's Schedule) cannot be hidden or removed.
 * - Permission-filtered: modules requiring unavailable capabilities are omitted.
 */

export type DashboardModuleState = {
  id: DashboardModuleId;
  visible: boolean;
  collapsed: boolean;
  span: DashboardModuleSpan;
  settings?: Record<string, unknown>;
};

export type DashboardLayoutState = {
  version: 1;
  columns?: number;
  modules: DashboardModuleState[];
};

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutState = {
  version: 1,
  columns: 2,
  modules: [
    { id: "briefing", visible: true, collapsed: false, span: "full" },
    { id: "metrics", visible: true, collapsed: false, span: "full" },
    { id: "schedule", visible: true, collapsed: false, span: "full" },
    { id: "queue", visible: true, collapsed: false, span: "half" },
    { id: "team", visible: true, collapsed: false, span: "half" },
    { id: "shortcuts", visible: true, collapsed: false, span: "half" },
  ],
};

export function createDefaultDashboardLayout(): DashboardLayoutState {
  return {
    version: 1,
    columns: 2,
    modules: DEFAULT_DASHBOARD_LAYOUT.modules.map((m) => ({ ...m })),
  };
}

/**
 * Sanitizes an incoming raw layout state.
 * - Drops unknown module IDs and planned modules.
 * - Drops modules the actor lacks capabilities for.
 * - Enforces permanent module (`schedule`) existence and visibility.
 * - Sanitizes spans against module definitions.
 * - Runs settings through module schema sanitizers.
 */
export function sanitizeDashboardLayout(
  raw: unknown,
  userCapabilities?: readonly ClinicalPermission[],
): DashboardLayoutState {
  const allowedDefinitions = filterModulesByCapabilities(
    DASHBOARD_MODULES,
    userCapabilities,
  );
  const allowedMap = new Map(allowedDefinitions.map((def) => [def.id, def]));

  let rawModules: unknown[] = [];
  if (raw && typeof raw === "object" && "modules" in raw && Array.isArray((raw as { modules: unknown }).modules)) {
    rawModules = (raw as { modules: unknown[] }).modules;
  }

  const seenIds = new Set<DashboardModuleId>();
  const sanitizedModules: DashboardModuleState[] = [];

  for (const item of rawModules) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = r.id;

    if (typeof id !== "string" || !isKnownDashboardModuleId(id) || !allowedMap.has(id)) {
      continue;
    }
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const definition = allowedMap.get(id)!;
    const isPermanent = Boolean(definition.permanent);

    const visible = isPermanent ? true : typeof r.visible === "boolean" ? r.visible : true;
    const collapsed = typeof r.collapsed === "boolean" ? r.collapsed : false;

    let span: DashboardModuleSpan = definition.defaultSpan;
    if (r.span === "half" || r.span === "full") {
      if (definition.allowedSpans.includes(r.span)) {
        span = r.span;
      }
    }

    const cleanState: DashboardModuleState = {
      id,
      visible,
      collapsed,
      span,
    };

    if (definition.settingsSchema && r.settings && typeof r.settings === "object") {
      cleanState.settings = definition.settingsSchema.sanitize(r.settings);
    }

    sanitizedModules.push(cleanState);
  }

  // Ensure permanent module exists if permitted
  if (allowedMap.has("schedule") && !seenIds.has("schedule")) {
    sanitizedModules.push({
      id: "schedule",
      visible: true,
      collapsed: false,
      span: "full",
    });
    seenIds.add("schedule");
  }

  // If layout was completely empty or reset, load defaults for permitted modules
  if (sanitizedModules.length === 0) {
    for (const defaultMod of DEFAULT_DASHBOARD_LAYOUT.modules) {
      if (allowedMap.has(defaultMod.id)) {
        sanitizedModules.push({ ...defaultMod });
      }
    }
  }

  const cols =
    raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).columns === "number"
      ? (raw as Record<string, unknown>).columns as number
      : 2;

  return {
    version: 1,
    columns: cols,
    modules: sanitizedModules,
  };
}

export function moveDashboardModule(
  layout: DashboardLayoutState,
  idOrIndex: DashboardModuleId | number,
  direction: "up" | "down",
): DashboardLayoutState {
  const list = [...layout.modules];
  const index =
    typeof idOrIndex === "number"
      ? idOrIndex
      : list.findIndex((m) => m.id === idOrIndex);
  if (index === -1 || index < 0 || index >= list.length) return layout;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= list.length) return layout;

  const temp = list[index];
  list[index] = list[targetIndex];
  list[targetIndex] = temp;

  return { ...layout, modules: list };
}

export function cycleDashboardModuleSpan(
  layout: DashboardLayoutState,
  id: DashboardModuleId,
): DashboardLayoutState {
  const def = getDashboardModule(id);
  if (!def || def.allowedSpans.length <= 1) return layout;

  return {
    ...layout,
    modules: layout.modules.map((m) => {
      if (m.id !== id) return m;
      const nextSpan: DashboardModuleSpan = m.span === "half" ? "full" : "half";
      return def.allowedSpans.includes(nextSpan) ? { ...m, span: nextSpan } : m;
    }),
  };
}

export function setDashboardModuleVisible(
  layout: DashboardLayoutState,
  id: DashboardModuleId,
  visible: boolean,
): DashboardLayoutState {
  const def = getDashboardModule(id);
  if (def?.permanent && !visible) {
    // Permanent modules cannot be hidden
    return layout;
  }

  const exists = layout.modules.some((m) => m.id === id);
  if (!exists && visible && def) {
    // Adding module to layout
    return {
      ...layout,
      modules: [
        ...layout.modules,
        {
          id,
          visible: true,
          collapsed: false,
          span: def.defaultSpan,
        },
      ],
    };
  }

  return {
    ...layout,
    modules: layout.modules.map((m) => (m.id === id ? { ...m, visible } : m)),
  };
}

export function toggleDashboardModuleCollapse(
  layout: DashboardLayoutState,
  id: DashboardModuleId,
): DashboardLayoutState {
  return {
    ...layout,
    modules: layout.modules.map((m) =>
      m.id === id ? { ...m, collapsed: !m.collapsed } : m,
    ),
  };
}

export function updateDashboardModuleSettings(
  layout: DashboardLayoutState,
  id: DashboardModuleId,
  settings: Record<string, unknown>,
): DashboardLayoutState {
  const def = getDashboardModule(id);
  const sanitized = def?.settingsSchema ? def.settingsSchema.sanitize(settings) : settings;

  return {
    ...layout,
    modules: layout.modules.map((m) =>
      m.id === id ? { ...m, settings: sanitized } : m,
    ),
  };
}

/**
 * Returns modules permitted to the user that are currently hidden or not added.
 */
export function addableDashboardModules(
  layout: DashboardLayoutState,
  userCapabilities?: readonly ClinicalPermission[],
): DashboardModuleDefinition[] {
  const allowed = filterModulesByCapabilities(DASHBOARD_MODULES, userCapabilities);
  const visibleIds = new Set(
    layout.modules.filter((m) => m.visible).map((m) => m.id),
  );

  return allowed.filter((def) => !visibleIds.has(def.id) && !def.permanent);
}

/**
 * Returns modules currently in layout whose visible flag is true.
 */
export function visibleDashboardModules(
  layout: DashboardLayoutState,
  userCapabilities?: readonly ClinicalPermission[],
): DashboardModuleDefinition[] {
  const allowed = filterModulesByCapabilities(DASHBOARD_MODULES, userCapabilities);
  const allowedMap = new Map(allowed.map((d) => [d.id, d]));

  return layout.modules
    .filter((m) => m.visible && allowedMap.has(m.id))
    .map((m) => allowedMap.get(m.id)!);
}

/**
 * Returns modules currently in layout whose visible flag is false.
 */
export function hiddenDashboardModules(
  layout: DashboardLayoutState,
  userCapabilities?: readonly ClinicalPermission[],
): DashboardModuleDefinition[] {
  const allowed = filterModulesByCapabilities(DASHBOARD_MODULES, userCapabilities);
  const allowedMap = new Map(allowed.map((d) => [d.id, d]));

  return layout.modules
    .filter((m) => !m.visible && allowedMap.has(m.id))
    .map((m) => allowedMap.get(m.id)!);
}

