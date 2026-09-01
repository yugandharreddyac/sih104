/**
 * VOXSHIELD WebRTC VoIP Gateway Adapter Stub
 */

export interface WebRtcPeerSession {
  sessionId: string;
  iceServers: string[];
  audioChannels: number;
}

export class WebRtcGateway {
  public async createSession(sessionId: string): Promise<WebRtcPeerSession> {
    return {
      sessionId,
      iceServers: ['stun:stun.l.google.com:19302'],
      audioChannels: 1,
    };
  }
}
