import { Message } from "./Chat";
import { DSL } from "./DSL";
/**
 * this chunk indicates a new chat or sidebar
 */
interface ChatChunk {
    id: string;
    type: "chat" | "sidebar";
    state: "open" | "closed";
    metadata?: {
        [key: string]: unknown;
    };
}
/**
 * this chunk represents a response stream which contain parts of the response
 */
interface ResponseChunk extends Omit<Message, "size" | "codeBlocks" | "user" | "createdAt" | "window"> {
    type: "response";
    chat: string;
}
/**
 * this chunk will represent a completed message in the chat and emitted when a Message is generated e.g. prompt, push, response, etc.
 */
interface MessageChunk extends Message {
    id: string;
    type: "message";
    chat: string;
}
/**
 * this chunk is emitted when a new stage in the pipeline is executed. The content will be the stage name which closely aligns
 * with the pipeline function name.
 */
interface StageChunk {
    id: string;
    type: "stage";
    content: string;
}
/**
 * this chunk is emitted when an error occurred in the pipeline that was unhandled. The error can be received here as well
 * as caught in a catch block or callback.
 */
interface ErrorChunk {
    id: string;
    type: "error";
    error: unknown;
}
export type Chunk = ChatChunk | ResponseChunk | MessageChunk | StageChunk | ErrorChunk;
export type StreamHandler = (chunk: Chunk) => void;
interface FileSystemOptions {
    /**
     * the directory to write the file to, the directory will not be created if it does not already exist.
     */
    directory: string;
    /**
     * the name of the file, when not defined the chat id will be used
     */
    filename?: string;
}
interface LocalFileStream extends FileSystemOptions {
    /**
     * whether to appended the chat stream to the target file. Default behavior is to append, when false the file will be overwriten
     */
    append?: boolean;
    /**
     * whether to include a timestamp in the stage. Default behavior is to exclude a timestamp
     */
    timestamps?: boolean;
}
/**
 * a stream handler that will write the stream the chat pipeline to a local file
 */
export declare const localFileStream: ({ directory, filename, append, timestamps }: LocalFileStream) => StreamHandler;
interface WriteOptions extends FileSystemOptions {
    chat: DSL<any, any, any>;
    /**
     * Adds indentation, white space, and line break characters to the return-value JSON text to make it easier to read.
     *
     * the default value is 2.
     */
    spaces?: string | number;
    /**
     * An array of strings and numbers that acts as an approved list for selecting the object properties that will be stringified.
     */
    replacer?: (number | string)[];
}
/**
 * writes the chat to a local file using JSON.stringify. The file will be overwritten
 */
export declare const localFileStorage: ({ directory, filename, chat, spaces, replacer }: WriteOptions) => void;
export {};
