"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DSL = exports.LLM = void 0;
const json5_1 = __importDefault(require("json5"));
const lodash_1 = require("lodash");
const uuid_1 = require("uuid");
const Chat_1 = require("./Chat");
const CodeBlocks_1 = __importDefault(require("./CodeBlocks"));
const DEFAULT_SETTINGS = {
    contextWindowSize: 4000,
    minReponseSize: 400,
    maxCallStack: 10,
};
class LLM {
    constructor() { }
}
exports.LLM = LLM;
class DSL {
    llm;
    options;
    window;
    data;
    locals;
    rules = [];
    type = "chat";
    user = undefined;
    settings;
    functions = {};
    pipeline = [];
    pipelineCursor = -1; // manages current position in the pipeline
    streamHandlers;
    constructor({ llm, options, locals, metadata, settings, window }) {
        this.llm = llm;
        this.options = options;
        this.locals = locals || {};
        this.settings = { ...DEFAULT_SETTINGS, ...settings };
        this.streamHandlers = [];
        this.window = window;
        this.data = {
            id: (0, uuid_1.v4)(),
            messages: [],
            sidebars: [],
            metadata: metadata,
            size: 0
        };
    }
    /**
     *
     * @param options : the prompt options
     * @returns Promise<void>
     */
    _prompt($chat, options) {
        return () => new Promise(async (resolve, reject) => {
            const messageTokens = $chat.llm.tokens(options.message) + 3;
            const responseSize = (options.responseSize || $chat.settings.minReponseSize);
            const functions = Object.keys($chat.functions).map(k => $chat.functions[k]);
            const functionTokens = functions
                .map(({ name, description, parameters }) => {
                let tokenCount = 7; // 7 for each function to start
                tokenCount += $chat.llm.tokens(`${name}:${description}`);
                if (parameters) {
                    tokenCount += 3;
                    Object.keys(parameters.properties).forEach(key => {
                        tokenCount += 3;
                        const p_type = parameters.properties[key].type;
                        const p_desc = parameters.properties[key].description;
                        if (p_type === "enum") {
                            tokenCount += 3; // Add tokens if property has enum list
                            const options = parameters.properties[key].enum;
                            options.forEach((v) => {
                                tokenCount += 3;
                                tokenCount += $chat.llm.tokens(String(v));
                            });
                        }
                        tokenCount += $chat.llm.tokens(`${key}:${p_type}:${p_desc}"`);
                    });
                }
                return tokenCount;
            }).reduce((total, curr) => total + curr, 0);
            const limit = $chat.settings.contextWindowSize - responseSize - messageTokens - functionTokens;
            const messages = $chat.window({ messages: $chat.data.messages, tokenLimit: limit });
            const messageId = (0, uuid_1.v4)();
            const visibility = options.visibility !== undefined ? options.visibility : Chat_1.Visibility.OPTIONAL;
            const role = options.role || $chat.options.role || "user";
            const message = {
                id: messageId,
                role: role,
                content: options.message.replaceAll(/\n\s+(\w)/gmi, '\n$1').trim(),
                size: messageTokens,
                visibility: visibility,
                context: messages.map(({ id }) => id),
                user: $chat.user,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            $chat.data.messages.push(message);
            $chat.out({ ...message, chat: $chat.data.id, type: "message", state: "streaming" });
            $chat.out({ ...message, chat: $chat.data.id, type: "message", state: "final" });
            const _options = { ...$chat.options, ...options, responseSize, visibility };
            const stream = $chat.llm.stream({
                messages: [...messages.map(m => ({ prompt: m.content, role: m.role })), { prompt: options.message, role }],
                functions: functions,
                user: $chat.user,
                ..._options
            });
            let buffer = true;
            let isFunction = false;
            let response = "";
            const funcs = [];
            const responseId = (0, uuid_1.v4)();
            try {
                await (async () => {
                    for await (const chunk of stream) {
                        if (chunk.type === "function") {
                            const func = $chat.functions[chunk.name];
                            if (func !== undefined)
                                funcs.push({ ...func, args: chunk.arguments });
                            const content = `call: ${chunk.name}(${chunk.arguments})`;
                            const functionSize = $chat.llm.tokens(content);
                            const functionUuid = (0, uuid_1.v4)();
                            $chat.data.messages.push({
                                id: functionUuid,
                                role: "assistant",
                                content: content,
                                size: functionSize + 3,
                                visibility: Chat_1.Visibility.SYSTEM,
                                createdAt: new Date(),
                                updatedAt: new Date()
                            });
                            $chat.out({
                                type: "message",
                                state: "final",
                                role: "assistant",
                                content: content,
                                size: functionSize + 3,
                                chat: $chat.data.id,
                                id: functionUuid,
                                visibility: Chat_1.Visibility.SYSTEM
                            });
                        }
                        else if (buffer) {
                            response += chunk.content;
                            if (response.length >= 5) {
                                if (response.startsWith("call:")) {
                                    isFunction = true;
                                }
                                else {
                                    $chat.out({
                                        id: responseId,
                                        type: "message",
                                        state: "streaming",
                                        role: "assistant",
                                        content: response,
                                        chat: $chat.data.id,
                                        visibility: Chat_1.Visibility.OPTIONAL
                                    });
                                }
                                buffer = false;
                            }
                        }
                        else if (isFunction) {
                            response += chunk.content.trim();
                            const match = response.match(/call:\s(\w+?)\((.+?)\)/gi);
                            if (match) {
                                const name = match[1];
                                const args = match[2];
                                const func = $chat.functions[name];
                                if (func !== undefined)
                                    funcs.push({ ...func, args: args });
                                isFunction = false;
                                buffer = true;
                                const functionUuid = (0, uuid_1.v4)();
                                $chat.data.messages.push({
                                    id: functionUuid,
                                    role: "assistant",
                                    content: response,
                                    size: $chat.llm.tokens(response) + 3,
                                    visibility: Chat_1.Visibility.SYSTEM,
                                    createdAt: new Date(),
                                    updatedAt: new Date()
                                });
                                response = "";
                            }
                        }
                        else {
                            response += chunk.content;
                            $chat.out({
                                id: responseId,
                                type: "message",
                                state: "streaming",
                                role: "assistant",
                                content: chunk.content,
                                chat: $chat.data.id,
                                visibility: Chat_1.Visibility.OPTIONAL
                            });
                        }
                    }
                })();
            }
            catch (error) {
                reject(error);
                return;
            }
            if (response.trim() !== "") {
                const blocks = (0, CodeBlocks_1.default)(response);
                const responseSize = $chat.llm.tokens(response) + 3;
                $chat.data.messages.push({
                    id: responseId,
                    role: "assistant",
                    content: response,
                    size: responseSize,
                    visibility: Chat_1.Visibility.OPTIONAL,
                    codeBlocks: blocks.length > 0 ? blocks : undefined,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                $chat.out({
                    type: "message",
                    state: "final",
                    role: "assistant",
                    content: response,
                    size: responseSize,
                    chat: $chat.data.id,
                    id: responseId,
                    visibility: Chat_1.Visibility.OPTIONAL
                });
            }
            let position = 1;
            const currentCommand = $chat.pipeline[$chat.pipelineCursor].command;
            for (const func of funcs) {
                const { func: promise, parameters, name, args } = func;
                const calls = $chat.functions[name].calls;
                if (calls > 2 && currentCommand === name) {
                    reject(`Function Loop - function: ${name}`);
                    return;
                }
                $chat.functions[name].calls += 1;
                // todo error handling for args
                let params = {};
                try {
                    params = args !== "" ? json5_1.default.parse(args) : {};
                }
                catch (error) {
                    // todo log
                }
                const prompt = await promise({ ...params, locals: $chat.locals, chat: $chat });
                prompt.message = `here is the result of your call ${name}(): ${prompt.message.replaceAll(/\n\s+(\w)/gmi, '\n$1').trim()}`;
                prompt.role = "system";
                const command = { id: (0, uuid_1.v4)(), command: name, promise: $chat._prompt($chat, { ...$chat.options, ...prompt }) };
                if ($chat.pipelineCursor === $chat.pipeline.length) {
                    $chat.pipeline.push(command);
                }
                else {
                    $chat.pipeline = [
                        ...$chat.pipeline.slice(0, $chat.pipelineCursor + position),
                        command,
                        ...$chat.pipeline.slice($chat.pipelineCursor + position)
                    ];
                }
                position += 1;
            }
            resolve();
        });
    }
    /**
     * create a sidebar associated with this chat, the metadata of the sidebar
     * will inherit the main chat's metadaa in addition to `parent` which will
     * be the id of the main chant
     *
     * @param name: the name of the sidebar chat
     * @returns
     */
    sidebar() {
        // create a new chat and have a sidebar conversation
        const sidebar = new DSL({
            llm: this.llm,
            options: this.options,
            metadata: {
                ...this.data.metadata,
                $parent: this.data.id
            },
            window: this.window
        });
        this.data.sidebars.push(sidebar.data.id);
        sidebar.data.user = this.data.user;
        sidebar.functions = this.functions;
        sidebar.rules = this.rules;
        sidebar.locals = { ...this.locals };
        sidebar.type = "sidebar";
        sidebar.settings = { ...this.settings };
        // todo apply the messages onto the sidebar
        return sidebar;
    }
    /**
     *
     * @param id: a user id to associate with the chat and new prompts
     */
    setUser(id) {
        const promise = ($this) => new Promise((resolve, reject) => {
            $this.user = id;
            if ($this.data.user === undefined)
                $this.data.user = $this.user;
            resolve();
        });
        this.pipeline.push({ id: (0, uuid_1.v4)(), command: "setting user", promise });
        return this;
    }
    /**
     * set the context for the chat
     *
     * @param value
     * @returns
     */
    setLocals(locals) {
        const promise = ($this) => new Promise((resolve, reject) => {
            $this.locals = locals;
            resolve();
        });
        this.pipeline.push({ id: (0, uuid_1.v4)(), command: "setting locals", promise });
        return this;
    }
    setMetadata(metadata) {
        const promise = ($this) => new Promise((resolve, reject) => {
            $this.data.metadata = metadata;
            resolve();
        });
        this.pipeline.push({ id: (0, uuid_1.v4)(), command: "setting metadata", promise });
        return this;
    }
    /**
     * todo
     * add a message to the end of the chat without generating a prompt.
     *
     * @param message - a custom message to add to the chat
     * @returns
     */
    push(options) {
        const promise = ($this) => new Promise((resolve, reject) => {
            const messageId = (0, uuid_1.v4)();
            const _options = typeof options === "function" ? options({ locals: $this.locals, chat: $this }) : options;
            const visibility = _options.visibility !== undefined ? _options.visibility : Chat_1.Visibility.OPTIONAL;
            const content = _options.message.replaceAll(/\n\s+(\w)/gmi, '\n$1').trim();
            const message = {
                id: messageId,
                role: _options.role || $this.options.role || "user",
                content: content,
                size: $this.llm.tokens(content) + 3,
                visibility: visibility,
                createdAt: new Date(),
                updatedAt: new Date(),
                context: [],
                user: $this.user
            };
            $this.data.messages.push(message);
            $this.out({ ...message, chat: $this.data.id, type: "message", state: "streaming" });
            $this.out({ ...message, chat: $this.data.id, type: "message", state: "final" });
            resolve();
        });
        this.pipeline.push({ id: (0, uuid_1.v4)(), command: "push", promise });
        return this;
    }
    /**
     * load a chat from storage
     *
     * @param {string} id - a chat uuid
     * @returns {object} - the chat object
     */
    load(func) {
        const promise = ($this) => new Promise(async (resolve, reject) => {
            const result = func("someId");
            if (result instanceof Promise) {
                $this.data = await result;
            }
            else {
                $this.data = result;
            }
        });
        this.pipeline.push({ id: (0, uuid_1.v4)(), command: "load", promise });
        return this;
    }
    /**
     * create a clone of the chat pipeline with unique ids and as new object in memory
     *
     * @returns a clone of the chat object
     */
    clone() {
        const $this = (0, lodash_1.cloneDeep)(this);
        $this.data.id = (0, uuid_1.v4)();
        $this.data.messages = $this.data.messages.map(m => {
            const index = $this.rules.indexOf(m.id);
            m.id = (0, uuid_1.v4)();
            if (index !== -1) {
                $this.rules[index] = m.id;
            }
            return m;
        });
        return $this;
    }
    /**
     * create a rule for the chat
     *
     * @param options
     * @returns {object} - the chat object
     */
    rule(options) {
        const promise = ($this) => {
            const { name, requirement, key } = typeof options === "function" ? options({ locals: $this.locals, chat: $this }) : options;
            const content = `This conversation has the following rule: Rule ${name} - requirement - ${requirement}`;
            return new Promise((resolve, reject) => {
                const ruleId = (0, uuid_1.v4)();
                const _key = key || `Rule - ${name}`;
                const index = $this.data.messages.map(m => m.key).indexOf(_key);
                if (index === -1 || $this.data.messages[index].content !== content) {
                    $this.data.messages.push({
                        id: ruleId,
                        role: "system",
                        key: _key,
                        content: content,
                        size: $this.llm.tokens(content),
                        visibility: Chat_1.Visibility.REQUIRED,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });
                    $this.rules.push(ruleId);
                }
                resolve();
            });
        };
        this.pipeline.push({ id: (0, uuid_1.v4)(), command: "rule", promise });
        return this;
    }
    /**
     * create a function the LLM can call from the chat
     *
     * @param options
     * @returns {object} - the chat object
     */
    function(options) {
        const { name } = options;
        this.functions[name] = { ...options, calls: 0 };
        return this;
    }
    /**
     * send a new prompt to the LLM including the chat history
     *
     * @param options
     * @returns {object} - the chat object
     */
    prompt(options) {
        const promise = ($this) => {
            return new Promise((resolve, reject) => {
                const _options = typeof options === "function" ? options({ locals: $this.locals, chat: $this }) : options;
                $this._prompt($this, { ...$this.options, ..._options })()
                    .then(() => resolve())
                    .catch(reject);
            });
        };
        this.pipeline.push({ id: (0, uuid_1.v4)(), command: "prompt", promise });
        return this;
    }
    /**
     * a hook to direclty access the LLM response of the latest prompt
     *
     * @param func
     * @returns {object} - the chat object
     */
    response(func) {
        const promise = ($this) => {
            return new Promise((resolve, reject) => {
                func({ response: $this.data.messages[$this.data.messages.length - 1], locals: $this.locals, chat: $this })
                    .then(resolve)
                    .catch(reject);
            });
        };
        this.pipeline.push({ id: (0, uuid_1.v4)(), command: "response", promise });
        return this;
    }
    /**
     * Establish expectations for the response from the Language Model (LLM) and initiate a dispute resolution process if necessary.
     * When the 'reject' method is called, you can provide a message outlining your criteria, and a sidebar chat will be created to resolve
     * any discrepancies between the LLM's response and your expectations.
     *
     * The sidebar chat will persistently evaluate LLM responses through the 'expect' method until the response aligns with your expectations
     * or the maximum retry limit is reached.
     *
     * @param {function(response: ChatMessage): Promise<void>} func - A function to assess the LLM response.
     * @returns {object} - The chat object that can be used for further interactions.
     */
    expect(handler, ...others) {
        const handlers = [handler, ...others];
        for (const handler of handlers) {
            const stageId = (0, uuid_1.v4)();
            const promise = ($this) => {
                return new Promise(async (resolve, reject) => {
                    const response = $this.data.messages[$this.data.messages.length - 1];
                    handler({ response: response, locals: $this.locals, chat: $this })
                        .then(() => resolve())
                        .catch(expectation => {
                        if (typeof expectation !== "string") {
                            reject(expectation);
                            return;
                        }
                        // an expecatation was thrown
                        // push an dispute prompt as the next stage
                        // followed by this expect promise again so it can be re-evaluated
                        $this.pipeline = [
                            ...$this.pipeline.slice(0, $this.pipelineCursor + 1),
                            {
                                id: stageId,
                                command: `dispute`,
                                promise: $this._prompt($this, {
                                    ...$this.options,
                                    role: "system",
                                    visibility: Chat_1.Visibility.SYSTEM,
                                    message: `the prior response did not meet expectations: ${expectation}`,
                                    responseSize: Math.floor($this.settings.contextWindowSize * 0.25)
                                })
                            },
                            ...$this.pipeline.slice($this.pipelineCursor)
                        ];
                        resolve();
                    });
                });
            };
            this.pipeline.push({ id: stageId, command: "expect", promise });
        }
        return this;
    }
    /**
     * create 1 or more prompts from the chat context
     *
     * @param func
     * @returns {object} - the chat object
     */
    promptForEach(func) {
        const promise = ($this) => {
            return new Promise((resolve, reject) => {
                const promises = func({ locals: $this.locals, chat: $this })
                    .map(p => {
                    return { id: (0, uuid_1.v4)(), command: "prompt", promise: $this._prompt($this, { ...$this.options, ...p }) };
                });
                $this.pipeline = [
                    ...$this.pipeline.slice(0, $this.pipelineCursor + 1),
                    ...promises,
                    ...$this.pipeline.slice($this.pipelineCursor + 1)
                ];
                resolve();
            });
        };
        this.pipeline.push({ id: (0, uuid_1.v4)(), command: "promptForEach", promise });
        return this;
    }
    /**
     * create a branch of prompts from the chat context. Each branch will include all
     * prompts up to a .join() command.
     *
     * @param func
     * @returns {object} - the chat object
     */
    branchForEach(func) {
        const promise = ($this) => {
            return new Promise((resolve, reject) => {
                const promises = func({ locals: $this.locals, chat: $this }).map(p => {
                    return { id: (0, uuid_1.v4)(), command: "prompt", promise: $this._prompt($this, { ...$this.options, ...p }) };
                });
                const joinIndex = $this.pipeline.slice($this.pipelineCursor).map(p => p.command).indexOf("join");
                if (joinIndex === -1) {
                    reject("branchForEach requires a join()");
                    return;
                }
                $this.pipeline = [
                    ...$this.pipeline.slice(0, $this.pipelineCursor + 1),
                    ...promises.flatMap(p => [p, ...$this.pipeline.slice($this.pipelineCursor + 1, joinIndex + $this.pipelineCursor)]),
                    ...$this.pipeline.slice(joinIndex + $this.pipelineCursor + 1)
                ];
                resolve();
            });
        };
        this.pipeline.push({ id: (0, uuid_1.v4)(), command: "branchForEach", promise });
        return this;
    }
    /**
     * establishes a stopping point for the `branchForEach`
     * @returns {object} - the chat object
     */
    join() {
        // see forEachBranch
        this.pipeline.push({ id: (0, uuid_1.v4)(), command: "join", promise: ($this) => new Promise((resolve) => resolve()) });
        return this;
    }
    /***
     *
     */
    out(chunk) {
        this.streamHandlers.forEach(handler => handler(chunk));
    }
    /**
     * a handler to receive the stream of text
     *
     * @param output
     * @returns
     */
    async stream(handler, ...others) {
        this.streamHandlers = [handler, ...others];
        return this.execute();
    }
    /**
     * executes the pipeline
     *
     * @returns {Promise}
     */
    async execute() {
        return new Promise(async (resolve, reject) => {
            // todo validate the commands e.g. a branchForEach as a join
            try {
                let hasNext = true;
                this.out({ type: this.type, id: this.data.id, state: "open" });
                while (hasNext) {
                    this.pipelineCursor += 1;
                    const stage = this.pipeline[this.pipelineCursor];
                    if (stage === undefined)
                        break;
                    const { promise, command, id } = stage;
                    const slice = this.pipeline.slice(0, this.pipelineCursor);
                    let stackCount = 0;
                    for (var i = slice.length - 1; i >= 0; i--) {
                        const { id: _id } = slice[i];
                        if (id !== _id)
                            break;
                        stackCount += 1;
                    }
                    if (stackCount >= this.settings.maxCallStack) {
                        reject(`Max Call Stack Exceeded - Stage ${command}: ${id} - chat: ${this.data.id}`);
                        break;
                    }
                    this.out({ id: stage.id, type: "command", content: `command: ${command}\n` });
                    await promise(this);
                }
                const totalTokens = this.data.messages.reduce((prev, curr) => {
                    return prev + curr.size;
                }, 0);
                this.data.size = totalTokens;
                resolve(this);
            }
            catch (error) {
                this.out({ type: "error", error });
                reject(error);
            }
            finally {
                this.out({ type: this.type, id: this.data.id, state: "closed" });
            }
        });
    }
}
exports.DSL = DSL;
