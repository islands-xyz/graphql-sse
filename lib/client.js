"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkError = exports.createClient = void 0;
/**
 *
 * client
 *
 */
const parser_1 = require("./parser");
const utils_1 = require("./utils");
const common_1 = require("./common");
/** This file is the entry point for browsers, re-export common elements. */
__exportStar(require("./common"), exports);
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
function createClient(options) {
    const { singleConnection = false, lazy = true, lazyCloseTimeout = 0, onNonLazyError = console.error, 
    /**
     * Generates a v4 UUID to be used as the ID using `Math`
     * as the random number generator. Supply your own generator
     * in case you need more uniqueness.
     *
     * Reference: https://gist.github.com/jed/982883
     */
    generateID = function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0, v = c == 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }, retryAttempts = 5, retry = async function randomisedExponentialBackoff(retries) {
        let retryDelay = 1000; // start with 1s delay
        for (let i = 0; i < retries; i++) {
            retryDelay *= 2;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay +
            // add random timeout from 300ms to 3s
            Math.floor(Math.random() * (3000 - 300) + 300)));
    }, credentials = 'same-origin', referrer, referrerPolicy, onMessage, } = options;
    const fetchFn = (options.fetchFn || fetch);
    const AbortControllerImpl = (options.abortControllerImpl ||
        AbortController);
    // we dont use yet another AbortController here because of
    // node's max EventEmitters listeners being only 10
    const client = (() => {
        let disposed = false;
        const listeners = [];
        return {
            get disposed() {
                return disposed;
            },
            onDispose(cb) {
                if (disposed) {
                    // empty the call stack and then call the cb
                    setTimeout(() => cb(), 0);
                    return () => {
                        // noop
                    };
                }
                listeners.push(cb);
                return () => {
                    listeners.splice(listeners.indexOf(cb), 1);
                };
            },
            dispose() {
                if (disposed)
                    return;
                disposed = true;
                // we copy the listeners so that onDispose unlistens dont "pull the rug under our feet"
                for (const listener of [...listeners]) {
                    listener();
                }
            },
        };
    })();
    let connCtrl, conn, locks = 0, retryingErr = null, retries = 0;
    async function getOrConnect() {
        try {
            if (client.disposed)
                throw new Error('Client has been disposed');
            return await (conn !== null && conn !== void 0 ? conn : (conn = (async () => {
                var _a;
                if (retryingErr) {
                    await retry(retries);
                    // connection might've been aborted while waiting for retry
                    if (connCtrl.signal.aborted)
                        throw new Error('Connection aborted by the client');
                    retries++;
                }
                // we must create a new controller here because lazy mode aborts currently active ones
                connCtrl = new AbortControllerImpl();
                const unlistenDispose = client.onDispose(() => connCtrl.abort());
                connCtrl.signal.addEventListener('abort', () => {
                    unlistenDispose();
                    conn = undefined;
                });
                const url = typeof options.url === 'function'
                    ? await options.url()
                    : options.url;
                if (connCtrl.signal.aborted)
                    throw new Error('Connection aborted by the client');
                const headers = typeof options.headers === 'function'
                    ? await options.headers()
                    : (_a = options.headers) !== null && _a !== void 0 ? _a : {};
                if (connCtrl.signal.aborted)
                    throw new Error('Connection aborted by the client');
                let res;
                try {
                    res = await fetchFn(url, {
                        signal: connCtrl.signal,
                        method: 'PUT',
                        credentials,
                        referrer,
                        referrerPolicy,
                        headers,
                    });
                }
                catch (err) {
                    throw new NetworkError(err);
                }
                if (res.status !== 201)
                    throw new NetworkError(res);
                const token = await res.text();
                headers[common_1.TOKEN_HEADER_KEY] = token;
                const connected = await connect({
                    signal: connCtrl.signal,
                    headers,
                    credentials,
                    referrer,
                    referrerPolicy,
                    url,
                    fetchFn,
                    onMessage,
                });
                retryingErr = null; // future connects are not retries
                retries = 0; // reset the retries on connect
                connected.waitForThrow().catch(() => (conn = undefined));
                return connected;
            })()));
        }
        catch (err) {
            // whatever problem happens during connect means the connection was not established
            conn = undefined;
            throw err;
        }
    }
    // non-lazy mode always holds one lock to persist the connection
    if (singleConnection && !lazy) {
        (async () => {
            locks++;
            for (;;) {
                try {
                    const { waitForThrow } = await getOrConnect();
                    await waitForThrow();
                }
                catch (err) {
                    if (client.disposed)
                        return;
                    // all non-network errors are worth reporting immediately
                    if (!(err instanceof NetworkError))
                        return onNonLazyError === null || onNonLazyError === void 0 ? void 0 : onNonLazyError(err);
                    // was a network error, get rid of the current connection to ensure retries
                    conn = undefined;
                    // retries are not allowed or we tried to many times, report error
                    if (!retryAttempts || retries >= retryAttempts)
                        return onNonLazyError === null || onNonLazyError === void 0 ? void 0 : onNonLazyError(err);
                    // try again
                    retryingErr = err;
                }
            }
        })();
    }
    return {
        subscribe(request, sink) {
            if (!singleConnection) {
                // distinct connections mode
                const control = new AbortControllerImpl();
                const unlisten = client.onDispose(() => {
                    unlisten();
                    control.abort();
                });
                (async () => {
                    var e_1, _a;
                    var _b;
                    let retryingErr = null, retries = 0;
                    for (;;) {
                        try {
                            if (retryingErr) {
                                await retry(retries);
                                // connection might've been aborted while waiting for retry
                                if (control.signal.aborted)
                                    throw new Error('Connection aborted by the client');
                                retries++;
                            }
                            const url = typeof options.url === 'function'
                                ? await options.url()
                                : options.url;
                            if (control.signal.aborted)
                                throw new Error('Connection aborted by the client');
                            const headers = typeof options.headers === 'function'
                                ? await options.headers()
                                : (_b = options.headers) !== null && _b !== void 0 ? _b : {};
                            if (control.signal.aborted)
                                throw new Error('Connection aborted by the client');
                            const { getResults } = await connect({
                                signal: control.signal,
                                headers,
                                credentials,
                                referrer,
                                referrerPolicy,
                                url,
                                body: JSON.stringify(request),
                                fetchFn,
                                onMessage,
                            });
                            retryingErr = null; // future connects are not retries
                            retries = 0; // reset the retries on connect
                            try {
                                for (var _c = (e_1 = void 0, __asyncValues(getResults())), _d; _d = await _c.next(), !_d.done;) {
                                    const result = _d.value;
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    sink.next(result);
                                }
                            }
                            catch (e_1_1) { e_1 = { error: e_1_1 }; }
                            finally {
                                try {
                                    if (_d && !_d.done && (_a = _c.return)) await _a.call(_c);
                                }
                                finally { if (e_1) throw e_1.error; }
                            }
                            return control.abort();
                        }
                        catch (err) {
                            if (control.signal.aborted)
                                return;
                            // all non-network errors are worth reporting immediately
                            if (!(err instanceof NetworkError))
                                throw err;
                            // retries are not allowed or we tried to many times, report error
                            if (!retryAttempts || retries >= retryAttempts)
                                throw err;
                            // try again
                            retryingErr = err;
                        }
                    }
                })()
                    .then(() => sink.complete())
                    .catch((err) => sink.error(err));
                return () => control.abort();
            }
            // single connection mode
            locks++;
            const control = new AbortControllerImpl();
            const unlisten = client.onDispose(() => {
                unlisten();
                control.abort();
            });
            (async () => {
                var e_2, _a;
                const operationId = generateID();
                request = Object.assign(Object.assign({}, request), { extensions: Object.assign(Object.assign({}, request.extensions), { operationId }) });
                let complete = null;
                for (;;) {
                    complete = null;
                    try {
                        const { url, headers, getResults } = await getOrConnect();
                        let res;
                        try {
                            res = await fetchFn(url, {
                                signal: control.signal,
                                method: 'POST',
                                credentials,
                                referrer,
                                referrerPolicy,
                                headers,
                                body: JSON.stringify(request),
                            });
                        }
                        catch (err) {
                            throw new NetworkError(err);
                        }
                        if (res.status !== 202)
                            throw new NetworkError(res);
                        complete = async () => {
                            let res;
                            try {
                                const control = new AbortControllerImpl();
                                const unlisten = client.onDispose(() => {
                                    unlisten();
                                    control.abort();
                                });
                                res = await fetchFn(url + '?operationId=' + operationId, {
                                    signal: control.signal,
                                    method: 'DELETE',
                                    credentials,
                                    referrer,
                                    referrerPolicy,
                                    headers,
                                });
                            }
                            catch (err) {
                                throw new NetworkError(err);
                            }
                            if (res.status !== 200)
                                throw new NetworkError(res);
                        };
                        try {
                            for (var _b = (e_2 = void 0, __asyncValues(getResults({
                                signal: control.signal,
                                operationId,
                            }))), _c; _c = await _b.next(), !_c.done;) {
                                const result = _c.value;
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                sink.next(result);
                            }
                        }
                        catch (e_2_1) { e_2 = { error: e_2_1 }; }
                        finally {
                            try {
                                if (_c && !_c.done && (_a = _b.return)) await _a.call(_b);
                            }
                            finally { if (e_2) throw e_2.error; }
                        }
                        complete = null; // completed by the server
                        return control.abort();
                    }
                    catch (err) {
                        if (control.signal.aborted)
                            return await (complete === null || complete === void 0 ? void 0 : complete());
                        // all non-network errors are worth reporting immediately
                        if (!(err instanceof NetworkError))
                            throw err;
                        // was a network error, get rid of the current connection to ensure retries
                        // but only if the client is running in lazy mode (otherwise the non-lazy lock will get rid of the connection)
                        if (lazy) {
                            conn = undefined;
                        }
                        // retries are not allowed or we tried to many times, report error
                        if (!retryAttempts || retries >= retryAttempts)
                            throw err;
                        // try again
                        retryingErr = err;
                    }
                    finally {
                        // release lock if subscription is aborted
                        if (control.signal.aborted && --locks === 0) {
                            if (isFinite(lazyCloseTimeout) && lazyCloseTimeout > 0) {
                                // allow for the specified calmdown time and then close the
                                // connection, only if no lock got created in the meantime and
                                // if the connection is still open
                                setTimeout(() => {
                                    if (!locks)
                                        connCtrl.abort();
                                }, lazyCloseTimeout);
                            }
                            else {
                                // otherwise close immediately
                                connCtrl.abort();
                            }
                        }
                    }
                }
            })()
                .then(() => sink.complete())
                .catch((err) => sink.error(err));
            return () => control.abort();
        },
        dispose() {
            client.dispose();
        },
    };
}
exports.createClient = createClient;
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
class NetworkError extends Error {
    constructor(msgOrErrOrResponse) {
        let message, response;
        if (isResponseLike(msgOrErrOrResponse)) {
            response = msgOrErrOrResponse;
            message =
                'Server responded with ' +
                    msgOrErrOrResponse.status +
                    ': ' +
                    msgOrErrOrResponse.statusText;
        }
        else if (msgOrErrOrResponse instanceof Error)
            message = msgOrErrOrResponse.message;
        else
            message = String(msgOrErrOrResponse);
        super(message);
        this.name = this.constructor.name;
        this.response = response;
    }
}
exports.NetworkError = NetworkError;
function isResponseLike(val) {
    return ((0, utils_1.isObject)(val) &&
        typeof val['ok'] === 'boolean' &&
        typeof val['status'] === 'number' &&
        typeof val['statusText'] === 'string');
}
async function connect(options) {
    const { signal, url, credentials, headers, body, referrer, referrerPolicy, fetchFn, onMessage, } = options;
    const waiting = {};
    const queue = {};
    let res;
    try {
        res = await fetchFn(url, {
            signal,
            method: body ? 'POST' : 'GET',
            // @ts-ignore
            reactNative: { textStreaming: true },
            credentials,
            referrer,
            referrerPolicy,
            headers: Object.assign(Object.assign({}, headers), { accept: 'text/event-stream' }),
            body,
        });
    }
    catch (err) {
        throw new NetworkError(err);
    }
    if (!res.ok)
        throw new NetworkError(res);
    if (!res.body)
        throw new Error('Missing response body');
    let error = null;
    let waitingForThrow;
    (async () => {
        var e_3, _a;
        var _b;
        try {
            const parse = (0, parser_1.createParser)();
            try {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                for (var _c = __asyncValues(toAsyncIterator(res.body)), _d; _d = await _c.next(), !_d.done;) {
                    const chunk = _d.value;
                    if (typeof chunk === 'string')
                        throw (error = new Error(`Unexpected string chunk "${chunk}"`)); // set error as fatal indicator
                    // read chunk and if messages are ready, yield them
                    let msgs;
                    try {
                        msgs = parse(chunk);
                    }
                    catch (err) {
                        throw (error = err); // set error as fatal indicator
                    }
                    if (!msgs)
                        continue;
                    for (const msg of msgs) {
                        try {
                            onMessage === null || onMessage === void 0 ? void 0 : onMessage(msg);
                        }
                        catch (err) {
                            throw (error = err); // set error as fatal indicator
                        }
                        const operationId = msg.data && 'id' in msg.data
                            ? msg.data.id // StreamDataForID
                            : ''; // StreamData
                        if (!(operationId in queue))
                            queue[operationId] = [];
                        switch (msg.event) {
                            case 'next':
                                if (operationId)
                                    queue[operationId].push(msg.data.payload);
                                else
                                    queue[operationId].push(msg.data);
                                break;
                            case 'complete':
                                queue[operationId].push('complete');
                                break;
                            default:
                                throw (error = new Error(`Unexpected message event "${msg.event}"`)); // set error as fatal indicator
                        }
                        (_b = waiting[operationId]) === null || _b === void 0 ? void 0 : _b.proceed();
                    }
                }
            }
            catch (e_3_1) { e_3 = { error: e_3_1 }; }
            finally {
                try {
                    if (_d && !_d.done && (_a = _c.return)) await _a.call(_c);
                }
                finally { if (e_3) throw e_3.error; }
            }
            // some browsers (like Safari) closes the connection without errors even on abrupt server shutdowns,
            // we therefore make sure that no stream is active and waiting for results (not completed)
            if (Object.keys(waiting).length) {
                throw new Error('Connection closed while having active streams');
            }
        }
        catch (err) {
            if (!error && Object.keys(waiting).length) {
                // we assume the error is most likely a NetworkError because there are listeners waiting for events.
                // additionally, the `error` is another indicator because we set it early if the error is considered fatal
                error = new NetworkError(err);
            }
            else {
                error = err;
            }
            waitingForThrow === null || waitingForThrow === void 0 ? void 0 : waitingForThrow(error);
        }
        finally {
            Object.values(waiting).forEach(({ proceed }) => proceed());
        }
    })();
    return {
        url,
        headers,
        waitForThrow: () => new Promise((_, reject) => {
            if (error)
                return reject(error);
            waitingForThrow = reject;
        }),
        getResults(options) {
            var _a;
            return __asyncGenerator(this, arguments, function* getResults_1() {
                const { signal, operationId = '' } = options !== null && options !== void 0 ? options : {};
                // operationId === '' ? StreamData : StreamDataForID
                try {
                    for (;;) {
                        while ((_a = queue[operationId]) === null || _a === void 0 ? void 0 : _a.length) {
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            const result = queue[operationId].shift();
                            if (result === 'complete')
                                return yield __await(void 0);
                            yield yield __await(result);
                        }
                        if (error)
                            throw error;
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            throw new Error('Getting results aborted by the client');
                        yield __await(new Promise((resolve) => {
                            const proceed = () => {
                                signal === null || signal === void 0 ? void 0 : signal.removeEventListener('abort', proceed);
                                delete waiting[operationId];
                                resolve();
                            };
                            signal === null || signal === void 0 ? void 0 : signal.addEventListener('abort', proceed);
                            waiting[operationId] = { proceed };
                        }));
                    }
                }
                finally {
                    delete queue[operationId];
                }
            });
        },
    };
}
/** Isomorphic ReadableStream to AsyncIterator converter. */
function toAsyncIterator(val) {
    // node stream is already async iterable
    if (typeof Object(val)[Symbol.asyncIterator] === 'function') {
        val = val;
        return val[Symbol.asyncIterator]();
    }
    // convert web stream to async iterable
    return (function () {
        return __asyncGenerator(this, arguments, function* () {
            const reader = val.getReader();
            let result;
            do {
                result = yield __await(reader.read());
                if (result.value !== undefined)
                    yield yield __await(result.value);
            } while (!result.done);
        });
    })();
}
