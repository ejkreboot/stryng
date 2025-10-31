import { WebsocketProvider } from 'y-websocket';
export class Websockyt {
    constructor(doc, roomName, serverUrl = 'wss://ws.codyx.io/websock', token = 'rjKfn9aBIjhTgrVV') {
        this.provider = null;
        this.token = null;
        this.doc = doc;
        this.roomName = roomName;
        this.serverUrl = serverUrl;
        this.token = token;
    }
    async connect() {
        if (this.provider) {
            return;
        }
        this.provider = new WebsocketProvider(this.serverUrl, this.roomName, this.doc, { params: { token: this.token } });
        this.provider.on('sync', (isSynced) => {
            console.log(`WebSocket synced: ${isSynced}`);
        });
        this.provider.on('status', (event) => {
            console.log(`WebSocket status: ${event.status}`);
        });
        this.provider.on('connection-error', (error) => {
            console.error('WebSocket connection error:', error);
        });
    }
    disconnect() {
        if (this.provider) {
            this.provider.destroy();
            this.provider = null;
        }
    }
    isConnected() {
        return this.provider?.wsconnected === true;
    }
    getProvider() {
        return this.provider;
    }
}
