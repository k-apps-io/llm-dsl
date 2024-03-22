import { CodeBlock } from "./Chat";
export declare const extract: (text: string) => CodeBlock[];
export declare const toCodeBlock: (lang: string, value: any) => string;
export default extract;
