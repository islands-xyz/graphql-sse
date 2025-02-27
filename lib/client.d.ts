import { RequestParams, Sink, StreamMessage, ExecutionResult, StreamEvent } from './common';
/** This file is the entry point for browsers, re-export common elements. */
export * from './common';
/** @category Client */
export interface ClientOptions<SingleConnection extends boolean = false> {
    /**
     * Reuses a single SSE connection for all GraphQL operations.
     *
     * When instantiating with `false` (default), the client will run
     * in a "distinct connections mode" mode. Meaning, a new SSE
     * connection will be established on each subscribe.
     *
     * On the other hand, when instantiating with `true`, the client
     * will run in a "single connection mode" mode. Meaning, a single SSE
     * connection will be used to transmit all operation results while
     * separate HTTP requests will be issued to dictate the behaviour.
     *
     * @default false
     */
    singleConnection?: SingleConnection;
    /**
     * Controls when should the connection be established while using the
     * client in "single connection mode" (see `singleConnection ` option).
     *
     * - `false`: Establish a connection immediately.
     * - `true`: Establish a connection on first subscribe and close on last unsubscribe.
     *
     * Note that the `lazy` option has NO EFFECT when using the client
     * in "distinct connection mode" (`singleConnection = false`).
     *
     * @default true
     */
    lazy?: SingleConnection extends true ? boolean : never;
    /**
     * How long should the client wait before closing the connection after the last oparation has
     * completed. You might want to have a calmdown time before actually closing the connection.
     *
     * Meant to be used in combination with `lazy`.
     *
     * Note that the `lazy` option has NO EFFECT when using the client
     * in "distinct connection mode" (`singleConnection = false`).
     *
     * @default 0
     */
    lazyCloseTimeout?: SingleConnection extends true ? number : never;
    /**
     * Used ONLY when the client is in non-lazy mode (`lazy = false`). When
     * using this mode, errors might have no sinks to report to; however,
     * to avoid swallowing errors, `onNonLazyError` will be called when either:
     * - An unrecoverable error/close event occurs
     * - Silent retry attempts have been exceeded
     *
     * After a client has errored out, it will NOT perform any automatic actions.
     *
     * @default console.error
     */
    onNonLazyError?: SingleConnection extends true ? (error: unknown) => void : never;
    /**
     * URL of the GraphQL over SSE server to connect.
     *
     * If the option is a function, it will be called on each connection attempt.
     * Returning a Promise is supported too and the connection phase will stall until it
     * resolves with the URL.
     *
     * A good use-case for having a function is when using the URL for authentication,
     * where subsequent reconnects (due to auth) may have a refreshed identity token in
     * the URL.
     */
    url: string | (() => Promise<string> | string);
    /**
     * Indicates whether the user agent should send cookies from the other domain in the case
     * of cross-origin requests.
     *
     * Possible options are:
     *   - `omit`: Never send or receive cookies.
     *   - `same-origin`: Send user credentials (cookies, basic http auth, etc..) if the URL is on the same origin as the calling script.
     *   - `include`: Always send user credentials (cookies, basic http auth, etc..), even for cross-origin calls.
     *
     * @default same-origin
     */
    credentials?: 'omit' | 'same-origin' | 'include';
    /**
     * A string specifying the referrer of the request. This can be a same-origin URL, about:client, or an empty string.
     *
     * @default undefined
     */
    referrer?: string;
    /**
     * Specifies the referrer policy to use for the request.
     *
     * Possible options are:
     *   - `no-referrer`: Does not send referrer information along with requests to any origin.
     *   - `no-referrer-when-downgrade`: Sends full referrerURL for requests: whose referrerURL and current URL are both potentially trustworthy URLs, or whose referrerURL is a non-potentially trustworthy URL.
     *   - `same-origin`: Sends full referrerURL as referrer information when making same-origin-referrer requests.
     *   - `origin`: Sends only the ASCII serialization of the request’s referrerURL when making both same-origin-referrer requests and cross-origin-referrer requests.
     *   - `strict-origin`: Sends the ASCII serialization of the origin of the referrerURL for requests: whose referrerURL and current URL are both potentially trustworthy URLs, or whose referrerURL is a non-potentially trustworthy URL
     *   - `origin-when-cross-origin`: Sends full referrerURL when making same-origin-referrer requests, and only the ASCII serialization of the origin of the request’s referrerURL is sent when making cross-origin-referrer requests
     *   - `strict-origin-when-cross-origin`: Sends full referrerURL when making same-origin-referrer requests, and only the ASCII serialization of the origin of the request’s referrerURL when making cross-origin-referrer requests: whose referrerURL and current URL are both potentially trustworthy URLs, or whose referrerURL is a non-potentially trustworthy URL.
     *   - `unsafe-url`: Sends full referrerURL along for both same-origin-referrer requests and cross-origin-referrer requests.
     *
     * @default undefined
     */
    referrerPolicy?: 'no-referrer' | 'no-referrer-when-downgrade' | 'same-origin' | 'origin' | 'strict-origin' | 'origin-when-cross-origin' | 'strict-origin-when-cross-origin' | 'unsafe-url';
    /**
     * HTTP headers to pass along the request.
     *
     * If the option is a function, it will be called on each connection attempt.
     * Returning a Promise is supported too and the connection phase will stall until it
     * resolves with the headers.
     *
     * A good use-case for having a function is when using the headers for authentication,
     * where subsequent reconnects (due to auth) may have a refreshed identity token in
     * the header.
     */
    headers?: Record<string, string> | (() => Promise<Record<string, string>> | Record<string, string>);
    /**
     * The Fetch function to use.
     *
     * For NodeJS environments consider using [`node-fetch`](https://github.com/node-fetch/node-fetch).
     *
     * @default global.fetch
     */
    fetchFn?: unknown;
    /**
     * The AbortController implementation to use.
     *
     * For NodeJS environments before v15 consider using [`node-abort-controller`](https://github.com/southpolesteve/node-abort-controller).
     *
     * @default global.AbortController
     */
    abortControllerImpl?: unknown;
    /**
     * A custom ID generator for identifying subscriptions.
     *
     * The default generates a v4 UUID to be used as the ID using `Math`
     * as the random number generator. Supply your own generator
     * in case you need more uniqueness.
     *
     * Reference: https://gist.github.com/jed/982883
     */
    generateID?: () => string;
    /**
     * How many times should the client try to reconnect before it errors out?
     *
     * @default 5
     */
    retryAttempts?: number;
    /**
     * Control the wait time between retries. You may implement your own strategy
     * by timing the resolution of the returned promise with the retries count.
     *
     * `retries` argument counts actual reconnection attempts, so it will begin with
     * 0 after the first retryable disconnect.
     *
     * @default 'Randomised exponential backoff, 5 times'
     */
    retry?: (retries: number) => Promise<void>;
    /**
     * Browsers show stream messages in the DevTools **only** if they're received through the [native EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource),
     * and because `graphql-sse` implements a custom SSE parser - received messages will **not** appear in browser's DevTools.
     *
     * Use this function if you want to inspect valid messages received through the active SSE connection.
     */
    onMessage?: (message: StreamMessage<SingleConnection, StreamEvent>) => void;
}
/** @category Client */
export interface Client {
    /**
     * Subscribes to receive through a SSE connection.
     *
     * It uses the `sink` to emit received data or errors. Returns a _dispose_
     * function used for dropping the subscription and cleaning up.
     */
    subscribe<Data = Record<string, unknown>, Extensions = unknown>(request: RequestParams, sink: Sink<ExecutionResult<Data, Extensions>>): () => void;
    /**
     * Dispose of the client, destroy connections and clean up resources.
     */
    dispose: () => void;
}
/**
 * Creates a disposable GraphQL over SSE client to transmit
 * GraphQL operation results.
 *
 * If you have an HTTP/2 server, it is recommended to use the client
 * in "distinct connections mode" (`singleConnection = false`) which will
 * create a new SSE connection for each subscribe. This is the default.
 *
 * However, when dealing with HTTP/1 servers from a browser, consider using
 * the "single connection mode" (`singleConnection = true`) which will
 * use only one SSE connection.
 *
 * @category Client
 */
export declare function createClient<SingleConnection extends boolean = false>(options: ClientOptions<SingleConnection>): Client;
/**
 * A network error caused by the client or an unexpected response from the server.
 *
 * Network errors are considered retryable, all others error types will be reported
 * immediately.
 *
 * To avoid bundling DOM typings (because the client can run in Node env too),
 * you should supply the `Response` generic depending on your Fetch implementation.
 *
 * @category Client
 */
export declare class NetworkError<Response extends ResponseLike = ResponseLike> extends Error {
    /**
     * The underlyig response thats considered an error.
     *
     * Will be undefined when no response is received,
     * instead an unexpected network error.
     */
    response: Response | undefined;
    constructor(msgOrErrOrResponse: string | Error | Response);
}
interface ResponseLike {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
}
