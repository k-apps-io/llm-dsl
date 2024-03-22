"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.write = exports.stream = void 0;
const fs_1 = require("fs");
const stream = ({ directory, filename }) => {
    const fileStream = (0, fs_1.createWriteStream)(`${directory}/${filename}.log`, { encoding: "utf-8" });
    const handler = (chunk) => {
        if (chunk.type === "chat" || chunk.type === "sidebar") {
            fileStream?.write(`// chat: ${chunk.id} - ${chunk.state}\n`);
            if (chunk.state === "closed")
                fileStream.end();
        }
        if (chunk.type === "command")
            fileStream.write(`${chunk.content}\n`);
        if ((chunk.type === "message" && chunk.state === "streaming"))
            fileStream.write(chunk.content);
        if ((chunk.type === "message" && chunk.state === "final"))
            fileStream.write(`\n`);
        if (chunk.type === "error")
            fileStream.write(chunk.error);
    };
    return handler;
};
exports.stream = stream;
const write = ({ directory, chat, filename }) => {
    filename = `${directory}/${filename ? filename : chat.data.id}.json`;
    (0, fs_1.writeFileSync)(filename, JSON.stringify(chat.data, null, 2));
};
exports.write = write;
