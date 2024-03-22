import { Chat } from "./Chat";
export interface WindowOptions {
    messages: Chat<any>["messages"];
    tokenLimit: number;
}
export type Window = (options: WindowOptions) => Chat<any>["messages"];
export interface LatestWindowOptions {
    max: number;
}
export declare const latest: ({ max }: LatestWindowOptions) => Window;
export declare const key: Window;
