import net from 'node:net';
import crypto from 'node:crypto';

// Apple Music registered client ID for authentic "Listening to Apple Music" presence
const APPLE_MUSIC_CLIENT_ID = '886578863147192350';

const OPCODES = {
  HANDSHAKE: 0,
  FRAME: 1,
  CLOSE: 2,
  PING: 3,
  PONG: 4,
} as const;

interface Activity {
  details?: string;
  state?: string;
  timestamps?: {
    start?: number;
    end?: number;
  };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  buttons?: Array<{ label: string; url: string }>;
  type?: number; // 2 = Listening
}

class DiscordRpcClient {
  private socket: net.Socket | null = null;
  private connected = false;
  private enabled = true;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private currentActivity: Activity | null = null;
  private pipeIndex = 0;

  constructor() {
    // Connect to Discord desktop client IPC pipe on startup
    this.connect();
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    if (!val) {
      this.clearActivity();
      this.disconnect();
    } else {
      this.connect();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private getPipePath(index: number): string {
    if (process.platform === 'win32') {
      return `\\\\.\\pipe\\discord-ipc-${index}`;
    }
    const env = process.env;
    const prefix = env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || '/tmp';
    return `${prefix.replace(/\/$/, '')}/discord-ipc-${index}`;
  }

  private connect() {
    if (!this.enabled || this.socket) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const path = this.getPipePath(this.pipeIndex);
    const sock = net.createConnection({ path }, () => {
      this.socket = sock;
      this.sendHandshake();
    });

    sock.on('data', (data) => {
      this.handleData(data);
    });

    sock.on('error', () => {
      // Try next pipe index or schedule retry
      sock.destroy();
      this.socket = null;
      this.connected = false;
      this.tryNextPipe();
    });

    sock.on('close', () => {
      this.socket = null;
      this.connected = false;
      this.scheduleReconnect();
    });
  }

  private tryNextPipe() {
    this.pipeIndex = (this.pipeIndex + 1) % 10;
    if (this.pipeIndex === 0) {
      // Cycled through all 10 pipes without finding Discord; wait before trying again
      this.scheduleReconnect();
    } else {
      // Try next pipe immediately
      this.connect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.enabled) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.pipeIndex = 0;
      this.connect();
    }, 15000);
  }

  private disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {}
      this.socket = null;
    }
    this.connected = false;
  }

  private encodePacket(opcode: number, payload: unknown): Buffer {
    const json = Buffer.from(JSON.stringify(payload), 'utf8');
    const header = Buffer.alloc(8);
    header.writeInt32LE(opcode, 0);
    header.writeInt32LE(json.length, 4);
    return Buffer.concat([header, json]);
  }

  private sendHandshake() {
    if (!this.socket) return;
    const packet = this.encodePacket(OPCODES.HANDSHAKE, {
      v: 1,
      client_id: APPLE_MUSIC_CLIENT_ID,
    });
    this.socket.write(packet);
  }

  private handleData(data: Buffer) {
    if (data.length < 8) return;
    const opcode = data.readInt32LE(0);
    const length = data.readInt32LE(4);
    if (data.length < 8 + length) return;

    try {
      const payload = JSON.parse(data.subarray(8, 8 + length).toString('utf8'));
      if (opcode === OPCODES.FRAME && payload.cmd === 'DISPATCH' && payload.evt === 'READY') {
        this.connected = true;
        // If an activity was queued while connecting, send it now
        if (this.currentActivity) {
          this.sendActivity(this.currentActivity);
        }
      }
    } catch {}
  }

  private sendActivity(activity: Activity | null) {
    if (!this.socket || !this.connected) return;
    const packet = this.encodePacket(OPCODES.FRAME, {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity,
      },
      nonce: crypto.randomUUID(),
    });
    this.socket.write(packet);
  }

  public updatePresence(track: {
    title?: string;
    artist?: string;
    album?: string;
    artworkUrl?: string;
    positionSec?: number;
    durationSec?: number;
    status?: string;
  }) {
    if (!this.enabled) return;

    const isPlaying = track.status === 'playing' || track.status === 'buffering';
    if (!isPlaying || !track.title) {
      this.clearActivity();
      return;
    }

    const pos = Math.max(0, track.positionSec || 0);
    const dur = Math.max(0, track.durationSec || 0);
    const now = Date.now();
    const start = Math.floor(now - pos * 1000);
    const end = dur > 0 ? Math.floor(start + dur * 1000) : undefined;

    const details = track.title.slice(0, 128);
    const state = track.artist ? `by ${track.artist}`.slice(0, 128) : undefined;
    const albumName = track.album || track.title;

    const appleMusicUrl = `https://music.apple.com/search?term=${encodeURIComponent(`${track.title} ${track.artist || ''}`)}`;

    const activity: Activity = {
      details,
      state,
      timestamps: {
        start,
        ...(end && end > now ? { end } : {}),
      },
      assets: {
        large_image: track.artworkUrl && track.artworkUrl.startsWith('http') ? track.artworkUrl : 'apple_music',
        large_text: albumName.slice(0, 128),
        small_image: 'apple_music',
        small_text: 'Apple Music',
      },
      buttons: [
        {
          label: 'Listen on Apple Music',
          url: appleMusicUrl,
        },
      ],
      type: 2, // Listening to ...
    };

    this.currentActivity = activity;
    if (this.connected) {
      this.sendActivity(activity);
    } else {
      this.connect();
    }
  }

  public clearActivity() {
    this.currentActivity = null;
    if (this.connected) {
      this.sendActivity(null);
    }
  }
}

export const discordRpc = new DiscordRpcClient();
