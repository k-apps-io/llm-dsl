import { DSL, StreamHandler } from "./DSL";
interface FileSystemOptions {
    directory: string;
    filename: string;
}
export declare const stream: ({ directory, filename }: FileSystemOptions) => StreamHandler;
interface WriteOptions extends FileSystemOptions {
    chat: DSL<any, any, any>;
}
export declare const write: ({ directory, chat, filename }: WriteOptions) => void;
export {};
