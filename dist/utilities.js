"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoopError = exports.detectLoop = void 0;
/**
 * Detects a loop in an array of string values.
 *
 * @param arr An array of string values to search for a loop.
 * @param window The size of the window to consider when detecting a pattern. Default is 2.
 * @param max The maximum allowed occurrences of a pattern before considering it as a loop. Default is 1.
 * @returns An object of type {@link Result} containing information about the result of the loop detection.
 */
const detectLoop = (arr, window = 2, max = 1) => {
    const data = arr
        .map((_, index, $array) => index <= arr.length - window + 1 ? $array.slice(index, index + window).join("") : null)
        .filter(v => v !== null)
        .reduce((prev, curr, pos) => {
        const index = prev.findIndex(({ key }) => key === curr);
        if (index === -1) {
            prev.push({ key: curr, count: 1, occurrences: [pos] });
        }
        else {
            prev[index].count += 1;
            prev[index].occurrences.push(pos);
        }
        return prev;
    }, []);
    const index = data.findIndex(({ count }) => count > max);
    if (index === -1) {
        return { loop: false };
    }
    else {
        const item = data[index];
        return { loop: true, pattern: arr.slice(index, index + window), count: item.count, occurrences: item.occurrences };
    }
};
exports.detectLoop = detectLoop;
class LoopError extends Error {
    pattern;
    count;
    occurrences;
    constructor({ loop, pattern, count, occurrences }) {
        super("a loop was detected");
        this.pattern = pattern;
        this.count = count;
        this.occurrences = occurrences;
        // Ensure stack trace is captured
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, LoopError);
        }
    }
    toString() {
        return `${this.name}: ${this.message} ${JSON.stringify({ count: this.count, pattern: this.pattern, occurrences: this.occurrences })}`;
    }
}
exports.LoopError = LoopError;
