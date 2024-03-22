"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCodeBlock = exports.extract = void 0;
const ebnf_1 = require("ebnf");
const grammar = `
message     ::= TEXT* WS* ( block ) WS* TEXT* WS* message*  /* Represents a message with zero or more blocks */
block       ::= "\`\`\`" lang WS* code WS* "\`\`\`"         /* Represents a code block with language specification */
lang        ::= [\\w]+                                      /* Matches a sequence of word characters for language */
code        ::= TEXT*                                       /* Represents the content of a code block */
WS          ::= [#x20#x09#x0A#x0D]+                         /* Space | Tab | \\n | \\r - Matches one or more whitespace characters */
TEXT        ::= [^\`] | "\`" [^\`]                          /* Any character except a backtick or a backtick not followed by another backtick */
`;
const parser = new ebnf_1.Grammars.W3C.Parser(grammar);
const collect = (token) => {
    return token.children.flatMap(child => {
        if (child.type === "message")
            return collect(child);
        return child.children.reduce((prev, curr) => {
            prev[curr.type] = curr.text.trim();
            return prev;
        }, {});
    });
};
const extract = (text) => {
    const token = parser.getAST(text);
    if (token === null)
        return [];
    const blocks = collect(token);
    return blocks;
};
exports.extract = extract;
const toCodeBlock = (lang, value) => {
    if (lang.toLowerCase() === "json" && typeof value === "object")
        value = JSON.stringify(value, null, 2);
    return `\`\`\`${lang}\n${value}\`\`\`\n`;
};
exports.toCodeBlock = toCodeBlock;
exports.default = exports.extract;
