/**
 *
 * handler
 *
 */
/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'http';
import { ExecutionArgs, GraphQLSchema, validate as graphqlValidate } from 'graphql';
import { RequestParams, ExecutionResult, ExecutionPatchResult } from './common';
/**
 * A concrete GraphQL execution context value type.
 *
 * Mainly used because TypeScript collapes unions
 * with `any` or `unknown` to `any` or `unknown`. So,
 * we use a custom type to allow definitions such as
 * the `context` server option.
 *
 * @category Server
 */
export declare type ExecutionContext = object | symbol | number | string | boolean | undefined | null;
/** @category Server */
export declare type OperationResult = Promise<AsyncGenerator<ExecutionResult | ExecutionPatchResult> | AsyncIterable<ExecutionResult | ExecutionPatchResult> | ExecutionResult> | AsyncGenerator<ExecutionResult | ExecutionPatchResult> | AsyncIterable<ExecutionResult | ExecutionPatchResult> | ExecutionResult;
/** @category Server */
export interface HandlerOptions<Request extends IncomingMessage = IncomingMessage, Response extends ServerResponse = ServerResponse> {
    /**
     * The GraphQL schema on which the operations will
     * be executed and validated against.
     *
     * If a function is provided, it will be called on every
     * subscription request allowing you to manipulate schema
     * dynamically.
     *
     * If the schema is left undefined, you're trusted to
     * provide one in the returned `ExecutionArgs` from the
     * `onSubscribe` callback.
     */
    schema?: GraphQLSchema | ((req: Request, args: Omit<ExecutionArgs, 'schema'>) => Promise<GraphQLSchema> | GraphQLSchema);
    /**
     * A value which is provided to every resolver and holds
     * important contextual information like the currently
     * logged in user, or access to a database.
     *
     * Note that the context function is invoked on each operation only once.
     * Meaning, for subscriptions, only at the point of initialising the subscription;
     * not on every subscription event emission. Read more about the context lifecycle
     * in subscriptions here: https://github.com/graphql/graphql-js/issues/894.
     */
    context?: ExecutionContext | ((req: Request, args: ExecutionArgs) => Promise<ExecutionContext> | ExecutionContext);
    /**
     * A custom GraphQL validate function allowing you to apply your
     * own validation rules.
     */
    validate?: typeof graphqlValidate;
    /**
     * Is the `execute` function from GraphQL which is
     * used to execute the query and mutation operations.
     */
    execute?: (args: ExecutionArgs) => OperationResult;
    /**
     * Is the `subscribe` function from GraphQL which is
     * used to execute the subscription operation.
     */
    subscribe?: (args: ExecutionArgs) => OperationResult;
    /**
     * Authenticate the client. Returning a string indicates that the client
     * is authenticated and the request is ready to be processed.
     *
     * A token of type string MUST be supplied; if there is no token, you may
     * return an empty string (`''`);
     *
     * If you want to respond to the client with a custom status or body,
     * you should do so using the provided `res` argument which will stop
     * further execution.
     *
     * @default 'req.headers["x-graphql-event-stream-token"] || req.url.searchParams["token"] || generateRandomUUID()' // https://gist.github.com/jed/982883
     */
    authenticate?: (req: Request, res: Response) => Promise<string | undefined | void> | string | undefined | void;
    /**
     * Called when a new event stream is connecting BEFORE it is accepted.
     * By accepted, its meant the server responded with a 200 (OK), alongside
     * flushing the necessary event stream headers.
     *
     * If you want to respond to the client with a custom status or body,
     * you should do so using the provided `res` argument which will stop
     * further execution.
     */
    onConnecting?: (req: Request, res: Response) => Promise<void> | void;
    /**
     * Called when a new event stream has been succesfully connected and
     * accepted, and after all pending messages have been flushed.
     */
    onConnected?: (req: Request) => Promise<void> | void;
    /**
     * The subscribe callback executed right after processing the request
     * before proceeding with the GraphQL operation execution.
     *
     * If you return `ExecutionArgs` from the callback, it will be used instead of
     * trying to build one internally. In this case, you are responsible for providing
     * a ready set of arguments which will be directly plugged in the operation execution.
     *
     * Omitting the fields `contextValue` from the returned `ExecutionArgs` will use the
     * provided `context` option, if available.
     *
     * If you want to respond to the client with a custom status or body,
     * you should do so using the provided `res` argument which will stop
     * further execution.
     *
     * Useful for preparing the execution arguments following a custom logic. A typical
     * use-case is persisted queries. You can identify the query from the request parameters
     * and supply the appropriate GraphQL operation execution arguments.
     */
    onSubscribe?: (req: Request, res: Response, params: RequestParams) => Promise<ExecutionArgs | void> | ExecutionArgs | void;
    /**
     * Executed after the operation call resolves. For streaming
     * operations, triggering this callback does not necessarely
     * mean that there is already a result available - it means
     * that the subscription process for the stream has resolved
     * and that the client is now subscribed.
     *
     * The `OperationResult` argument is the result of operation
     * execution. It can be an iterator or already a value.
     *
     * Use this callback to listen for GraphQL operations and
     * execution result manipulation.
     *
     * If you want to respond to the client with a custom status or body,
     * you should do so using the provided `res` argument which will stop
     * further execution.
     *
     * First argument, the request, is always the GraphQL operation
     * request.
     */
    onOperation?: (req: Request, res: Response, args: ExecutionArgs, result: OperationResult) => Promise<OperationResult | void> | OperationResult | void;
    /**
     * Executed after an operation has emitted a result right before
     * that result has been sent to the client.
     *
     * Results from both single value and streaming operations will
     * invoke this callback.
     *
     * Use this callback if you want to format the execution result
     * before it reaches the client.
     *
     * First argument, the request, is always the GraphQL operation
     * request.
     */
    onNext?: (req: Request, args: ExecutionArgs, result: ExecutionResult | ExecutionPatchResult) => Promise<ExecutionResult | ExecutionPatchResult | void> | ExecutionResult | ExecutionPatchResult | void;
    /**
     * The complete callback is executed after the operation
     * has completed and the client has been notified.
     *
     * Since the library makes sure to complete streaming
     * operations even after an abrupt closure, this callback
     * will always be called.
     *
     * First argument, the request, is always the GraphQL operation
     * request.
     */
    onComplete?: (req: Request, args: ExecutionArgs) => Promise<void> | void;
    /**
     * Called when an event stream has disconnected right before the
     * accepting the stream.
     */
    onDisconnect?: (req: Request) => Promise<void> | void;
}
/**
 * The ready-to-use handler. Simply plug it in your favourite HTTP framework
 * and enjoy.
 *
 * Beware that the handler resolves only after the whole operation completes.
 * - If query/mutation, waits for result
 * - If subscription, waits for complete
 *
 * Errors thrown from **any** of the provided options or callbacks (or even due to
 * library misuse or potential bugs) will reject the handler's promise. They are
 * considered internal errors and you should take care of them accordingly.
 *
 * For production environments, its recommended not to transmit the exact internal
 * error details to the client, but instead report to an error logging tool or simply
 * the console. Roughly:
 *
 * ```ts
 * import http from 'http';
 * import { createHandler } from 'graphql-sse';
 *
 * const handler = createHandler({ ... });
 *
 * http.createServer(async (req, res) => {
 *   try {
 *     await handler(req, res);
 *   } catch (err) {
 *     console.error(err);
 *     // or
 *     Sentry.captureException(err);
 *
 *     if (!res.headersSent) {
 *       res.writeHead(500, 'Internal Server Error').end();
 *     }
 *   }
 * });
 * ```
 *
 * Note that some libraries, like fastify, parse the body before reaching the handler.
 * In such cases all request 'data' events are already consumed. Use this `body` argument
 * too pass in the read body and avoid listening for the 'data' events internally. Do
 * beware that the `body` argument will be consumed **only** if it's an object.
 *
 * @category Server
 */
export declare type Handler<Request extends IncomingMessage = IncomingMessage, Response extends ServerResponse = ServerResponse> = (req: Request, res: Response, body?: unknown) => Promise<void>;
/**
 * Makes a Protocol complient HTTP GraphQL server  handler. The handler can
 * be used with your favourite server library.
 *
 * Read more about the Protocol in the PROTOCOL.md documentation file.
 *
 * @category Server
 */
export declare function createHandler<Request extends IncomingMessage = IncomingMessage, Response extends ServerResponse = ServerResponse>(options: HandlerOptions<Request, Response>): Handler<Request, Response>;
export declare function isAsyncGenerator<T>(val: unknown): val is AsyncGenerator<T>;
