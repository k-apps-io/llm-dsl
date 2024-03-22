"use strict";
// https://stackoverflow.com/questions/77168202/calculating-total-tokens-for-api-request-to-chatgpt-including-functions
Object.defineProperty(exports, "__esModule", { value: true });
exports.key = exports.latest = void 0;
const latest = ({ max }) => {
    const reduce = ({ messages }) => {
        if (max <= 0)
            throw `max must greater than 0, received ${max}`;
        return messages.slice(-max);
    };
    return reduce;
};
exports.latest = latest;
const key = ({ messages, tokenLimit }) => {
    let tokenCount = 0;
    return messages
        // reduce to the latest keys
        .reduce((prev, curr) => {
        if (curr.key !== undefined) {
            const prevIndex = prev.map(p => p.key).indexOf(curr.key);
            // remove the preivous key
            if (prevIndex > -1)
                prev.splice(prevIndex);
        }
        // add the message
        prev.push(curr);
        return prev;
    }, [])
        .reduce((prev, curr) => {
        if (tokenCount + curr.size < tokenLimit) {
            prev.push(curr);
            tokenLimit += curr.size;
        }
        return prev;
    }, []);
};
exports.key = key;
