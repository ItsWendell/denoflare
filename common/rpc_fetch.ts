import { consoleLog } from './console.ts';
import { Constants } from './constants.ts';
import { DenoflareResponse } from './denoflare_response.ts';
import { RpcChannel } from './rpc_channel.ts';

export function makeFetchOverRpc(channel: RpcChannel, bodies: Bodies): (info: RequestInfo, init?: RequestInit) => Promise<Response> {
    return async (info: RequestInfo, init?: RequestInit) => {
        const data = packRequest(info, init, bodies);
        return await channel.sendRequest('fetch', data, responseData => unpackResponse(responseData, makeBodyResolverOverRpc(channel)));
    }
}

export function makeBodyResolverOverRpc(channel: RpcChannel): BodyResolver {
    return bodyId => new ReadableStream({
        start(_controller)  {
            // consoleLog(`RpcBodyResolver(${bodyId}): start controller.desiredSize=${controller.desiredSize}`);
        },
        async pull(controller): Promise<void> {
            // consoleLog(`RpcBodyResolver(${bodyId}): pull controller.desiredSize=${controller.desiredSize}`);
            const { value, done } = await channel.sendRequest('read-body-chunk', { bodyId }, responseData => {
                return responseData as ReadableStreamReadResult<Uint8Array>;
            });
            if (value !== undefined) controller.enqueue(value);
            if (done) controller.close();
        },
        cancel(reason) {
            consoleLog(`RpcBodyResolver(${bodyId}): cancel reason=${reason}`);
        },
    });
}

export function addRequestHandlerForReadBodyChunk(channel: RpcChannel, bodies: Bodies) {
    channel.addRequestHandler('read-body-chunk', async requestData => {
        const { bodyId } = requestData;
        const { value, done } = await bodies.readBodyChunk(bodyId);
        return { value, done };
    });
}

export type BodyResolver = (bodyId: number) => ReadableStream<Uint8Array>;

export async function packResponse(response: Response, bodies: Bodies): Promise<PackedResponse> {
    const { status } = response;
    const headers = [...response.headers.entries()];
    if (DenoflareResponse.is(response)) {
        if (typeof response.bodyInit === 'string') {
            const bodyText = response.bodyInit;
            return { status, headers, bodyId: undefined, bodyText, bodyBytes: undefined };
        } else if (response.bodyInit instanceof ReadableStream) {
            const bodyId = bodies.computeBodyId(response.bodyInit);
            return { status, headers, bodyId, bodyText: undefined, bodyBytes: undefined };
        } else {
            throw new Error(`packResponse: DenoflareResponse bodyInit=${response.bodyInit}`);
        }
    }
    const contentLength = parseInt(response.headers.get('content-length') || '-1');
    if (contentLength > -1 && contentLength <= Constants.MAX_CONTENT_LENGTH_TO_PACK_OVER_RPC) {
        const bodyBytes = await response.arrayBuffer();
        // consoleLog(`packResponse: contentLength=${contentLength} bodyBytes.byteLength=${bodyBytes.byteLength} url=${response.url}`);
        return { status, headers, bodyId: undefined, bodyText: undefined, bodyBytes };
    }
    const bodyId = bodies.computeBodyId(response.body);
    return { status, headers, bodyId, bodyText: undefined, bodyBytes: undefined };
}

const _Response = Response;

export function unpackResponse(packed: PackedResponse, bodyResolver: BodyResolver): Response {
    const { status, bodyId, bodyText, bodyBytes } = packed;
    const headers = new Headers(packed.headers);
    const body = bodyText !== undefined ? bodyText
        : bodyBytes !== undefined ? bodyBytes
        : bodyId === undefined ? undefined 
        : bodyResolver(bodyId);
    return new _Response(body, { status, headers });
}

export function packRequest(info: RequestInfo, init: RequestInit |  undefined, bodies: Bodies): PackedRequest {
    if (typeof info === 'object' && init === undefined) {
        // Request
        const { method, url } = info;
        const headers = [...info.headers.entries()];
        const bodyId = bodies.computeBodyId(info.body);
        return { method, url, headers, bodyId };
    } else if (typeof info === 'string') {
        // url String
        const url = info;
        let method = 'GET';
        let headers: [string, string][] = [];
        if (init !== undefined) {
            if (init.method !== undefined) method = init.method;
            if (init.headers !== undefined) headers = [...new Headers(init.headers).entries()];
            if (init.body !== undefined) throw new Error(`packRequest: init.body`);
            if (init.cache !== undefined) throw new Error(`packRequest: init.cache`);
            if (init.credentials !== undefined) throw new Error(`packRequest: init.credentials`);
            if (init.integrity !== undefined) throw new Error(`packRequest: init.integrity`);
            if (init.keepalive !== undefined) throw new Error(`packRequest: init.keepalive`);
            if (init.mode !== undefined) throw new Error(`packRequest: init.mode`);
            if (init.redirect !== undefined && init.redirect !== 'follow') throw new Error(`packRequest: init.redirect ${init.redirect}`);
            if (init.referrer !== undefined) throw new Error(`packRequest: init.referrer`);
            if (init.referrerPolicy !== undefined) throw new Error(`packRequest: init.referrerPolicy`);
            if (init.signal !== undefined) throw new Error(`packRequest: init.signal`);
            if (init.window !== undefined) throw new Error(`packRequest: init.window`);
        }
        return { method, url, headers, bodyId: undefined };
    }
    throw new Error(`packRequest: implement info=${info} ${typeof info} init=${init}`);
}

export function unpackRequest(packedRequest: PackedRequest, bodyResolver: BodyResolver): Request {
    const { url, method, bodyId } = packedRequest;
    const headers = new Headers(packedRequest.headers);
    const body = bodyId === undefined ? undefined : bodyResolver(bodyId);
    return new Request(url, { method, headers, body });
}

//

export interface PackedRequest {
    readonly method: string;
    readonly url: string;
    readonly headers: [string, string][];
    readonly bodyId: number | undefined;
}

export interface PackedResponse {
    readonly status: number;
    readonly headers: [string, string][];
    readonly bodyId: number | undefined;
    readonly bodyText: string | undefined;
    readonly bodyBytes: ArrayBuffer | undefined;
}

export class Bodies {

    private readonly bodies = new Map<number, ReadableStream<Uint8Array>>();
    private readonly readers = new Map<number, ReadableStreamDefaultReader<Uint8Array>>();

    private nextBodyId = 1;

    computeBodyId(body: ReadableStream<Uint8Array> | null): number | undefined {
        if (!body) return undefined;
        const bodyId = this.nextBodyId++;
        this.bodies.set(bodyId, body);
        return bodyId;
    }

    async readBodyChunk(bodyId: number): Promise<ReadableStreamReadResult<Uint8Array>> {
        let reader = this.readers.get(bodyId);
        if (reader === undefined) {
            const body = this.bodies.get(bodyId);
            if (!body) throw new Error(`Bad bodyId: ${bodyId}`);
            reader = body.getReader();
            this.readers.set(bodyId, reader);
        }
        const result = await reader.read();
        if (result.done) {
            this.readers.delete(bodyId);
            this.bodies.delete(bodyId);
        }
        return result;
    }

}
