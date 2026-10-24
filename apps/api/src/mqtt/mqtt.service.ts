import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { connect, type IClientPublishOptions, type MqttClient } from 'mqtt';
import { APP_CONFIG, type AppConfig } from '../config/config';

export type MessageHandler = (
  topic: string,
  payload: Buffer,
) => void | Promise<void>;
export type ConnectHandler = () => void | Promise<void>;

/** MQTT's "failure" return code in a SUBACK. */
const SUBACK_FAILURE = 128;

/**
 * The API's single broker connection, authenticated as the dynamic-security
 * admin. It only moves bytes: other services register what to do on connect
 * and on each message.
 */
@Injectable()
export class MqttService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client?: MqttClient;
  private readonly messageHandlers: MessageHandler[] = [];
  private readonly connectHandlers: ConnectHandler[] = [];

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get connected(): boolean {
    return this.client?.connected ?? false;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Runs on every (re)connect, one after another in registration order, so a
   * later handler can rely on an earlier one having finished. The session is
   * clean, so subscriptions have to be re-established each time.
   */
  onConnect(handler: ConnectHandler): void {
    this.connectHandlers.push(handler);
  }

  /** Connects only once every service has registered its handlers. */
  onApplicationBootstrap(): void {
    const client = connect(this.config.mqttUrl, {
      username: this.config.mqttAdminUser,
      password: this.config.mqttAdminPassword,
      clientId: `spring-api-${randomUUID().slice(0, 8)}`,
      clean: true,
      reconnectPeriod: 2000,
    });
    this.client = client;

    client.on('connect', () => {
      this.logger.log(`Connected to broker at ${this.config.mqttUrl}`);
      void this.runConnectHandlers();
    });
    client.on('message', (topic, payload) => {
      for (const handler of this.messageHandlers) {
        Promise.resolve(handler(topic, payload)).catch((error: unknown) =>
          this.logger.error(`Handler failed for ${topic}: ${String(error)}`),
        );
      }
    });
    client.on('error', (error) =>
      this.logger.warn(`Broker error: ${error.message}`),
    );
    client.on('close', () => this.logger.warn('Broker connection closed'));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.endAsync();
  }

  async publish(
    topic: string,
    payload: string,
    options: IClientPublishOptions = { qos: 1 },
  ): Promise<void> {
    await this.requireClient().publishAsync(topic, payload, options);
  }

  /** Rejects if the broker refuses any filter, e.g. because the ACL does not allow it. */
  async subscribe(filters: string[]): Promise<void> {
    const granted = await this.requireClient().subscribeAsync(filters, {
      qos: 1,
    });
    const refused = granted.filter((g) => g.qos === SUBACK_FAILURE);
    if (refused.length > 0) {
      throw new Error(
        `Broker refused subscription to ${refused.map((g) => g.topic).join(', ')}`,
      );
    }
  }

  private async runConnectHandlers(): Promise<void> {
    for (const handler of this.connectHandlers) {
      try {
        await handler();
      } catch (error) {
        // The broker drops a client whose roles it just changed, which is an
        // expected part of first-run setup; the reconnect redoes the rest.
        if (!this.connected) {
          this.logger.warn('Connection lost during setup, will retry');
          return;
        }
        this.logger.error(`Connect handler failed: ${String(error)}`);
      }
    }
  }

  private requireClient(): MqttClient {
    if (!this.client) throw new Error('MQTT client not started');
    return this.client;
  }
}
