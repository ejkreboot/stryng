import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
export declare class Websockyt {
    private provider;
    private doc;
    private roomName;
    private serverUrl;
    private token;
    constructor(doc: Y.Doc, roomName: string, serverUrl?: string, token?: string | null);
    connect(): Promise<void>;
    disconnect(): void;
    isConnected(): boolean;
    getProvider(): WebsocketProvider | null;
}
