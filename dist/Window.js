"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = exports.latest = exports.Visibility = void 0;
/**
* An enum representing the different visibility statuses a message can hold.
* @enum {number}
*/
var Visibility;
(function (Visibility) {
    /**
     * This is the default option.
     * It represents a message that can be excluded from the context window. This exclusion
     * would be implemneted in a Window function.
     */
    Visibility[Visibility["OPTIONAL"] = 0] = "OPTIONAL";
    /**
     * same as optional however the message is tagged as a system level message. This
     * may be helpful for messages that are system level e.g. a function resopnse a user may n
     */
    Visibility[Visibility["SYSTEM"] = 1] = "SYSTEM";
    Visibility[Visibility["REQUIRED"] = 2] = "REQUIRED";
    Visibility[Visibility["EXCLUDE"] = 3] = "EXCLUDE"; // will be removed from the context window
})(Visibility || (exports.Visibility = Visibility = {}));
/**
 * A Window strategy that will include the latest messages in the Window up to the defined amount. This does
 * not consider the token limit, keys or visibility.
 */
const latest = ({ max }) => {
    const reduce = ({ messages }) => {
        if (max <= 0)
            throw `max must greater than 0, received ${max}`;
        return messages.slice(-max);
    };
    return reduce;
};
exports.latest = latest;
/**
 * A Window strategy that accounts for keys, visiblity and a token limit for the window
 *
 * Messages with keys will be reduced to the latest Message of the maintaining the position of the latest Message.
 *
 * Visibility is accounted for, all REQUIRED will be included in the window maintaining relative position.
 * All but EXCLUDED messages are then evaluated to fill the window up to the token limit. These messages
 * are evaluted in descending order and will maintain relative positioning.
 */
const main = ({ messages, tokenLimit }) => {
    const _messages = messages
        // reduce to the latest keys
        .reduce((prev, curr) => {
        if (curr.key !== undefined) {
            const prevIndex = prev.map(p => p.key).indexOf(curr.key);
            // remove the preivous key
            if (prevIndex > -1)
                prev.splice(prevIndex, 1);
        }
        prev.push(curr);
        return prev;
    }, []);
    // identify the required messages and their position
    const required = _messages
        .map((message, index) => ({ index, message }))
        .filter(m => m.message.visibility === Visibility.REQUIRED);
    tokenLimit -= required.reduce((total, curr) => total + curr.message.size, 0);
    // build the window
    const _window = [
        ...required,
        ..._messages
            // including the index for relative positioning
            .map((message, index) => ({ index, message }))
            .filter(m => m.message.visibility === Visibility.OPTIONAL || m.message.visibility === Visibility.SYSTEM)
            // sort in descending order ( latest messages first)
            .sort((a, b) => b.index - a.index)
            // reduce the messages to be within the tokenLimit
            .reduce((prev, curr) => {
            const tokens = prev.reduce((total, c) => total + c.message.size, 0);
            if (curr.message.size + tokens <= tokenLimit)
                prev.push(curr);
            return prev;
        }, [])
    ];
    return _window
        // sort by the relative position
        .sort((a, b) => a.index - b.index)
        .map(({ message }) => message);
};
exports.main = main;
