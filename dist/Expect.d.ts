import { ExpectHandler, Locals, Metadata, Options } from "./DSL";
type JSONValue = string | number | boolean | null | {
    [key: string]: JSONValue;
} | JSONValue[];
interface ExpectJSON {
    /**
     * the number of JSON code blocks to expect to find in the response. When the response matches you will find a JSON value
     * in chat.locals.$blocks as either a single JSONValue when blocks is 1 otherwise a JSONValue[]
     */
    blocks: number;
}
export declare const json: <O extends Options, L extends Locals & {
    $blocks: JSONValue;
}, M extends Metadata>(options?: ExpectJSON) => ExpectHandler<O, L, M>;
export {};
