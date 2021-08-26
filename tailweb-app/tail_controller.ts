import { createTail, Tail } from '../common/cloudflare_api.ts';
import { TailMessage } from '../common/tail.ts';
import { ErrorInfo, TailConnection, TailConnectionCallbacks, UnparsedMessage } from '../common/tail_connection.ts';

export type TailKey = string; // accountId-scriptId

export interface TailControllerCallbacks {
    onTailCreating(accountId: string, scriptId: string): void;
    onTailCreated(accountId: string, scriptId: string, tookMillis: number, tail: Tail): void;
    onTailConnectionOpen(accountId: string, scriptId: string, timeStamp: number, tookMillis: number): void;
    onTailConnectionClose(accountId: string, scriptId: string, timeStamp: number, code: number, reason: string, wasClean: boolean): void;
    onTailConnectionError(accountId: string, scriptId: string, timeStamp: number, errorInfo?: ErrorInfo): void;
    onTailConnectionMessage(accountId: string, scriptId: string, timeStamp: number, message: TailMessage): void;
    onTailConnectionUnparsedMessage(accountId: string, scriptId: string, timeStamp: number, message: UnparsedMessage, parseError: Error): void;
    onTailsChanged(tailKeys: ReadonlySet<TailKey>): void;
}

export class TailController {
    private readonly callbacks: TailControllerCallbacks;
    private readonly records = new Map<TailKey, Record>();

    constructor(callbacks: TailControllerCallbacks) {
        this.callbacks = callbacks;
    }

    async setTails(accountId: string, apiToken: string, scriptIds: ReadonlySet<string>) {
        const stopKeys = new Set(this.records.keys());
        for (const scriptId of scriptIds) {
            const tailKey = computeTailKey(accountId, scriptId);
            stopKeys.delete(tailKey);
            const existingRecord = this.records.get(tailKey);
            if (existingRecord) {
                existingRecord.state = 'started';
            } else {
                const record: Record = { state: 'starting', tailKey };
                this.records.set(tailKey, record);

                const tailCreatingTime = Date.now();
                this.callbacks.onTailCreating(accountId, scriptId);
                const tail = await createTail(accountId, scriptId, apiToken);
                this.callbacks.onTailCreated(accountId, scriptId, Date.now() - tailCreatingTime, tail);

                const { callbacks } = this;
                const openingTime = Date.now();
                const tailConnectionCallbacks: TailConnectionCallbacks = {
                    onOpen(_cn: TailConnection, timeStamp: number) {
                        callbacks.onTailConnectionOpen(accountId, scriptId, timeStamp, Date.now() - openingTime);
                    },
                    onClose(_cn: TailConnection, timeStamp: number, code: number, reason: string, wasClean: boolean) {
                        callbacks.onTailConnectionClose(accountId, scriptId, timeStamp, code, reason, wasClean);
                    },
                    onError(_cn: TailConnection, timeStamp: number, errorInfo?: ErrorInfo) {
                        callbacks.onTailConnectionError(accountId, scriptId, timeStamp, errorInfo);
                    },
                    onTailMessage(_cn: TailConnection, timeStamp: number, message: TailMessage) {
                        if (record.state !== 'started') return;
                        callbacks.onTailConnectionMessage(accountId, scriptId, timeStamp, message);
                    },
                    onUnparsedMessage(_cn: TailConnection, timeStamp: number, message: UnparsedMessage, parseError: Error) {
                        callbacks.onTailConnectionUnparsedMessage(accountId, scriptId, timeStamp, message, parseError);
                    },
                };
                record.connection = new TailConnection(tail.url, tailConnectionCallbacks);
                record.state = 'started';
            }
            this.dispatchTailsChanged();
        }
        for (const stopKey of stopKeys) {
            const record = this.records.get(stopKey)!;
            record.state = 'stopping';
            // record.connection?.close(1000 /* normal closure */, 'no longer interested');
            this.dispatchTailsChanged();
        }
    }

    //

    private dispatchTailsChanged() {
        const tailKeys = new Set([...this.records.values()].filter(v => v.state === 'started').map(v => v.tailKey));
        this.callbacks.onTailsChanged(tailKeys);
    }
    
}

export function unpackTailKey(tailKey: TailKey): { accountId: string, scriptId: string} {
    const m = /^([^\s-]+)-([^\s]+)$/.exec(tailKey);
    if (!m) throw new Error(`Bad tailKey: ${tailKey}`);
    return { accountId: m[1], scriptId: m[2] };
}

//

function computeTailKey(accountId: string, scriptId: string) {
    return `${accountId}-${scriptId}`;
}

//

interface Record {
    readonly tailKey: TailKey;
    state: 'starting' | 'started' | 'stopping';
    connection?: TailConnection;
}