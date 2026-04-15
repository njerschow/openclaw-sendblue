/**
 * Process-global plugin state.
 *
 * OpenClaw may re-import extension code during plugin discovery/reconcile.
 * Module-local `let` guards reset on every re-import, so we persist lifecycle
 * flags on `globalThis` to keep registration/start idempotent across reloads.
 */

type SendbluePluginState = {
  registered: boolean;
  serviceRunning: boolean;
};

const GLOBAL_KEY = '__openclaw_sendblue_plugin_state__';

function getGlobalObject(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

const g = getGlobalObject();

if (!g[GLOBAL_KEY]) {
  g[GLOBAL_KEY] = {
    registered: false,
    serviceRunning: false,
  } satisfies SendbluePluginState;
}

export const pluginState = g[GLOBAL_KEY] as SendbluePluginState;
