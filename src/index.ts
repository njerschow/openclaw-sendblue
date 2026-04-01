/**
 * Openclaw Sendblue Plugin
 *
 * Registers a Sendblue messaging channel for iMessage/SMS support.
 */

import { createSendblueChannel, startSendblueService, stopSendblueService } from './channel.js';

// Idempotency guard — OpenClaw's plugin reconciler may call register() multiple
// times during idle runtime.  We must only register channel + service once per
// api instance.  Keyed on the api object so a fresh api (hot-reload / re-register
// after unload) is allowed through.
let registeredApi: any = null;

/**
 * Plugin entry point
 * Called by openclaw to register the plugin
 */
export default function register(api: any) {
  const log = api.logger || console;

  if (registeredApi === api) {
    log.info('[Sendblue Plugin] Already registered — skipping duplicate register() call');
    return;
  }
  registeredApi = api;

  log.info('[Sendblue Plugin] Registering channel...');

  const channel = createSendblueChannel(api);
  api.registerChannel({ plugin: channel });

  log.info('[Sendblue Plugin] Channel registered');

  // Register service to handle polling lifecycle
  api.registerService({
    id: 'sendblue-poller',
    start: () => {
      log.info('[Sendblue Plugin] Service starting...');
      const config = api.pluginConfig;
      if (config) {
        startSendblueService(api, config);
      } else {
        log.warn('[Sendblue Plugin] No config found, service not started');
      }
    },
    stop: async () => {
      log.info('[Sendblue Plugin] Service stopping...');
      await stopSendblueService();
    },
  });

  log.info('[Sendblue Plugin] Service registered');
}
