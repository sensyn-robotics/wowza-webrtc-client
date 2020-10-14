export declare const isMobileBrowser: () => boolean;
export declare const cnsl: {
    log: (...args: any) => void;
    warn: (...args: any) => void;
    error: (...args: any) => void;
    info: (...args: any) => void;
};
export default interface CancellablePromise<T> extends Promise<T> {
    cancel(): void;
}
export declare type Resolver<T> = (o?: T) => void;
export declare type Rejector = (error?: Error) => void;
export declare type Canceller = (callme?: () => void) => void;
export declare type Executor<T> = (resolver: Resolver<T>, rejector: Rejector, defineCanceller: Canceller) => void;
export declare const cancellable: <T>(executor: Executor<T>) => CancellablePromise<T>;
export declare const supportGetUserMedia: () => boolean;
/**
 * Query user media stream from navigator object.
 *
 * @param constraints
 */
export declare const getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
/**
 * Query user media stream from navigator object.
 *
 * @param constraints
 */
export declare const getDisplayMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
/**
 * Query browser for Camera device based on given constraints
 *
 * @param constraints
 */
export declare const queryForCamera: (constraints: MediaStreamConstraints) => Promise<boolean>;
/**
 * Return a well established WebSocket connection.
 *
 * Resolved only when onopen is emitted.
 * Reject when onclose is emitted.
 *
 * @param wsURL
 * @return WebSocket instance.
 */
export declare const createWebSocket: (wsURL: string) => Promise<WebSocket>;
