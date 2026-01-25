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

  // Explore runtime.channel.session
  if (api.runtime?.channel?.session) {
    const sessionKeys = Object.keys(api.runtime.channel.session);
    log.info(`[Sendblue Plugin] channel.session has: ${sessionKeys.join(', ')}`);
  }

  // Explore runtime.channel.activity
  if (api.runtime?.channel?.activity) {
    const activityKeys = Object.keys(api.runtime.channel.activity);
    log.info(`[Sendblue Plugin] channel.activity has: ${activityKeys.join(', ')}`);
  }

  // Explore runtime directly for dispatch/message methods
  const runtimeKeys = Object.keys(api.runtime);
  log.info(`[Sendblue Plugin] runtime keys: ${runtimeKeys.join(', ')}`);

  // Check if 'on' is an event emitter - maybe we can emit events
  if (typeof api.on === 'function') {
    log.info(`[Sendblue Plugin] api.on exists - checking if emit exists too`);
    log.info(`[Sendblue Plugin] api.emit: ${typeof api.emit}`);
    log.info(`[Sendblue Plugin] api.dispatch: ${typeof api.dispatch}`);
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
