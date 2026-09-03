/**
 * Real Browser Microphone Streaming Engine for VOXSHIELD
 * Captures live microphone audio via getUserMedia, converts to 16-bit Linear PCM (mono, 16 kHz),
 * and frames chunks for real-time WebSocket transmission.
 */

export type MicStreamState =
  | 'IDLE'
  | 'MIC_PERMISSION_REQUIRED'
  | 'MIC_ACTIVE'
  | 'CONNECTING'
  | 'STREAMING'
  | 'DISCONNECTED'
  | 'ERROR'
  | 'STOPPED';

export interface AudioStreamerConfig {
  sampleRate?: number;
  bufferSize?: number; // In samples, e.g. 4096 (256ms at 16kHz)
  onChunk: (base64Audio: string, seq: number, rmsDb: number) => void;
  onStateChange: (state: MicStreamState, error?: string) => void;
}

export class BrowserAudioStreamer {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processorNode: ScriptProcessorNode | AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private sequenceNumber = 0;
  private isRunning = false;
  private config: AudioStreamerConfig;

  constructor(config: AudioStreamerConfig) {
    this.config = {
      sampleRate: 16000,
      bufferSize: 4096,
      ...config,
    };
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      this.config.onStateChange('MIC_PERMISSION_REQUIRED');

      // 1. Request microphone access with telephony-grade constraints
      const constraints: MediaStreamConstraints = {
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      };

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser does not support mediaDevices.getUserMedia API');
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.config.onStateChange('MIC_ACTIVE');

      // 2. Initialize AudioContext at target 16kHz or browser native rate
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        throw new Error('Web Audio API (AudioContext) is not supported in this browser');
      }

      this.audioContext = new AudioCtxClass();
      const actualSampleRate = this.audioContext.sampleRate;

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sequenceNumber = 0;
      this.isRunning = true;

      // 3. ScriptProcessor / Audio Processing Node
      const bufferSize = this.config.bufferSize || 4096;
      const processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      this.processorNode = processor;

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!this.isRunning) return;

        const inputChannelData = e.inputBuffer.getChannelData(0);

        // Compute RMS dBFS for visualizer
        let sumSquares = 0;
        for (let i = 0; i < inputChannelData.length; i++) {
          sumSquares += inputChannelData[i] * inputChannelData[i];
        }
        const rms = Math.sqrt(sumSquares / inputChannelData.length);
        const rmsDb = rms > 0.00001 ? 20 * Math.log10(rms) : -96.0;

        // Resample to 16,000 Hz if AudioContext native rate differs
        const resampledData = this.resampleTo16k(inputChannelData, actualSampleRate);

        // Convert Float32 [-1.0, 1.0] to Signed 16-bit Linear PCM
        const pcm16 = new Int16Array(resampledData.length);
        for (let i = 0; i < resampledData.length; i++) {
          const s = Math.max(-1.0, Math.min(1.0, resampledData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Convert to Base64
        const uint8 = new Uint8Array(pcm16.buffer);
        let binary = '';
        const len = uint8.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64Chunk = btoa(binary);

        // Dispatch framed chunk
        this.config.onChunk(base64Chunk, this.sequenceNumber++, rmsDb);
      };

      this.sourceNode.connect(processor);
      processor.connect(this.audioContext.destination);

      this.config.onStateChange('STREAMING');
    } catch (err: any) {
      this.stop();
      let errorMsg = 'Microphone access failed';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Microphone permission denied by user';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No microphone device found';
      } else if (err.message) {
        errorMsg = err.message;
      }
      this.config.onStateChange('ERROR', errorMsg);
      throw new Error(errorMsg);
    }
  }

  public stop(): void {
    this.isRunning = false;

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close();
        }
      } catch {}
      this.audioContext = null;
    }

    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch {}
      this.mediaStream = null;
    }

    this.config.onStateChange('STOPPED');
  }

  /**
   * Resamples float audio buffer from sourceRate to target 16,000 Hz using linear interpolation
   */
  private resampleTo16k(input: Float32Array, sourceRate: number): Float32Array {
    const targetRate = 16000;
    if (sourceRate === targetRate) {
      return input;
    }

    const ratio = sourceRate / targetRate;
    const newLength = Math.round(input.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const indexFloor = Math.floor(srcIndex);
      const indexCeil = Math.min(input.length - 1, Math.ceil(srcIndex));
      const fraction = srcIndex - indexFloor;
      result[i] = input[indexFloor] * (1 - fraction) + input[indexCeil] * fraction;
    }

    return result;
  }
}
