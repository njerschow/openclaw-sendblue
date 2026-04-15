/**
 * Openclaw Sendblue Plugin
 *
 * Registers a Sendblue messaging channel for iMessage/SMS support.
 */

import { createSendblueChannel, startSendblueService, stopSendblueService } from './channel.js';
import { pluginState } from './state.js';

/**
 * Resolve Sendblue config from the full OpenClaw config.
 * Single source of truth — used by both service.start and gateway.startAccount.
 */
function resolveSendblueConfig(cfg: any): any {
  return cfg?.plugins?.entries?.sendblue?.config
    ?? cfg?.channels?.sendblue
    ?? null;
}

/**
 * Plugin entry point
 * Called by openclaw to register the plugin
 */
export default function register(api: any) {
  const log = api.logger || console;

  if (pluginState.registered) {
    log.info('[Sendblue Plugin] Already registered — skipping duplicate register() call');
    return;
  }

  log.info('[Sendblue Plugin] Registering channel...');

  const channel = createSendblueChannel(api);
  api.registerChannel({ plugin: channel });

  log.info('[Sendblue Plugin] Channel registered');

  // Register service to handle polling lifecycle.
  // start/stop receive OpenClawPluginServiceContext with fresh config.
  api.registerService({
    id: 'sendblue-poller',
    start: (ctx: any) => {
      log.info('[Sendblue Plugin] Service starting...');
      const config = resolveSendblueConfig(ctx?.config) ?? api.pluginConfig;
      if (config) {
        startSendblueService(api, config);
      } else {
        log.warn('[Sendblue Plugin] No config found, service not started');
      }
    },
    stop: async () => {
      log.info('[Sendblue Plugin] Service stopping...');
      await stopSendblueService();
      // Reset registration so a subsequent register() call (plugin reload) works
      pluginState.registered = false;
    },
  });

  pluginState.registered = true;
  log.info('[Sendblue Plugin] Service registered');
}
