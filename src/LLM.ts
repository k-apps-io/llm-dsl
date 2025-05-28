import { Message } from "./Chat";
import { Options } from "./DSL";

export type TextResponse = {
  type: "text";
  content: string;
};

export type FunctionResponse<O extends Options> = {
  id?: string;
  type: "function";
  name: string;
  arguments: any;
  message?: O;
};

export interface Function {
  name: string;
  parameters: { [ key: string ]: any; };
  description: string;
}

export interface StreamMessage<C = any> {
  content: C;
  role: "user" | "assistant" | "system" | "tool";
  [ key: string ]: any; // Allow additional properties
}

export interface Stream<C = any> {
  user?: string;
  messages: StreamMessage<C>[];
  functions: Function[];
  responseSize: number;
}

export abstract class LLM<C = any> {

  constructor() { }
  /**
   * cacluates the total number of tokens for a string
   * 
   * @param {string} text : a string to evaluate the number of tokens
   * @returns {number} : the number of tokens in the string
   */
  abstract tokens( content: C ): number;

  /**
   * cacluates the total number of tokens for a window of Messages. This window is to be provided as additional input for a prompt.
   * 
   * @param {Message[]} window : a list 
   * @returns {number} : the total number of tokens created by the window.
   */
  abstract windowTokens( window: Message<C>[] ): number;

  /**
   * cacluates the total number of tokens for a list of Functions
   * 
   * @param {Function[]} functions : a list 
   * @returns {Object} : the total number of tokens for the Function list in addition to key value pars of
   * each function name and the tokens created by that function.
   */
  abstract functionTokens( functions: Function[] ): { total: number;[ key: string ]: number; };

  /**
   * creates an iterable stream of the LLM response. The chunks of the stream will
   * either be text or a function to be called
   * 
   * @param {Stream} config 
   * 
   */
  abstract stream( config: Stream ): AsyncIterable<TextResponse | FunctionResponse<Options<C>>>;

  abstract prepareContent( options: Options<C> ): C;

  /**
   * a hook to close the LLM cleaning up any resources that may have been opened.
   */
  abstract close(): void;
}
