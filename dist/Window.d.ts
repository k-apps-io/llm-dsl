import { Chat } from "./Chat";
/**
* An enum representing the different visibility statuses a message can hold.
* @enum {number}
*/
export declare enum Visibility {
    /**
     * This is the default option.
     * It represents a message that can be excluded from the context window. This exclusion
     * would be implemneted in a Window function.
     */
    OPTIONAL = 0,
    /**
     * same as optional however the message is tagged as a system level message. This
     * may be helpful for messages that are system level e.g. a function resopnse a user may n
     */
    SYSTEM = 1,
    REQUIRED = 2,
    EXCLUDE = 3
}
interface WindowOptions {
    messages: Chat<any>["messages"];
    tokenLimit: number;
}
export type Window = (options: WindowOptions) => Chat<any>["messages"];
interface LatestWindowOptions {
    /**
     * the number of messages to include in the window starting from the end of the message
     * history
     */
    max: number;
}
/**
 * A Window strategy that will include the latest messages in the Window up to the defined amount. This does
 * not consider the token limit, keys or visibility.
 */
export declare const latest: ({ max }: LatestWindowOptions) => Window;
/**
 * A Window strategy that accounts for keys, visiblity and a token limit for the window
 *
 * Messages with keys will be reduced to the latest Message of the maintaining the position of the latest Message.
 *
 * Visibility is accounted for, all REQUIRED will be included in the window maintaining relative position.
 * All but EXCLUDED messages are then evaluated to fill the window up to the token limit. These messages
 * are evaluted in descending order and will maintain relative positioning.
 */
export declare const main: Window;
export {};
