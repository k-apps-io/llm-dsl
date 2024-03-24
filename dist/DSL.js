"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DSL = void 0;
const json5_1 = __importDefault(require("json5"));
const lodash_1 = require("lodash");
const uuid_1 = require("uuid");
const CodeBlocks_1 = require("./CodeBlocks");
const Window_1 = require("./Window");
const utilities_1 = require("./utilities");
const DEFAULT_SETTINGS = {
    contextWindowSize: 4000,
    minResponseSize: 400,
    maxCallStack: 10,
};
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
    exitCode = undefined;
    /**
     * manages the current position of the pipeline
     */
    pipelineCursor = -1;
    /**
     * these are the stream handlers that will receive any this.out calls
     */
    streamHandlers = [];
    constructor({ llm, options, locals, metadata, settings, window }) {
        this.llm = llm;
        this.options = options || {};
        this.locals = locals || {};
        this.settings = { ...DEFAULT_SETTINGS, ...settings };
        this.window = window || Window_1.main;
        this.data = {
            id: (0, uuid_1.v4)(),
            messages: [],
            sidebars: [],
            metadata: metadata,
            size: 0
        };
    }
    /**
     * create a sidebar associated with this chat, the metadata of the sidebar
     * will inherit the main chat's metadata in addition to `parent` which will
     * be the id of the main chat.
     *
     * @returns DSL
     */
    sidebar({ rules: _rules, functions: _functions, locals: _locals } = {}) {
        // create a new chat and have a sidebar conversation
        const sidebar = new DSL({
            llm: this.llm,
            options: this.options,
            metadata: {
                ...(this.data.metadata || {}),
                $parent: this.data.id
            },
            window: this.window,
        });
        this.data.sidebars.push(sidebar.data.id);
        sidebar.data.user = this.data.user;
        if (_rules)
            sidebar.pipeline = (0, lodash_1.cloneDeep)(this.pipeline.filter(p => p.stage === "rule"));
        if (_functions)
            sidebar.functions = this.functions;
        if (_locals)
            sidebar.locals = { ...this.locals };
        sidebar.type = "sidebar";
        sidebar.settings = { ...this.settings };
        return sidebar;
    }
    /**
     * apply an identifier representing the user generating the prompts.
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
        this.pipeline.push({ id: (0, uuid_1.v4)(), stage: "setting user", promise });
        return this;
    }
    /**
     * set locals for the chat
     *
     * @param value: L
     * @returns DSL
     */
    setLocals(locals) {
        const promise = ($this) => new Promise((resolve, reject) => {
            $this.locals = locals;
            resolve();
        });
        this.pipeline.push({ id: (0, uuid_1.v4)(), stage: "setting locals", promise });
        return this;
    }
    /**
     * set metadata for the chat
     */
    setMetadata(metadata) {
        const promise = ($this) => new Promise((resolve, reject) => {
            $this.data.metadata = metadata;
            resolve();
        });
        this.pipeline.push({ id: (0, uuid_1.v4)(), stage: "setting metadata", promise });
        return this;
    }
    /**
     * add a message to the chat without generating a prompt.
     */
    push(options, id = (0, uuid_1.v4)()) {
        const promise = ($this) => new Promise((resolve, reject) => {
            const messageId = (0, uuid_1.v4)();
            const _options = typeof options === "function" ? options({ locals: $this.locals, chat: $this }) : options;
            const visibility = _options.visibility !== undefined ? _options.visibility : Window_1.Visibility.OPTIONAL;
            const content = _options.message.replaceAll(/\n\s+(\w)/gmi, '\n$1').trim();
            const message = {
                id: messageId,
                role: _options.role || $this.options.role || "user",
                content: content,
                size: $this.llm.tokens(content) + 3,
                visibility: visibility,
                createdAt: new Date(),
                window: [],
                user: $this.user
            };
            $this.data.messages.push(message);
            $this.out({ ...message, chat: $this.data.id, type: "message" });
            resolve();
        });
        this.pipeline.push({ id: id, stage: "push", promise });
        return this;
    }
    /**
     * send a new prompt to the LLM including the chat history
     *
     * @param options
     * @returns {object} - the chat object
     */
    prompt(options, id = (0, uuid_1.v4)()) {
        const promise = ($this) => {
            return new Promise((resolve, reject) => {
                const _options = typeof options === "function" ? options({ locals: $this.locals, chat: $this }) : options;
                $this._prompt($this, { ...$this.options, ..._options })()
                    .then(() => resolve())
                    .catch(reject);
            });
        };
        this.pipeline.push({ id: id, stage: "prompt", promise });
        return this;
    }
    /**
     * create 1 or more prompts from the chat context
     *
     * @param func
     * @returns {object} - the chat object
     */
    promptForEach(func, id = (0, uuid_1.v4)()) {
        const promise = ($this) => {
            return new Promise((resolve, reject) => {
                const promises = func({ locals: $this.locals, chat: $this })
                    .map(p => {
                    return { id: (0, uuid_1.v4)(), stage: "prompt", promise: $this._prompt($this, { ...$this.options, ...p }) };
                });
                $this.pipeline = [
                    ...$this.pipeline.slice(0, $this.pipelineCursor + 1),
                    ...promises,
                    ...$this.pipeline.slice($this.pipelineCursor + 1)
                ];
                resolve();
            });
        };
        this.pipeline.push({ id: id, stage: "promptForEach", promise });
        return this;
    }
    /**
     * create a branch of prompts from the chat context. Each branch will include all
     * prompts up to a .join() command.
     *
     * @param func
     * @returns {object} - the chat object
     */
    branchForEach(func, id = (0, uuid_1.v4)()) {
        const promise = ($this) => {
            return new Promise((resolve, reject) => {
                const promises = func({ locals: $this.locals, chat: $this }).map(p => {
                    return { id: (0, uuid_1.v4)(), stage: "prompt", promise: $this._prompt($this, { ...$this.options, ...p }) };
                });
                const joinIndex = $this.pipeline.slice($this.pipelineCursor).map(p => p.stage).indexOf("join");
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
        this.pipeline.push({ id: id, stage: "branchForEach", promise });
        return this;
    }
    /**
     * establishes a stopping point for the `branchForEach`
     */
    join(id = (0, uuid_1.v4)()) {
        // see forEachBranch
        this.pipeline.push({ id: id, stage: "join", promise: ($this) => new Promise((resolve) => resolve()) });
        return this;
    }
    /**
     * load a chat from storage
     *
     * @param {string} id - a chat uuid
     * @returns {object} - the chat object
     */
    load(func, id = (0, uuid_1.v4)()) {
        const promise = ($this) => new Promise(async (resolve, reject) => {
            const result = func("someId");
            if (result instanceof Promise) {
                $this.data = await result;
            }
            else {
                $this.data = result;
            }
        });
        this.pipeline.push({ id: id, stage: "load", promise });
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
            const { name, requirement, key, id } = typeof options === "function" ? options({ locals: $this.locals, chat: $this }) : options;
            const content = `This conversation has the following rule: Rule ${name} - requirement - ${requirement}`;
            return new Promise((resolve, reject) => {
                const ruleId = id || (0, uuid_1.v4)();
                const _key = key || `Rule - ${name}`;
                const index = $this.data.messages.map(m => m.key).indexOf(_key);
                if (index === -1 || $this.data.messages[index].content !== content) {
                    $this.data.messages.push({
                        id: ruleId,
                        role: "system",
                        key: _key,
                        content: content,
                        size: $this.llm.tokens(content) + 3,
                        visibility: Window_1.Visibility.REQUIRED,
                        createdAt: new Date()
                    });
                    $this.rules.push(ruleId);
                }
                resolve();
            });
        };
        this.pipeline.push({ id: (0, uuid_1.v4)(), stage: "rule", promise });
        return this;
    }
    /**
     * add a function the LLM can call from the chat
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
     * directly access the LLM response the latest prompt.
     */
    response(func, id = (0, uuid_1.v4)()) {
        const promise = ($this) => {
            return func({ response: $this.data.messages[$this.data.messages.length - 1], locals: $this.locals, chat: $this });
        };
        this.pipeline.push({ id: id, stage: "response", promise });
        return this;
    }
    /**
     * Establish expectations for the response from the LLM.
     * When the 'reject' method is called, you can provide a message outlining your criteria. This rejection then becomes
     * a new prompt to the LLM which again the response is evaluted against the expecations.
     *
     * this doesn't support stage id assignment b/c of the rest arguments
     *
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
                                stage: `dispute`,
                                promise: $this._prompt($this, {
                                    ...$this.options,
                                    role: "system",
                                    visibility: Window_1.Visibility.SYSTEM,
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
            this.pipeline.push({ id: stageId, stage: "expect", promise });
        }
        return this;
    }
    /**
     * handlers to receive the chat stream and execute the pipeline
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
            try {
                let hasNext = true;
                this.out({ type: this.type, id: this.data.id, state: "open" });
                while (hasNext) {
                    // check for an exit code
                    if (this.exitCode) {
                        if (this.exitCode !== 1)
                            throw this.exitCode;
                        hasNext = false;
                        continue;
                    }
                    // evaluate the call stack for a loop
                    const slice = this.pipeline.slice(0, this.pipelineCursor);
                    const result = (0, utilities_1.detectLoop)(slice.map(({ id }) => id), this.settings.maxCallStack);
                    if (result.loop)
                        throw new utilities_1.LoopError(result);
                    // perform the stage
                    this.pipelineCursor += 1;
                    const item = this.pipeline[this.pipelineCursor];
                    if (item === undefined)
                        break;
                    const { promise, stage, id } = item;
                    this.out({ id: id, type: "stage", content: stage });
                    await promise(this);
                }
                const totalTokens = this.data.messages.reduce((prev, curr) => {
                    return prev + curr.size;
                }, 0);
                this.data.size = totalTokens;
                resolve(this);
            }
            catch (error) {
                this.out({ id: (0, uuid_1.v4)(), type: "error", error });
                reject(error);
            }
            finally {
                this.out({ type: this.type, id: this.data.id, state: "closed" });
            }
        });
    }
    /**
     * when called the pipeline will stop executing after the current stage is completed. If an error is provided this
     * will be thrown as a new Error()
     */
    exit(error = 1) {
        this.exitCode = error;
    }
    /**
     * sets the position of the pipeline to the stage with the provided id. If a id matches the stage will be executed
     * next and continue from that position. If a stage is not found a error is thrown.
     */
    moveTo({ id }) {
        const promise = ($this) => {
            return new Promise((resolve, reject) => {
                const index = $this.pipeline.findIndex(({ id: _id }) => _id === id);
                if (index === -1) {
                    return reject(new Error(`No Pipeline Stage with id ${id}`));
                }
                // apply the prior index b/c the execute process auto increments the
                // pipelineCursor by 1 before each stage
                $this.pipelineCursor = index - 1;
                resolve();
            });
        };
        this.pipeline = [
            ...this.pipeline.slice(0, this.pipelineCursor + 1),
            { id: (0, uuid_1.v4)(), stage: "seek", promise },
            ...this.pipeline.slice(this.pipelineCursor + 1)
        ];
        return this;
    }
    /**
     *
     * @param options : the prompt options
     * @returns Promise<void>
     */
    _prompt($chat, options) {
        return () => new Promise(async (resolve, reject) => {
            const messageTokens = $chat.llm.tokens(options.message) + 3;
            const responseSize = (options.responseSize || $chat.settings.minResponseSize);
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
            const visibility = options.visibility !== undefined ? options.visibility : Window_1.Visibility.OPTIONAL;
            const role = options.role || $chat.options.role || "user";
            const message = {
                id: messageId,
                role: role,
                content: options.message.replaceAll(/\n\s+(\w)/gmi, '\n$1').trim(),
                size: messageTokens,
                visibility: visibility,
                window: messages.map(({ id }) => id),
                user: $chat.user,
                createdAt: new Date()
            };
            $chat.data.messages.push(message);
            $chat.out({ ...message, type: "message", chat: $chat.data.id });
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
                            const functionSize = $chat.llm.tokens(content) + 3;
                            const functionUuid = (0, uuid_1.v4)();
                            const functionMessage = {
                                id: functionUuid,
                                role: "assistant",
                                content: content,
                                size: functionSize,
                                visibility: Window_1.Visibility.SYSTEM,
                                createdAt: new Date()
                            };
                            $chat.data.messages.push(functionMessage);
                            $chat.out({
                                ...functionMessage,
                                type: "message",
                                chat: $chat.data.id
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
                                        type: "response",
                                        role: "assistant",
                                        content: response,
                                        chat: $chat.data.id,
                                        visibility: visibility
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
                                const functionMessage = {
                                    id: functionUuid,
                                    role: "assistant",
                                    content: response,
                                    size: $chat.llm.tokens(response) + 3,
                                    visibility: Window_1.Visibility.SYSTEM,
                                    createdAt: new Date()
                                };
                                $chat.data.messages.push(functionMessage);
                                $chat.out({ ...functionMessage, chat: $chat.data.id, type: "message" });
                                response = "";
                            }
                        }
                        else {
                            response += chunk.content;
                            $chat.out({
                                id: responseId,
                                type: "response",
                                role: "assistant",
                                content: chunk.content,
                                chat: $chat.data.id,
                                visibility: visibility
                            });
                        }
                    }
                })();
            }
            catch (error) {
                reject(error);
                return;
            }
            // response has finished streaming
            if (response.trim() !== "") {
                const blocks = (0, CodeBlocks_1.extract)(response);
                const responseSize = $chat.llm.tokens(response) + 3;
                const responseMessage = {
                    id: responseId,
                    role: "assistant",
                    content: response,
                    size: responseSize,
                    visibility: visibility,
                    codeBlocks: blocks.length > 0 ? blocks : undefined,
                    createdAt: new Date()
                };
                $chat.data.messages.push(responseMessage);
                $chat.out({ ...responseMessage, type: "message", chat: $chat.data.id });
            }
            // evaluate the functions is one was called;
            let position = 1;
            const currentStage = $chat.pipeline[$chat.pipelineCursor].stage;
            for (const func of funcs) {
                const { func: promise, parameters, name, args } = func;
                const calls = $chat.functions[name].calls;
                if (calls > 2 && currentStage === name) {
                    // this function has been called multiple times within the current stage
                    //  which is going to be treated as a never resolving loop.
                    reject(new Error(`Function Loop - function: ${name}`));
                    return;
                }
                $chat.functions[name].calls += 1;
                // todo error handling for args
                let params = {};
                try {
                    params = args !== "" ? json5_1.default.parse(args) : {};
                }
                catch (error) {
                    $chat.out({ id: (0, uuid_1.v4)(), type: "error", error });
                }
                let prompt;
                try {
                    prompt = await promise({ ...params, locals: $chat.locals, chat: $chat });
                    prompt.message = `here is the result of your call ${name}(): ${prompt.message.replaceAll(/\n\s+(\w)/gmi, '\n$1').trim()}`;
                }
                catch (error) {
                    prompt = {
                        message: `an error occurred in call ${name}(): ${error}`
                    };
                }
                prompt.role = "system";
                const stage = { id: (0, uuid_1.v4)(), stage: name, promise: $chat._prompt($chat, { ...$chat.options, ...prompt }) };
                if ($chat.pipelineCursor === $chat.pipeline.length) {
                    // end of the chat, just need to push the new stage
                    $chat.pipeline.push(stage);
                }
                else {
                    // middle of pipeline, we need to insert the stage in the current position and shift all subsequent stages
                    $chat.pipeline = [
                        ...$chat.pipeline.slice(0, $chat.pipelineCursor + position),
                        stage,
                        ...$chat.pipeline.slice($chat.pipelineCursor + position)
                    ];
                }
                position += 1;
            }
            resolve();
        });
    }
    /***
     * evaluates the Chunk across all stream handlers
     */
    out(chunk) {
        this.streamHandlers.forEach(handler => handler(chunk));
    }
}
exports.DSL = DSL;
