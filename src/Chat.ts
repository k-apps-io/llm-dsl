

import { Metadata } from "./DSL";
import { Visibility } from "./Window";

/**
 * Interface representing a code block.
 * @interface
 */
export interface CodeBlock {
  /** 
   * The language of the code block.
   * @type {string}
   */
  lang: string;

  /** 
   * The code content of the code block.
   * @type {string}
   */
  code: string;
}

/**
 * Interface representing a message.
 * @interface
 */
export interface Message {
  /** 
   * Unique identifier of the message (optional).
   * @type {string}
   */
  id: string;

  /** 
      * The role authoring the message.
   * @type {"user" | "assistant" | "system"}
   */
  role: "user" | "assistant" | "system";

  /**
   * The key of the message (optional).
   * @type {string}
   */
  key?: string;

  /**
   * The content of the message.
   * @type {string}
   */
  content: string;
  /**
   * The visibility status of the message.
   * @type {Visibility}
   */
  visibility: Visibility;

  /**
   * The code blocks contained within the message (optional).
   * @type {CodeBlock[]}
   */
  codeBlocks?: CodeBlock[];

  /**
   * a id associated with a user that created the message
   * @type {string}
   */
  user?: string;

  /**
   * The time the message was created.
   * @type {Date}
   */
  createdAt: Date;

  /**
   * A list of message ids that represent the context window included with a prompt to the llm (optional). This will be set
   * any time a prompt is sent to the LLM. This include's all prompt functions on the DSL in addition to function calls made
   * by the LLM which generates a prompt.
   * 
   * @type {string[]}
   */
  window?: string[];

  /**
   * this is a calculated value and is the total size of all messages within the window sent to the prompt. 
   * @type {number}
   */
  windowSize?: number;

  /**
   * The number of tokens in content.
   * @type {number}
   */
  size: number;


  /**
   * the id of a message in the chat that resulted in this additional message. For example, a simple prompt generates 2 messages in
   * the chat. One that represents the prompt, the other represents the response. Both messages will have prompt set to the prompt 
   * message id.
   */
  prompt: string;
}

/**
 * Interface representing a chat.
 * @interface
 */
export interface Chat<M extends Metadata> {
  /** 
   * Unique identifier of the chat (optional).
   * @type {string}
   */
  id?: string;

  /**
   * Contains the sidebar ids spawned by the chat.
   * @type {string[]}
   */
  sidebars: string[];

  /**
   * Contains the list of messages in the chat.
   * @type {Message[]}
   */
  messages: Message[];

  /**
   * a id associated with a user whom created the chat
   */
  user?: string;

  /**
   * optional metadata to associate with the chat
   */
  metadata?: M;

  /**
   * 
   */
  size: number;
}