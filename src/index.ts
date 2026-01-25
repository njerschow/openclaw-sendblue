/**
 * Clawdbot Sendblue Plugin
 *
 * Registers a Sendblue messaging channel for iMessage/SMS support.
 */

import { createSendblueChannel, startSendblueService, stopSendblueService } from './channel.js';

/**
 * Plugin entry point
 * Called by clawdbot to register the plugin
 */
export default function register(api: any) {
  const log = api.logger || console;

  // Debug: log available API methods
  const keys = Object.keys(api);
  log.info(`[Sendblue Plugin] API has ${keys.length} methods: ${keys.join(', ')}`);

  // Explore ALL of runtime
  for (const key of Object.keys(api.runtime)) {
    const val = api.runtime[key];
    if (typeof val === 'object' && val !== null) {
      const subKeys = Object.keys(val);
      log.info(`[Sendblue Plugin] runtime.${key}: ${subKeys.join(', ')}`);
    } else {
      log.info(`[Sendblue Plugin] runtime.${key}: ${typeof val}`);
    }
  }

  // Check pluginConfig
  if (api.pluginConfig) {
    log.info(`[Sendblue Plugin] pluginConfig keys: ${Object.keys(api.pluginConfig).join(', ')}`);
  }

  log.info('[Sendblue Plugin] Registering channel...');

  const channel = createSendblueChannel(api);
  api.registerChannel({ plugin: channel });

  log.info('[Sendblue Plugin] Channel registered');

  // Register service to handle polling lifecycle
  api.registerService({
    id: 'sendblue-poller',
    start: () => {
      log.info('[Sendblue Plugin] Service starting...');
      const config = api.config?.plugins?.entries?.sendblue?.config;
      if (config) {
        startSendblueService(api, config);
      } else {
        log.warn('[Sendblue Plugin] No config found, service not started');
      }
    },
    stop: () => {
      log.info('[Sendblue Plugin] Service stopping...');
      stopSendblueService();
    },
  });

  log.info('[Sendblue Plugin] Service registered');
}
