"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.json = void 0;
const json5_1 = __importDefault(require("json5"));
/**
 * this expects that a response includes json codeBlocks. Each codeBlock will be evaluated into a usuable JSON object which will be
 * made accessible in the chat locals as $blocks.
 */
const json = ({ blocks, errorPrompt, exact } = { blocks: 1, exact: true }) => {
    const handler = ({ response, chat }) => {
        return new Promise((resolve, expect) => {
            if (response.codeBlocks === undefined) {
                expect(errorPrompt || "1 or more json code blocks were expected in the response e.g. ```json /** ... */```");
                return;
            }
            const _blocks = [];
            let blockNumber = 1;
            for (const { lang, code } of response.codeBlocks) {
                if (lang !== "json")
                    continue;
                let json = {};
                try {
                    json = json5_1.default.parse(code);
                    _blocks.push(json);
                    blockNumber += 1;
                }
                catch (error) {
                    expect(`could not JSON.parse code block #${blockNumber}. Error details: ${error} - please update the code block`);
                    return;
                }
            }
            if (_blocks.length === 0) {
                return expect(errorPrompt || "1 or more json code blocks are expected in the response e.g. ```json /** ... */```");
            }
            else if (_blocks.length !== blocks && exact) {
                const was_or_were = blocks === 1 ? "was" : "were";
                const _was_or_were = _blocks.length === 1 ? "was" : "were";
                return expect(`${blocks} json code block(s) ${was_or_were} expected but ${_blocks.length} ${_was_or_were} in the response`);
            }
            else {
                chat.locals.$blocks = blocks === 1 ? _blocks[0] : _blocks;
            }
            resolve();
        });
    };
    return handler;
};
exports.json = json;
