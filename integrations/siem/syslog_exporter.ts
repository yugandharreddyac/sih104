/**
 * VOXSHIELD SIEM Exporter (Splunk, Elastic, Sentinel, QRadar)
 */

export interface SiemEvent {
  facility: string;
  severity: string;
  timestamp: Date;
  event: Record<string, any>;
}

export class SiemExporter {
  public async exportEvent(event: SiemEvent): Promise<void> {
    // Phase 1 stub for CEF / Syslog transmission
  }
}
