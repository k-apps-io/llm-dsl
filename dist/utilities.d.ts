type OK = {
    loop: false;
};
type NotOK = {
    loop: true;
    pattern: string[];
    count: number;
    occurrences: number[];
};
type Result = OK | NotOK;
/**
 * Detects a loop in an array of string values.
 *
 * @param arr An array of string values to search for a loop.
 * @param window The size of the window to consider when detecting a pattern. Default is 2.
 * @param max The maximum allowed occurrences of a pattern before considering it as a loop. Default is 1.
 * @returns An object of type {@link Result} containing information about the result of the loop detection.
 */
export declare const detectLoop: (arr: string[], window?: number, max?: number) => Result;
export declare class LoopError extends Error {
    pattern: string[];
    count: number;
    occurrences: number[];
    constructor({ loop, pattern, count, occurrences }: NotOK);
    toString(): string;
}
export {};
