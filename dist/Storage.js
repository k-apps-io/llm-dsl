"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoStorage = exports.LocalStorage = void 0;
const fs_1 = require("fs");
const util_1 = require("util");
const write = (0, util_1.promisify)(fs_1.writeFile);
const read = (0, util_1.promisify)(fs_1.readFile);
exports.LocalStorage = {
    getById: (id) => {
        return new Promise((resolve, reject) => {
            read(`${process.env.CHATS_DIR}/${id}.json`)
                .then(content => {
                const chat = JSON.parse(content.toString());
                resolve(chat);
            })
                .catch(reject);
        });
    },
    save: (chat) => {
        return new Promise((resolve, reject) => {
            write(`${process.env.CHATS_DIR}/${chat.id}.json`, JSON.stringify(chat, null, 4))
                .then(resolve)
                .catch(reject);
        });
    }
};
exports.NoStorage = {
    getById: function (id) {
        throw 'Not Implemented - Choose an alternative storage engine';
    },
    save: function (chat) {
        return new Promise((resolve, reject) => resolve());
    }
};
