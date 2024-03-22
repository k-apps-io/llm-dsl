import JSON from "json5";
import { cloneDeep } from "lodash";
import { v4 as uuid } from "uuid";
import { Chat, Message as ChatMessage, Message, Visibility } from "./Chat";
import extractBlocks from "./CodeBlocks";
import { Rule } from "./Rules";
import { Window } from "./Window";

/**
 * TODOs
 *  - chat.exit() => stops the chat, consider that some commands require a certain return type
 *  - chat.seek() => moves the position of the next command
 *  - chat.setVisibility(betweenKey, andKey) => update the visiblity between the two keys
 *  - backoff if context is full
 *  - expect json => check if response is only partial, responseSize is too small
 *  - expect json => provide a validator anonymous function to execute against each block
 *  - provide attemps / context in expect
 *  - set a key on the expectation response? rational is it keeps the context window to a min
 *  - handle require args for functions
 *  - handle rejectsions in functions
 *  - trim prompts with [\n\r]+(\w)
 *  - a step that allows for the user to run a process without generate a prompt / adding a message 
 *     consider a branchForEach ... to join() and the user wants to run a process from the results before
 *     generating a new prompt
 *  - branchForEach - current item in the loop is not accessible from the subsequent commands
 */


export interface Prompt {
  prompt: string;
  role: "user" | "assistant" | "system";
}

export interface Function {
  name: string;
  parameters: { [ key: string ]: any; };
  description: string;
}

interface CommandFunctionArgs<O extends Options, L extends Locals, M extends Metadata> {
  locals: L;
  chat: DSL<O, L, M>;
}
export type CommandFunction<O extends Options, L extends Locals, M extends Metadata, F> = ( args: CommandFunctionArgs<O, L, M> ) => F;

export interface Stream {
  user?: string;
  messages: Prompt[];
  functions: Function[];
  responseSize: number;
}

export interface Options {
  /**
   * the text message to send to the LLM
   */
  message: string;
  /**
   * an optional key that identifies the prompt. If the key is re-used the latest 
   * prompt will overwrite the prior
   */
  key?: string;
  /**
   * the visibility of the prompt, this value will not take effect until
   * after the message is sent to the LLM for a response
   */
  visibility?: Visibility;
  /**
   * the number of tokens to reserve for the response, this is linked with the
   * max token limit of the model. The difference between these two will be used 
   * for limiting the context to provide with the prompt
   */
  responseSize?: number;
  role?: Prompt[ "role" ];
}

export interface Locals {
  [ key: string ]: unknown;
}

export interface Settings {
  contextWindowSize?: number;
  minReponseSize?: number;
  maxCallStack?: number;
}
const DEFAULT_SETTINGS = {
  contextWindowSize: 4000,
  minReponseSize: 400,
  maxCallStack: 10,
};

export type TextResponse = {
  type: "text";
  content: string;
};

export type FunctionResponse = {
  type: "function";
  name: string;
  arguments: any;
};

export interface ChatChunk {
  id: string;
  type: "chat" | "sidebar";
  state: "open" | "closed";
  metadata?: { [ key: string ]: unknown; };
}

export interface MessageFinalChunk extends Omit<Message, "includes" | "codeBlocks" | "createdAt" | "updatedAt"> {
  id: string;
  type: "message";
  state: "final";
  chat: string;
}

export interface MessageStreamChunk extends Omit<Message, "includes" | "codeBlocks" | "createdAt" | "updatedAt" | "size"> {
  id: string;
  type: "message";
  state: "streaming";
  chat: string;
}

export interface CommandChunk {
  id: string;
  type: "command";
  content: string | Uint8Array;
}

export type Chunk = ChatChunk | MessageFinalChunk | MessageStreamChunk | CommandChunk | { type: "error"; error: unknown; };

export type StreamHandler = ( chunk: Chunk ) => void;

export type Metadata = undefined | { [ key: string ]: unknown; };

export interface ExpectHandlerArgs<O extends Options, L extends Locals, M extends Metadata> {
  response: ChatMessage,
  locals: L;
  chat: DSL<O, L, M>;
}
export type ExpectHandler<O extends Options, L extends Locals, M extends Metadata> = ( args: ExpectHandlerArgs<O, L, M> ) => Promise<void>;

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

export class DSL<O extends Options, L extends Locals, M extends Metadata> {

