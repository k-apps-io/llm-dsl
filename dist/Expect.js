"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.json = void 0;
const json5_1 = __importDefault(require("json5"));
const json = (options = { blocks: 1 }) => {
    const { blocks } = options;
    const handler = ({ response, locals, chat }) => {
        return new Promise((resolve, expect) => {
            if (response.codeBlocks === undefined) {
                expect("1 or more json code blocks were expected e.g. ```json /** ... */```");
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
                return expect(`no JSON code blocks were found in the response`);
            }
            else if (_blocks.length !== blocks) {
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
