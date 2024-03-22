import { Chat, Message as ChatMessage, Message, Visibility } from "./Chat";
import { Rule } from "./Rules";
import { Window } from "./Window";
/**
 * TODOs
 *  - chat.exit() => stops the chat, consider that some commands require a certain return type
 *  - chat.seek() => moves the position of the next command
 *  - chat.setVisibility(betweenKey, andKey) => update the visiblity between the two keys
 *  - backoff if context is full
 *  - expect json => check if response is only partial, responseSize is too small
 *  - expect json => provide a validator anonymous function to execute against each block
 *  - provide attemps / context in expect
 *  - set a key on the expectation response? rational is it keeps the context window to a min
 *  - handle require args for functions
 *  - handle rejectsions in functions
 *  - trim prompts with [\n\r]+(\w)
 *  - a step that allows for the user to run a process without generate a prompt / adding a message
 *     consider a branchForEach ... to join() and the user wants to run a process from the results before
 *     generating a new prompt
 *  - branchForEach - current item in the loop is not accessible from the subsequent commands
 */
export interface Prompt {
    prompt: string;
    role: "user" | "assistant" | "system";
}
export interface Function {
    name: string;
    parameters: {
        [key: string]: any;
    };
    description: string;
}
interface CommandFunctionArgs<O extends Options, L extends Locals, M extends Metadata> {
    locals: L;
    chat: DSL<O, L, M>;
}
export type CommandFunction<O extends Options, L extends Locals, M extends Metadata, F> = (args: CommandFunctionArgs<O, L, M>) => F;
export interface Stream {
    user?: string;
    messages: Prompt[];
    functions: Function[];
    responseSize: number;
}
export interface Options {
    /**
     * the text message to send to the LLM
     */
    message: string;
    /**
     * an optional key that identifies the prompt. If the key is re-used the latest
     * prompt will overwrite the prior
     */
    key?: string;
    /**
     * the visibility of the prompt, this value will not take effect until
     * after the message is sent to the LLM for a response
     */
    visibility?: Visibility;
    /**
     * the number of tokens to reserve for the response, this is linked with the
     * max token limit of the model. The difference between these two will be used
     * for limiting the context to provide with the prompt
     */
    responseSize?: number;
    role?: Prompt["role"];
}
export interface Locals {
    [key: string]: unknown;
}
export interface Settings {
    contextWindowSize?: number;
    minReponseSize?: number;
    maxCallStack?: number;
}
export type TextResponse = {
    type: "text";
    content: string;
};
export type FunctionResponse = {
    type: "function";
    name: string;
    arguments: any;
};
export interface ChatChunk {
    id: string;
    type: "chat" | "sidebar";
    state: "open" | "closed";
    metadata?: {
        [key: string]: unknown;
    };
}
export interface MessageFinalChunk extends Omit<Message, "includes" | "codeBlocks" | "createdAt" | "updatedAt"> {
    id: string;
    type: "message";
    state: "final";
    chat: string;
}
export interface MessageStreamChunk extends Omit<Message, "includes" | "codeBlocks" | "createdAt" | "updatedAt" | "size"> {
    id: string;
    type: "message";
    state: "streaming";
    chat: string;
}
export interface CommandChunk {
    id: string;
    type: "command";
    content: string | Uint8Array;
}
export type Chunk = ChatChunk | MessageFinalChunk | MessageStreamChunk | CommandChunk | {
    type: "error";
    error: unknown;
};
export type StreamHandler = (chunk: Chunk) => void;
export type Metadata = undefined | {
    [key: string]: unknown;
};
export interface ExpectHandlerArgs<O extends Options, L extends Locals, M extends Metadata> {
    response: ChatMessage;
    locals: L;
    chat: DSL<O, L, M>;
}
export type ExpectHandler<O extends Options, L extends Locals, M extends Metadata> = (args: ExpectHandlerArgs<O, L, M>) => Promise<void>;
export declare abstract class LLM {
    constructor();
    /**
     * cacluates the total number of tokens for a string
     *
     * @param {string} text : a string to evaluate the number of tokens
     * @returns {number} : the number of tokens in the string
     */
    abstract tokens(text: string): number;
    /**
     * creates an iterable stream of the LLM response. The chunks of the stream will
     * either be text or a function to be called
     *
     * @param {Stream} config
     *
     */
    abstract stream(config: Stream): AsyncIterable<TextResponse | FunctionResponse>;
}
export declare class DSL<O extends Options, L extends Locals, M extends Metadata> {
    llm: LLM;
    options: Omit<O, "message">;
    window: Window;
    data: Chat<M>;
    locals: L;
    rules: string[];
    type: "chat" | "sidebar";
    user?: string;
    settings: {
        contextWindowSize: number;
        minReponseSize: number;
        maxCallStack: number;
    };
    private functions;
    private pipeline;
    private pipelineCursor;
    private streamHandlers;
    constructor({ llm, options, locals, metadata, settings, window }: {
        llm: LLM;
        options: Omit<O, "message">;
        locals?: L;
        metadata?: M;
        settings?: Settings;
        window: Window;
    });
    /**
     *
     * @param options : the prompt options
     * @returns Promise<void>
     */
    private _prompt;
    /**
     * create a sidebar associated with this chat, the metadata of the sidebar
     * will inherit the main chat's metadaa in addition to `parent` which will
     * be the id of the main chant
     *
     * @param name: the name of the sidebar chat
     * @returns
     */
    sidebar(): DSL<O, L, {
        [key: string]: unknown;
    } & {
        $parent: string;
    }>;
    /**
     *
     * @param id: a user id to associate with the chat and new prompts
     */
    setUser(id: string): this;
    /**
     * set the context for the chat
     *
     * @param value
     * @returns
     */
    setLocals(locals: L): this;
    setMetadata(metadata: M): this;
    /**
     * todo
     * add a message to the end of the chat without generating a prompt.
     *
     * @param message - a custom message to add to the chat
     * @returns
     */
    push(options: (Options | O | CommandFunction<O, L, M, Options | O>)): this;
    /**
     * load a chat from storage
     *
     * @param {string} id - a chat uuid
     * @returns {object} - the chat object
     */
    load(func: (id: string) => Chat<M> | Promise<Chat<M>>): this;
    /**
     * create a clone of the chat pipeline with unique ids and as new object in memory
     *
     * @returns a clone of the chat object
     */
    clone(): this;
    /**
     * create a rule for the chat
     *
     * @param options
     * @returns {object} - the chat object
     */
    rule(options: (Rule | CommandFunction<O, L, M, Rule>)): this;
    /**
     * create a function the LLM can call from the chat
     *
     * @param options
     * @returns {object} - the chat object
     */
    function<F>(options: Function & {
        func: (args: F & {
            locals: L;
            chat: DSL<O, L, M>;
        }) => Promise<Options | O>;
    }): this;
    /**
     * send a new prompt to the LLM including the chat history
     *
     * @param options
     * @returns {object} - the chat object
     */
    prompt(options: (Options | O | CommandFunction<O, L, M, Options | O>)): this;
    /**
     * a hook to direclty access the LLM response of the latest prompt
     *
     * @param func
     * @returns {object} - the chat object
     */
    response(func: (args: {
        response: ChatMessage;
        locals: L;
        chat: DSL<O, L, M>;
    }) => Promise<void>): this;
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
    expect(handler: ExpectHandler<O, L, M>, ...others: ExpectHandler<O, L, M>[]): this;
    /**
     * create 1 or more prompts from the chat context
     *
     * @param func
     * @returns {object} - the chat object
     */
    promptForEach(func: CommandFunction<O, L, M, (Options | O)[]>): this;
    /**
     * create a branch of prompts from the chat context. Each branch will include all
     * prompts up to a .join() command.
     *
     * @param func
     * @returns {object} - the chat object
     */
    branchForEach(func: CommandFunction<O, L, M, (Options | O)[]>): this;
    /**
     * establishes a stopping point for the `branchForEach`
     * @returns {object} - the chat object
     */
    join(): this;
    /***
     *
     */
    private out;
    /**
     * a handler to receive the stream of text
     *
     * @param output
     * @returns
     */
    stream(handler: StreamHandler, ...others: StreamHandler[]): Promise<DSL<O, L, M>>;
    /**
     * executes the pipeline
     *
     * @returns {Promise}
     */
    execute(): Promise<DSL<O, L, M>>;
}
export {};