  llm: LLM;
  options: Omit<O, "message">;
  window: Window;
  data: Chat<M>;
  locals: L;
  rules: string[] = [];
  type: "chat" | "sidebar" = "chat";
  user?: string = undefined;
  settings: {
    contextWindowSize: number;
    minReponseSize: number;
    maxCallStack: number;
  };

  private functions: {
    [ key: string ]: (
      Function & {
        func: ( args: any ) => Promise<Options | O>;
        calls: number;
      }
    );
  } = {};
  private pipeline: Array<{
    id: string;
    command: string;
    promise: ( $this: DSL<O, L, M> ) => Promise<void>;
  }> = [];
  private pipelineCursor: number = -1; // manages current position in the pipeline
  private streamHandlers: StreamHandler[];

  constructor( { llm, options, locals, metadata, settings, window }: {
    llm: LLM;
    options: Omit<O, "message">;
    locals?: L;
    metadata?: M;
    settings?: Settings;
    window: Window;
  } ) {
    this.llm = llm;
    this.options = options;
    this.locals = locals || {} as L;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.streamHandlers = [];
    this.window = window;
    this.data = {
      id: uuid(),
      messages: [],
      sidebars: [],
      metadata: metadata,
      size: 0
    };
  }

  /**
   * 
   * @param options : the prompt options
   * @returns Promise<void>
   */
  private _prompt( $chat: DSL<O, L, M>, options: O ) {
    return () => new Promise<void>( async ( resolve, reject ) => {
      const messageTokens = $chat.llm.tokens( options.message ) + 3;
      const responseSize = ( options.responseSize || $chat.settings.minReponseSize );
      const functions = Object.keys( $chat.functions ).map( k => $chat.functions[ k ] );
      const functionTokens = functions
        .map( ( { name, description, parameters } ) => {
          let tokenCount = 7; // 7 for each function to start
          tokenCount += $chat.llm.tokens( `${ name }:${ description }` );
          if ( parameters ) {
            tokenCount += 3;
            Object.keys( parameters.properties ).forEach( key => {
              tokenCount += 3;
              const p_type = parameters.properties[ key ].type;
              const p_desc = parameters.properties[ key ].description;
              if ( p_type === "enum" ) {
                tokenCount += 3;  // Add tokens if property has enum list
                const options: string[] = parameters.properties[ key ].enum;
                options.forEach( ( v: any ) => {
                  tokenCount += 3;
                  tokenCount += $chat.llm.tokens( String( v ) );
                } );
              }
              tokenCount += $chat.llm.tokens( `${ key }:${ p_type }:${ p_desc }"` );
            } );
          }
          return tokenCount;
        } ).reduce( ( total, curr ) => total + curr, 0 );

      const limit = $chat.settings.contextWindowSize - responseSize - messageTokens - functionTokens;
      const messages = $chat.window( { messages: $chat.data.messages, tokenLimit: limit } );
      const messageId = uuid();
      const visibility = options.visibility !== undefined ? options.visibility : Visibility.OPTIONAL;
      const role = options.role || $chat.options.role || "user";
      const message: Message = {
        id: messageId,
        role: role,
        content: options.message.replaceAll( /\n\s+(\w)/gmi, '\n$1' ).trim(),
        size: messageTokens,
        visibility: visibility,
        context: messages.map( ( { id } ) => id! ),
        user: $chat.user,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      $chat.data.messages.push( message );
      $chat.out( { ...message, chat: $chat.data.id!, type: "message", state: "streaming" } );
      $chat.out( { ...message, chat: $chat.data.id!, type: "message", state: "final" } );
      const _options = { ...$chat.options, ...options, responseSize, visibility };
      const stream = $chat.llm.stream( {
        messages: [ ...messages.map( m => ( { prompt: m.content, role: m.role } ) ), { prompt: options.message, role } ],
        functions: functions,
        user: $chat.user,
        ..._options
      } );
      let buffer = true;
      let isFunction = false;
      let response = "";
      const funcs: Array<Function & { args: string; func: ( args: any ) => Promise<Options | O>; }> = [];
      const responseId = uuid();
      try {
        await ( async () => {
          for await ( const chunk of stream ) {
            if ( chunk.type === "function" ) {
              const func = $chat.functions[ chunk.name! ];
              if ( func !== undefined ) funcs.push( { ...func, args: chunk.arguments } );
              const content = `call: ${ chunk.name }(${ chunk.arguments })`;
              const functionSize = $chat.llm.tokens( content );
              const functionUuid = uuid();
              $chat.data.messages.push( {
                id: functionUuid,
                role: "assistant",
                content: content,
                size: functionSize + 3,
                visibility: Visibility.SYSTEM,
                createdAt: new Date(),
                updatedAt: new Date()
              } );
              $chat.out( {
                type: "message",
                state: "final",
                role: "assistant",
                content: content,
                size: functionSize + 3,
                chat: $chat.data.id!,
                id: functionUuid,
                visibility: Visibility.SYSTEM
              } );
            } else if ( buffer ) {
              response += chunk.content;
              if ( response.length >= 5 ) {
                if ( response.startsWith( "call:" ) ) {
                  isFunction = true;
                } else {
                  $chat.out( {
                    id: responseId,
                    type: "message",
                    state: "streaming",
                    role: "assistant",
                    content: response,
                    chat: $chat.data.id!,
                    visibility: Visibility.OPTIONAL
                  } );
                }
                buffer = false;
              }
            } else if ( isFunction ) {
              response += chunk.content.trim();
              const match = response.match( /call:\s(\w+?)\((.+?)\)/gi );
              if ( match ) {
                const name = match[ 1 ];
                const args = match[ 2 ];
                const func = $chat.functions[ name ];
                if ( func !== undefined ) funcs.push( { ...func, args: args } );
                isFunction = false;
                buffer = true;
                const functionUuid = uuid();
                $chat.data.messages.push( {
                  id: functionUuid,
                  role: "assistant",
                  content: response,
                  size: $chat.llm.tokens( response ) + 3,
                  visibility: Visibility.SYSTEM,
                  createdAt: new Date(),
                  updatedAt: new Date()
                } );
                response = "";
              }
            } else {
              response += chunk.content;
              $chat.out( {
                id: responseId,
                type: "message",
                state: "streaming",
                role: "assistant",
                content: chunk.content,
                chat: $chat.data.id!,
                visibility: Visibility.OPTIONAL
              } );
            }
          }
        } )();
      } catch ( error ) {
        reject( error );
        return;
      }
      if ( response.trim() !== "" ) {
        const blocks = extractBlocks( response );
        const responseSize = $chat.llm.tokens( response ) + 3;
        $chat.data.messages.push( {
          id: responseId,
          role: "assistant",
          content: response,
          size: responseSize,
          visibility: Visibility.OPTIONAL,
          codeBlocks: blocks.length > 0 ? blocks : undefined,
          createdAt: new Date(),
          updatedAt: new Date()
        } );
        $chat.out( {
          type: "message",
          state: "final",
          role: "assistant",
          content: response,
          size: responseSize,
          chat: $chat.data.id!,
          id: responseId,
          visibility: Visibility.OPTIONAL
        } );
      }
      let position = 1;
      const currentCommand = $chat.pipeline[ $chat.pipelineCursor ].command;
      for ( const func of funcs ) {
        const { func: promise, parameters, name, args } = func!;
        const calls = $chat.functions[ name ].calls;
        if ( calls > 2 && currentCommand === name ) {
          reject( `Function Loop - function: ${ name }` );
          return;
        }
        $chat.functions[ name ].calls += 1;
        // todo error handling for args
        let params: { [ key: string ]: unknown; } = {};
        try {
          params = args !== "" ? JSON.parse( args! ) : {};
        } catch ( error ) {
          // todo log
        }
        const prompt = await promise( { ...params, locals: $chat.locals, chat: $chat } );
        prompt.message = `here is the result of your call ${ name }(): ${ prompt.message.replaceAll( /\n\s+(\w)/gmi, '\n$1' ).trim() }`;
        prompt.role = "system";
        const command = { id: uuid(), command: name, promise: $chat._prompt( $chat, { ...$chat.options, ...prompt } as O ) };
        if ( $chat.pipelineCursor === $chat.pipeline.length ) {
          $chat.pipeline.push( command );
        } else {
          $chat.pipeline = [
            ...$chat.pipeline.slice( 0, $chat.pipelineCursor + position ),
            command,
            ...$chat.pipeline.slice( $chat.pipelineCursor + position )
          ];
        }
        position += 1;
      }
      resolve();
    } );
  }

  /**
   * create a sidebar associated with this chat, the metadata of the sidebar
   * will inherit the main chat's metadaa in addition to `parent` which will
   * be the id of the main chant
   * 
   * @param name: the name of the sidebar chat 
   * @returns 
   */
  sidebar() {
    // create a new chat and have a sidebar conversation
    const sidebar = new DSL<O, L, Metadata & { $parent: string; }>( {
      llm: this.llm,
      options: this.options,
      metadata: {
        ...this.data.metadata,
        $parent: this.data.id!
      },
      window: this.window
    } );
    this.data.sidebars.push( sidebar.data.id! );
    sidebar.data.user = this.data.user;
    sidebar.functions = this.functions;
    sidebar.rules = this.rules;
    sidebar.locals = { ...this.locals };
    sidebar.type = "sidebar";
    sidebar.settings = { ...this.settings };
    // todo apply the messages onto the sidebar
    return sidebar;
  }

  /**
   * 
   * @param id: a user id to associate with the chat and new prompts
   */
  setUser( id: string ) {
    const promise = ( $this: DSL<O, L, M> ) => new Promise<void>( ( resolve, reject ) => {
      $this.user = id;
      if ( $this.data.user === undefined ) $this.data.user = $this.user;
      resolve();
    } );
    this.pipeline.push( { id: uuid(), command: "setting user", promise } );
    return this;
  }

  /**
   * set the context for the chat
   * 
   * @param value 
   * @returns 
   */
  setLocals( locals: L ) {
    const promise = ( $this: DSL<O, L, M> ) => new Promise<void>( ( resolve, reject ) => {
      $this.locals = locals;
      resolve();
    } );
    this.pipeline.push( { id: uuid(), command: "setting locals", promise } );
    return this;
  }

  setMetadata( metadata: M ) {
    const promise = ( $this: DSL<O, L, M> ) => new Promise<void>( ( resolve, reject ) => {
      $this.data.metadata = metadata;
      resolve();
    } );
    this.pipeline.push( { id: uuid(), command: "setting metadata", promise } );
    return this;
  }

  /**
   * todo
   * add a message to the end of the chat without generating a prompt.
   * 
   * @param message - a custom message to add to the chat
   * @returns 
   */
  push( options: ( Options | O | CommandFunction<O, L, M, Options | O> ) ) {
    const promise = ( $this: DSL<O, L, M> ) => new Promise<void>( ( resolve, reject ) => {
      const messageId = uuid();
      const _options: ( Options | O ) = typeof options === "function" ? options( { locals: $this.locals, chat: $this } ) : options;
      const visibility = _options.visibility !== undefined ? _options.visibility : Visibility.OPTIONAL;
      const content = _options.message.replaceAll( /\n\s+(\w)/gmi, '\n$1' ).trim();
      const message: Message = {
        id: messageId,
        role: _options.role || $this.options.role || "user",
        content: content,
        size: $this.llm.tokens( content ) + 3,
        visibility: visibility,
        createdAt: new Date(),
        updatedAt: new Date(),
        context: [],
        user: $this.user
      };
      $this.data.messages.push( message );
      $this.out( { ...message, chat: $this.data.id!, type: "message", state: "streaming" } );
      $this.out( { ...message, chat: $this.data.id!, type: "message", state: "final" } );
      resolve();
    } );
    this.pipeline.push( { id: uuid(), command: "push", promise } );
    return this;
  }

  /**
   * load a chat from storage
   * 
   * @param {string} id - a chat uuid 
   * @returns {object} - the chat object   
   */
  load( func: ( id: string ) => Chat<M> | Promise<Chat<M>> ) {
    const promise = ( $this: DSL<O, L, M> ) => new Promise<void>( async ( resolve, reject ) => {
      const result = func( "someId" );
      if ( result instanceof Promise ) {
        $this.data = await result;
      } else {
        $this.data = result;
      }
    } );
    this.pipeline.push( { id: uuid(), command: "load", promise } );
    return this;
  }

  /**
   * create a clone of the chat pipeline with unique ids and as new object in memory
   * 
   * @returns a clone of the chat object
   */
  clone() {
    const $this = cloneDeep( this );
    $this.data.id = uuid();
    $this.data.messages = $this.data.messages.map( m => {
      const index = $this.rules.indexOf( m.id! );
      m.id = uuid();
      if ( index !== -1 ) {
        $this.rules[ index ] = m.id;
      }
      return m;
    } );
    return $this;
  }

  /**
   * create a rule for the chat
   * 
   * @param options 
   * @returns {object} - the chat object
   */
  rule( options: ( Rule | CommandFunction<O, L, M, Rule> ) ) {
    const promise = ( $this: DSL<O, L, M> ) => {
      const { name, requirement, key }: Rule = typeof options === "function" ? options( { locals: $this.locals, chat: $this } ) : options;
      const content = `This conversation has the following rule: Rule ${ name } - requirement - ${ requirement }`;
      return new Promise<void>( ( resolve, reject ) => {
        const ruleId = uuid();
        const _key = key || `Rule - ${ name }`;
        const index = $this.data.messages.map( m => m.key ).indexOf( _key );
        if ( index === -1 || $this.data.messages[ index ].content !== content ) {
          $this.data.messages.push( {
            id: ruleId,
            role: "system",
            key: _key,
            content: content,
            size: $this.llm.tokens( content ),
            visibility: Visibility.REQUIRED,
            createdAt: new Date(),
            updatedAt: new Date()
          } );
          $this.rules.push( ruleId );
        }
        resolve();
      } );
    };
    this.pipeline.push( { id: uuid(), command: "rule", promise } );
    return this;
  }

  /**
   * create a function the LLM can call from the chat
   * 
   * @param options 
   * @returns {object} - the chat object
   */
  function<F>( options: Function & { func: ( args: F & { locals: L, chat: DSL<O, L, M>; } ) => Promise<Options | O>; } ) {
    const { name } = options;
    this.functions[ name ] = { ...options, calls: 0 };
    return this;
  }

  /**
   * send a new prompt to the LLM including the chat history
   * 
   * @param options 
   * @returns {object} - the chat object   
   */
  prompt( options: ( Options | O | CommandFunction<O, L, M, Options | O> ) ) {
    const promise = ( $this: DSL<O, L, M> ) => {
      return new Promise<void>( ( resolve, reject ) => {
        const _options: ( Options | O ) = typeof options === "function" ? options( { locals: $this.locals, chat: $this } ) : options;
        $this._prompt( $this, { ...$this.options, ..._options } as O )()
          .then( () => resolve() )
          .catch( reject );
      } );
    };
    this.pipeline.push( { id: uuid(), command: "prompt", promise } );
    return this;
  }
  /**
   * a hook to direclty access the LLM response of the latest prompt
   * 
   * @param func 
   * @returns {object} - the chat object   
   */
  response( func: ( args: { response: ChatMessage, locals: L, chat: DSL<O, L, M>; } ) => Promise<void> ) {
    const promise = ( $this: DSL<O, L, M> ) => {
      return new Promise<void>( ( resolve, reject ) => {
        func( { response: $this.data.messages[ $this.data.messages.length - 1 ], locals: $this.locals, chat: $this } )
          .then( resolve )
          .catch( reject );
      } );
    };
    this.pipeline.push( { id: uuid(), command: "response", promise } );
    return this;
  }

  /**
   * Establish expectations for the response from the Language Model (LLM) and initiate a dispute resolution process if necessary.
   * When the 'reject' method is called, you can provide a message outlining your criteria, and a sidebar chat will be created to resolve
   * any discrepancies between the LLM's response and your expectations.
   * 
   * The sidebar chat will persistently evaluate LLM responses through the 'expect' method until the response aligns with your expectations
   * or the maximum retry limit is reached.
   * 
   * @param {function(response: ChatMessage): Promise<void>} func - A function to assess the LLM response.
   * @returns {object} - The chat object that can be used for further interactions.
   */
  expect( handler: ExpectHandler<O, L, M>, ...others: ExpectHandler<O, L, M>[] ) {
    const handlers = [ handler, ...others ];
    for ( const handler of handlers ) {
      const stageId = uuid();
      const promise = ( $this: DSL<O, L, M> ) => {
        return new Promise<void>( async ( resolve, reject ) => {
          const response = $this.data.messages[ $this.data.messages.length - 1 ];
          handler( { response: response, locals: $this.locals, chat: $this } )
            .then( () => resolve() )
            .catch( expectation => {
              if ( typeof expectation !== "string" ) {
                reject( expectation );
                return;
              }
              // an expecatation was thrown
              // push an dispute prompt as the next stage
              // followed by this expect promise again so it can be re-evaluated
              $this.pipeline = [
                ...$this.pipeline.slice( 0, $this.pipelineCursor + 1 ),
                {
                  id: stageId,
                  command: `dispute`,
                  promise: $this._prompt( $this, {
                    ...$this.options,
                    role: "system",
                    visibility: Visibility.SYSTEM,
                    message: `the prior response did not meet expectations: ${ expectation }`,
                    responseSize: Math.floor( $this.settings.contextWindowSize * 0.25 )
                  } as O
                  )
                },
                ...$this.pipeline.slice( $this.pipelineCursor )
              ];
              resolve();
            } );
        } );
      };
      this.pipeline.push( { id: stageId, command: "expect", promise } );
    }
    return this;
  }

  /**
   * create 1 or more prompts from the chat context
   * 
   * @param func 
   * @returns {object} - the chat object   
   */
  promptForEach( func: CommandFunction<O, L, M, ( Options | O )[]> ) {
    const promise = ( $this: DSL<O, L, M> ) => {
      return new Promise<void>( ( resolve, reject ) => {
        const promises = func( { locals: $this.locals, chat: $this } )
          .map( p => {
            return { id: uuid(), command: "prompt", promise: $this._prompt( $this, { ...$this.options, ...p } as O ) };
          } );
        $this.pipeline = [
          ...$this.pipeline.slice( 0, $this.pipelineCursor + 1 ),
          ...promises,
          ...$this.pipeline.slice( $this.pipelineCursor + 1 )
        ];
        resolve();
      } );
    };
    this.pipeline.push( { id: uuid(), command: "promptForEach", promise } );
    return this;
  }

  /**
   * create a branch of prompts from the chat context. Each branch will include all
   * prompts up to a .join() command.
   * 
   * @param func 
   * @returns {object} - the chat object   
   */
  branchForEach( func: CommandFunction<O, L, M, ( Options | O )[]> ) {
    const promise = ( $this: DSL<O, L, M> ) => {
      return new Promise<void>( ( resolve, reject ) => {
        const promises = func( { locals: $this.locals, chat: $this } ).map( p => {
          return { id: uuid(), command: "prompt", promise: $this._prompt( $this, { ...$this.options, ...p } as O ) };
        } );
        const joinIndex = $this.pipeline.slice( $this.pipelineCursor ).map( p => p.command ).indexOf( "join" );
        if ( joinIndex === -1 ) {
          reject( "branchForEach requires a join()" );
          return;
        }
        $this.pipeline = [
          ...$this.pipeline.slice( 0, $this.pipelineCursor + 1 ),
          ...promises.flatMap( p => [ p, ...$this.pipeline.slice( $this.pipelineCursor + 1, joinIndex + $this.pipelineCursor ) ] ),
          ...$this.pipeline.slice( joinIndex + $this.pipelineCursor + 1 )
        ];
        resolve();
      } );
    };
    this.pipeline.push( { id: uuid(), command: "branchForEach", promise } );
    return this;
  }

  /**
   * establishes a stopping point for the `branchForEach`
   * @returns {object} - the chat object   
   */
  join() {
    // see forEachBranch
    this.pipeline.push( { id: uuid(), command: "join", promise: ( $this: DSL<O, L, M> ) => new Promise<void>( ( resolve ) => resolve() ) } );
    return this;
  }

  /***
   * 
   */
  private out( chunk: Chunk ) {
    this.streamHandlers.forEach( handler => handler( chunk ) );
  }

  /**
   * a handler to receive the stream of text
   * 
   * @param output 
   * @returns 
   */
  async stream( handler: StreamHandler, ...others: StreamHandler[] ) {
    this.streamHandlers = [ handler, ...others ];
    return this.execute();
  }

  /**
   * executes the pipeline
   * 
   * @returns {Promise}
   */
  async execute() {
    return new Promise<DSL<O, L, M>>( async ( resolve, reject ) => {
      // todo validate the commands e.g. a branchForEach as a join
      try {
        let hasNext = true;
        this.out( { type: this.type, id: this.data.id!, state: "open" } );
        while ( hasNext ) {
          this.pipelineCursor += 1;
          const stage = this.pipeline[ this.pipelineCursor ];
          if ( stage === undefined ) break;
          const { promise, command, id } = stage;
          const slice = this.pipeline.slice( 0, this.pipelineCursor );
          let stackCount = 0;
          for ( var i = slice.length - 1; i >= 0; i-- ) {
            const { id: _id } = slice[ i ];
            if ( id !== _id ) break;
            stackCount += 1;
          }
          if ( stackCount >= this.settings.maxCallStack ) {
            reject( `Max Call Stack Exceeded - Stage ${ command }: ${ id } - chat: ${ this.data.id }` );
            break;
          }
          this.out( { id: stage.id, type: "command", content: `command: ${ command }\n` } );
          await promise( this );
        }
        const totalTokens = this.data.messages.reduce( ( prev, curr ) => {
          return prev + curr.size;
        }, 0 );
        this.data.size = totalTokens;
        resolve( this );
      } catch ( error ) {
        this.out( { type: "error", error } );
        reject( error );
      } finally {
        this.out( { type: this.type, id: this.data.id!, state: "closed" } );
      }
    } );
  }
}