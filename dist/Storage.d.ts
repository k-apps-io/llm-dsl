import { Chat } from "./Chat";
export interface ChatStorage extends Object {
    getById: (id: string) => Promise<Chat>;
    save: (chat: Chat) => Promise<void>;
}
export declare const LocalStorage: ChatStorage;
export declare const NoStorage: ChatStorage;
export default ChatStorage;
