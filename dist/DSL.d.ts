import { Chat } from "./Chat";
import { ResponseStage } from "./Expect";
import { Function, LLM, Prompt } from "./LLM";
import { Rule } from "./Rules";
import { StreamHandler } from "./Stream";
import { Visibility, Window } from "./Window";
/**
 * TODOs
 *  - a step that allows for the user to run a process without generate a prompt / adding a message
 *     consider a branchForEach ... to join() and the user wants to run a process from the results before
 *     generating a new prompt
 *  - branchForEach - current item in the loop is not accessible from the subsequent commands
 */
interface StageFunctionArgs<O extends Options, L extends Locals, M extends Metadata> {
    locals: L;
    chat: DSL<O, L, M>;
}
type StageFunction<O extends Options, L extends Locals, M extends Metadata, F> = (args: StageFunctionArgs<O, L, M>) => F;
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
/**
 *
 */
export interface Locals {
    [key: string]: unknown;
}
export interface Settings {
    contextWindowSize: number;
    minResponseSize: number;
    maxCallStack: number;
}
export type Metadata = undefined | {
    [key: string]: unknown;
};
export declare class DSL<O extends Options, L extends Locals, M extends Metadata> {
    llm: LLM;
    options: Omit<O, "message">;
    window: Window;
    data: Chat<M>;
    locals: L;
    rules: string[];
    type: "chat" | "sidebar";
    user?: string;
    settings: Settings;
    functions: {
        [key: string]: (Function & {
            func: (args: any) => Promise<Options | O>;
            calls: number;
        });
    };
    pipeline: Array<{
        id: string;
        stage: string;
        promise: ($this: DSL<O, L, M>) => Promise<void>;
    }>;
    exitCode?: 1 | Error;
    /**
     * manages the current position of the pipeline
     */
    private pipelineCursor;
    /**
     * these are the stream handlers that will receive any this.out calls
     */
    private streamHandlers;
    constructor({ llm, options, locals, metadata, settings, window }: {
        llm: LLM;
        options?: Omit<O, "message">;
        locals?: L;
        metadata?: M;
        settings?: {
            contextWindowSize?: number;
            minResponseSize?: number;
            maxCallStack?: number;
        };
        window?: Window;
    });
    /**
     * create a sidebar associated with this chat, the metadata of the sidebar
     * will inherit the main chat's metadata in addition to `parent` which will
     * be the id of the main chat.
     *
     * @returns DSL
     */
    sidebar({ rules: _rules, functions: _functions, locals: _locals }?: {
        rules?: boolean;
        functions?: boolean;
        locals?: boolean;
    }): DSL<O, L, {
        [key: string]: unknown;
    } & {
        $parent: string;
    }>;
    /**
     * apply an identifier representing the user generating the prompts.
     *
     * @param id: a user id to associate with the chat and new prompts
     */
    setUser(id: string): this;
    /**
     * set locals for the chat
     *
     * @param value: L
     * @returns DSL
     */
    setLocals(locals: L): this;
    /**
     * set metadata for the chat
     */
    setMetadata(metadata: M): this;
    /**
     * add a message to the chat without generating a prompt.
     */
    push(options: (Options | O | StageFunction<O, L, M, Options | O>), id?: string): this;
    /**
     * send a new prompt to the LLM including the chat history
     *
     * @param options
     * @returns {object} - the chat object
     */
    prompt(options: (Options | O | StageFunction<O, L, M, Options | O>), id?: string): this;
    /**
     * create 1 or more prompts from the chat context
     *
     * @param func
     * @returns {object} - the chat object
     */
    promptForEach(func: StageFunction<O, L, M, (Options | O)[]>, id?: string): this;
    /**
     * create a branch of prompts from the chat context. Each branch will include all
     * prompts up to a .join() command.
     *
     * @param func
     * @returns {object} - the chat object
     */
    branchForEach(func: StageFunction<O, L, M, (Options | O)[]>, id?: string): this;
    /**
     * establishes a stopping point for the `branchForEach`
     */
    join(id?: string): this;
    /**
     * load a chat from storage
     *
     * @param {string} id - a chat uuid
     * @returns {object} - the chat object
     */
    load(func: (id: string) => Chat<M> | Promise<Chat<M>>, id?: string): this;
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
    rule(options: (Rule | StageFunction<O, L, M, Rule>)): this;
    /**
     * add a function the LLM can call from the chat
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
     * directly access the LLM response the latest prompt.
     */
    response(func: ResponseStage<O, L, M>, id?: string): this;
    /**
     * Establish expectations for the response from the LLM.
     * When the 'reject' method is called, you can provide a message outlining your criteria. This rejection then becomes
     * a new prompt to the LLM which again the response is evaluted against the expecations.
     *
     * this doesn't support stage id assignment b/c of the rest arguments
     *
     */
    expect(handler: ResponseStage<O, L, M>, ...others: ResponseStage<O, L, M>[]): this;
    /**
     * handlers to receive the chat stream and execute the pipeline
     */
    stream(handler: StreamHandler, ...others: StreamHandler[]): Promise<DSL<O, L, M>>;
    /**
     * executes the pipeline
     *
     * @returns {Promise}
     */
    execute(): Promise<DSL<O, L, M>>;
    /**
     * when called the pipeline will stop executing after the current stage is completed. If an error is provided this
     * will be thrown as a new Error()
     */
    exit(error?: Error | 1): void;
    /**
     * sets the position of the pipeline to the stage with the provided id. If a id matches the stage will be executed
     * next and continue from that position. If a stage is not found a error is thrown.
     */
    moveTo({ id }: {
        id: string;
    }): this;
    /**
     *
     * @param options : the prompt options
     * @returns Promise<void>
     */
    private _prompt;
    /***
     * evaluates the Chunk across all stream handlers
     */
    private out;
}
export {};
