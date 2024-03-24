

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
   * The token size of the message
   */
  size: number;

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
   * A list of message ids that represent the context window included with a prompt to the llm (optional).
   * @type {string[]}
   */
  window?: string[];

  /**
   * the id of the prompt that generated this message
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