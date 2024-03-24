export type TextResponse = {
  type: "text";
  content: string;
};

export type FunctionResponse = {
  type: "function";
  name: string;
  arguments: any;
};

export interface Function {
  name: string;
  parameters: { [ key: string ]: any; };
  description: string;
}

export interface Prompt {
  prompt: string;
  role: "user" | "assistant" | "system";
}

export interface Stream {
  user?: string;
  messages: Prompt[];
  functions: Function[];
  responseSize: number;
}

export abstract class LLM {

  constructor() { }
  /**
   * cacluates the total number of tokens for a string
   * 
   * @param {string} text : a string to evaluate the number of tokens
   * @returns {number} : the number of tokens in the string
   */
  abstract tokens( text: string ): number;

  /**
   * creates an iterable stream of the LLM response. The chunks of the stream will
   * either be text or a function to be called
   * 
   * @param {Stream} config 
   * 
   */
  abstract stream( config: Stream ): AsyncIterable<TextResponse | FunctionResponse>;
}
