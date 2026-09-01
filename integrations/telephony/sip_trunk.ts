/**
 * VOXSHIELD SIP Trunk Adapter Stub
 * Interface for Asterisk / FreeSWITCH / Twilio SIP integration in Phase 2.
 */

export interface SipTrunkConfig {
  trunkHost: string;
  port: number;
  signalingTls: boolean;
  codecs: string[]; // e.g. ['G711U', 'OPUS', 'G722']
}

export class SipTrunkConnector {
  constructor(private config: SipTrunkConfig) {}

  public async connect(): Promise<void> {
    console.info(`[SIP] Connector registered for trunk ${this.config.trunkHost}:${this.config.port} (Phase 2 ready).`);
  }
}
