import * as Y from 'yjs';
export class Realtime {
    constructor(doc, opts = {}) {
        this.doc = doc;
        this.opts = opts;
        this.statusCbs = new Set();
        // Base wires local updates to the transport; child only implements sendUpdate
        this.onDocUpdate = (u) => this.sendUpdate(u);
        this.doc.on('update', this.onDocUpdate);
    }
    /** Providers call this when they receive a remote update. */
    applyRemote(update) {
        Y.applyUpdate(this.doc, update);
    }
    onStatus(cb) {
        this.statusCbs.add(cb);
    }
    emitStatus(status) {
        const evt = { status };
        for (const cb of this.statusCbs)
            cb(evt);
    }
    /** Free any resources/sockets. */
    destroy() {
        // let child clean up IO
        this.disconnect?.();
        if (this.onDocUpdate)
            this.doc.off('update', this.onDocUpdate);
        this.statusCbs.clear();
    }
}
