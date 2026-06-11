const net = require('net');
const EventEmitter = require('events');

class DiscordRPC extends EventEmitter {
  constructor(clientId) {
    super();
    this.clientId = clientId;
    this.socket = null;
    this.connected = false;
    this.ready = false;
    this.reconnectTimer = null;
    this.activity = null;
  }

  connect() {
    if (this.socket) {
      this.socket.destroy();
    }

    const path = process.platform === 'win32'
      ? '\\\\.\\pipe\\discord-ipc-0'
      : `${process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp'}/discord-ipc-0`;

    this.socket = net.createConnection(path);

    this.buffer = Buffer.alloc(0);

    this.socket.on('connect', () => {
      this.connected = true;
      this.sendHandshake();
      this.emit('connected');
    });

    this.socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      try {
        while (this.buffer.length >= 8) {
          const op = this.buffer.readInt32LE(0);
          const len = this.buffer.readInt32LE(4);

          if (this.buffer.length < 8 + len) {
            break;
          }

          const payloadStr = this.buffer.slice(8, 8 + len).toString('utf8');
          this.buffer = this.buffer.slice(8 + len);

          const payload = JSON.parse(payloadStr);

          if (payload.evt === 'READY') {
            console.log('[Discord RPC] Handshake success! Session ready.');
            this.ready = true;
            this.emit('ready');
            if (this.activity) {
              this.updateActivity(this.activity);
            }
          }
        }
      } catch (err) {
        console.error('[Discord RPC] Parse error:', err);
      }
    });

    this.socket.on('close', () => {
      this.connected = false;
      this.ready = false;
      this.buffer = Buffer.alloc(0);
      this.scheduleReconnect();
      this.emit('disconnected');
    });

    this.socket.on('error', (err) => {
      this.connected = false;
      this.ready = false;
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 15000);
  }

  send(op, data) {
    if (!this.connected || !this.socket) return;
    try {
      const json = JSON.stringify(data);
      const len = Buffer.byteLength(json);
      const header = Buffer.alloc(8);
      header.writeInt32LE(op, 0);
      header.writeInt32LE(len, 4);
      this.socket.write(Buffer.concat([header, Buffer.from(json)]));
    } catch (e) {
      console.error('[Discord RPC] Send error:', e);
    }
  }

  sendHandshake() {
    this.send(0, {
      v: 1,
      client_id: this.clientId
    });
  }

  updateActivity(activity) {
    this.activity = activity;
    if (!this.connected || !this.ready) return;

    this.send(1, {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity: activity
      },
      nonce: Math.random().toString(36).slice(2)
    });
  }

  clearActivity() {
    this.activity = null;
    this.updateActivity(null);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.ready = false;
  }
}

module.exports = DiscordRPC;
