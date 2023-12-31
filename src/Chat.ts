/** 
 * An enum representing the different visibility statuses a message can hold.
 * @enum {number}
 */
export enum Visibility {
  HIDDEN,
  OPTIONAL,
  REQUIRED
}

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
  id?: string;

  /**
   * The role authoring the message.
   * @type {"user" | "assistant"}
   */
  role: "user" | "assistant";

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
   * The number of tokens in the message.
   * @type {number}
   */
  tokens: number;

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
   * The time the message was updated.
   * @type {Date}
   */
  updatedAt: Date;

  /**
   * A list of messages that were included in a prompt (optional).
   * @type {string[]}
   */
  included?: string[];
}

/**
 * Interface representing a chat.
 * @interface
 */
export interface Chat {
  /** 
   * Unique identifier of the chat (optional).
   * @type {string}
   */
  id?: string;

  /**
   * The name of the chat.
   * @type {string}
   */
  name: string;

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
  metadata?: { [ key: string ]: any; };
}