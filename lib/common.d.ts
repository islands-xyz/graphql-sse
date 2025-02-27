/**
 *
 * common
 *
 */
import type { DocumentNode, GraphQLError } from 'graphql';
/**
 * Header key through which the event stream token is transmitted
 * when using the client in "single connection mode".
 *
 * Read more: https://github.com/enisdenjo/graphql-sse/blob/master/PROTOCOL.md#single-connection-mode
 *
 * @category Common
 */
export declare const TOKEN_HEADER_KEY: "x-graphql-event-stream-token";
/**
 * URL query parameter key through which the event stream token is transmitted
 * when using the client in "single connection mode".
 *
 * Read more: https://github.com/enisdenjo/graphql-sse/blob/master/PROTOCOL.md#single-connection-mode
 *
 * @category Common
 */
export declare const TOKEN_QUERY_KEY: "token";
/**
 * Parameters for GraphQL's request for execution.
 *
 * Reference: https://github.com/graphql/graphql-over-http/blob/main/spec/GraphQLOverHTTP.md#request
 *
 * @category Common
 */
export interface RequestParams {
    operationName?: string | undefined;
    query: DocumentNode | string;
    variables?: Record<string, unknown> | undefined;
    extensions?: Record<string, unknown> | undefined;
}
/**
 * Represents a message in an event stream.
 *
 * Read more: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#Event_stream_format
 *
 * @category Common
 */
export interface StreamMessage<ForID extends boolean, E extends StreamEvent> {
    event: E;
    data: ForID extends true ? StreamDataForID<E> : StreamData<E>;
}
/** @category Common */
export declare type StreamEvent = 'next' | 'complete';
/** @category Common */
export declare function validateStreamEvent(e: unknown): StreamEvent;
/** @category Common */
export interface ExecutionResult<Data = Record<string, unknown>, Extensions = Record<string, unknown>> {
    errors?: ReadonlyArray<GraphQLError>;
    data?: Data | null;
    hasNext?: boolean;
    extensions?: Extensions;
}
/** @category Common */
export interface ExecutionPatchResult<Data = unknown, Extensions = Record<string, unknown>> {
    errors?: ReadonlyArray<GraphQLError>;
    data?: Data | null;
    path?: ReadonlyArray<string | number>;
    label?: string;
    hasNext: boolean;
    extensions?: Extensions;
}
/** @category Common */
export declare type StreamData<E extends StreamEvent> = E extends 'next' ? ExecutionResult | ExecutionPatchResult : E extends 'complete' ? null : never;
/** @category Common */
export declare type StreamDataForID<E extends StreamEvent> = E extends 'next' ? {
    id: string;
    payload: ExecutionResult | ExecutionPatchResult;
} : E extends 'complete' ? {
    id: string;
} : never;
/** @category Common */
export declare function parseStreamData<ForID extends boolean, E extends StreamEvent>(e: E, data: string): ForID extends true ? StreamDataForID<E> : StreamData<E>;
/**
 * A representation of any set of values over any amount of time.
 *
 * @category Common
 */
export interface Sink<T = unknown> {
    /** Next value arriving. */
    next(value: T): void;
    /** An error that has occured. This function "closes" the sink. */
    error(error: unknown): void;
    /** The sink has completed. This function "closes" the sink. */
    complete(): void;
}
