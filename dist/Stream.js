"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.localFileStorage = exports.localFileStream = void 0;
const fs_1 = require("fs");
/**
 * a stream handler that will write the stream the chat pipeline to a local file
 */
const localFileStream = ({ directory, filename, append, timestamps }) => {
    let id;
    let stage;
    let fileStream;
    const flags = append === undefined || append ? "a" : undefined;
    timestamps = timestamps ? true : false;
    const handler = (chunk) => {
        if (chunk.type === "chat" && chunk.state === "open") {
            fileStream = (0, fs_1.createWriteStream)(`${directory}/${filename || chunk.id}.log`, { encoding: "utf-8", flags: flags });
        }
        if (chunk.type === "chat" || chunk.type === "sidebar") {
            if (stage)
                fileStream.write(`\n// ${stage}: end`);
            fileStream?.write(`\n// ${chunk.type} - ${chunk.id}: ${chunk.state}`);
            if (chunk.state === "closed")
                return fileStream.end();
        }
        if (id === undefined || chunk.id !== id) {
            fileStream.write("\n");
            id = chunk.id;
        }
        if (chunk.type === "stage") {
            if (stage)
                fileStream.write(`\n// ${stage}: end`);
            stage = chunk.content;
            let line = `\n// ${stage}: begin`;
            if (timestamps)
                line += ` ${new Date()}`;
            fileStream.write(line);
        }
        if ((chunk.type === "message"))
            fileStream.write(chunk.content);
        if (chunk.type === "error")
            fileStream.write(String(chunk.error));
    };
    return handler;
};
exports.localFileStream = localFileStream;
/**
 * writes the chat to a local file using JSON.stringify. The file will be overwritten
 */
const localFileStorage = ({ directory, filename, chat, spaces, replacer }) => {
    filename = `${directory}/${filename ? filename : chat.data.id}.json`;
    (0, fs_1.writeFileSync)(filename, JSON.stringify(chat.data, replacer || null, spaces || 2));
};
exports.localFileStorage = localFileStorage;
