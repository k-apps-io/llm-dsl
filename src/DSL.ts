import JSON from "json5";
import { cloneDeep } from "lodash";
import { v4 as uuid } from "uuid";
import { Chat, Message } from "./Chat";
import { extract } from "./CodeBlocks";
import { ResponseStage } from "./Expect";
import { Function, LLM, Prompt } from "./LLM";
import { Rule } from "./Rules";
import { ChatStorage, NoStorage } from "./Storage";
import { Chunk, StreamHandler } from "./Stream";
import { Visibility, Window, main } from "./Window";
import { LoopError, detectLoop } from "./utilities";

/**
 * TODOs
 *  - a step that allows for the user to run a process without generate a prompt / adding a message 
 *     consider a branchForEach ... to join() and the user wants to run a process from the results before
 *     generating a new prompt
 *  - branchForEach - current item in the loop is not accessible from the subsequent commands
 */

interface StageFunctionArgs<O extends Options, L extends Locals, M extends Metadata> {
  locals: L;
  chat: DSL<O, L, M>;
}
type StageFunction<O extends Options, L extends Locals, M extends Metadata, F> = ( args: StageFunctionArgs<O, L, M> ) => F;


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
/**
 * 
 */
export interface Locals {
  [ key: string ]: any;
}

export interface Settings {
  windowSize: number;
  minResponseSize: number;
  maxCallStack: number;
}
const DEFAULT_SETTINGS: Settings = {
  windowSize: 4000,
  minResponseSize: 400,
  maxCallStack: 10,
};

export type Metadata = undefined | { [ key: string ]: unknown; };

export class DSL<O extends Options, L extends Locals, M extends Metadata> {

  llm: LLM;
  options: Omit<O, "message">;
  window: Window;
  storage: ChatStorage;
  data: Chat<M>;
  locals: L;
  rules: string[] = [];
  type: "chat" | "sidebar" = "chat";
  user?: string = undefined;
  settings: Settings;

  functions: {
    [ key: string ]: (
      Function & {
        func: ( args: any ) => Promise<Options | O>;
        calls: number;
      }
    );
  } = {};
  pipeline: Array<{
    id: string;
    stage: string;
    promise: ( $this: DSL<O, L, M> ) => Promise<void>;
  }> = [];

  exitCode?: 1 | Error = undefined;
  /**
   * manages the current position of the pipeline
   */
  private pipelineCursor: number = -1;
  /**
   * these are the stream handlers that will receive any this.out calls
   */
  private streamHandlers: StreamHandler[] = [];

  constructor( { llm, options, locals, metadata, settings, window, storage }: {
    llm: LLM;
    options?: Omit<O, "message">;
    locals?: L;
    metadata?: M;
    storage?: ChatStorage;
    settings?: {
      windowSize?: number;
      minResponseSize?: number;
      maxCallStack?: number;
    };
    window?: Window;
  } ) {
    this.llm = llm;
    this.options = options || {} as Omit<O, "message">;
    this.locals = locals || {} as L;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.window = window || main;
    this.storage = storage || NoStorage;
    this.data = {
      id: uuid(),
      messages: [],
      sidebars: [],
      metadata: metadata,
      size: 0
    };
  }

  /**
   * create a sidebar associated with this chat, the metadata of the sidebar
   * will inherit the main chat's metadata in addition to `parent` which will
   * be the id of the main chat.
   * 
   * @returns DSL
   */
  sidebar( { rules: _rules, functions: _functions, locals: _locals }: { rules?: boolean; functions?: boolean; locals?: boolean; } = {} ) {
    // create a new chat and have a sidebar conversation
    const sidebar = new DSL<O, L, Metadata & { $parent: string; }>( {
      llm: this.llm,
      options: this.options,
      metadata: {
        ...( this.data.metadata || {} ),
        $parent: this.data.id!
      },
      window: this.window,
    } );
    this.data.sidebars.push( sidebar.data.id! );
    sidebar.data.user = this.data.user;
    if ( _rules ) sidebar.pipeline = cloneDeep( this.pipeline.filter( p => p.stage === "rule" ) ) as any;
    if ( _functions ) sidebar.functions = this.functions;
    if ( _locals ) sidebar.locals = { ...this.locals };
    sidebar.type = "sidebar";
    sidebar.settings = { ...this.settings };
    return sidebar;
  }

  /**
   * apply an identifier representing the user generating the prompts.
   * 
   * @param id: a user id to associate with the chat and new prompts
   */
  setUser( id: string ) {
    const promise = ( $this: DSL<O, L, M> ) => new Promise<void>( ( resolve, reject ) => {
      $this.user = id;
      if ( $this.data.user === undefined ) $this.data.user = $this.user;
      resolve();
    } );
    this.pipeline.push( { id: uuid(), stage: "user", promise } );
    return this;
  }

  /**
   * set locals for the chat
   * 
   * @param value: L
   * @returns DSL
   */
  setLocals( args: ( L | ( ( args: { chat: DSL<O, L, M>; } ) => L | Promise<L> ) ), id: string = uuid() ) {
    const promise = ( $this: DSL<O, L, M> ) => new Promise<void>( ( resolve, reject ) => {
      if ( typeof args === "function" ) {
        const result = args( { chat: $this } );
        if ( result instanceof Promise ) {
          result
            .then( locals => {
              $this.locals = { ...$this.locals, ...locals };
              resolve();
            } )
            .catch( reject );
        } else {
          $this.locals = { ...$this.locals, ...result };
          resolve();
        }
      } else {
        $this.locals = { ...$this.locals, ...args };
        resolve();
      }
    } );
    this.pipeline.push( { id: id, stage: "locals", promise } );
    return this;
  }

  /**
   * set metadata for the chat
   */
  setMetadata( args: ( M | ( ( _args: { chat: DSL<O, L, M>; } ) => M | Promise<M> ) ), id: string = uuid() ) {
    const promise = ( $this: DSL<O, L, M> ) => new Promise<void>( ( resolve, reject ) => {
      const metadata = $this.data.metadata || {};
      if ( typeof args === "function" ) {
        const result = args( { chat: $this } );
        if ( result instanceof Promise ) {
          result
            .then( m => {
              $this.data.metadata = { ...metadata, ...m };
              resolve();
            } )
            .catch( reject );
        } else {
          $this.data.metadata = { ...metadata, ...result };
          resolve();
        }
      } else {
        $this.data.metadata = { ...metadata, ...args };
        resolve();
      }
    } );
    this.pipeline.push( { id: id, stage: "metadata", promise } );
    return this;
  }

  /**
   * add a message to the chat without generating a prompt.
   */
  push( options: ( Options | O | StageFunction<O, L, M, Options | O> ), id: string = uuid() ) {
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
        window: [],
        user: $this.user,
        prompt: messageId,
      };
      $this.data.messages.push( message );
      $this.out( { ...message, chat: $this.data.id!, type: "message" } );
      resolve();
    } );
    this.pipeline.push( { id: id, stage: "push", promise } );
    return this;
  }

  /**
   * send a new prompt to the LLM including the chat history
   * 
   * @param options 
   * @returns {object} - the chat object   
   */
  prompt( options: ( Options | O | StageFunction<O, L, M, Options | O> ), id: string = uuid() ) {
    const promise = ( $this: DSL<O, L, M> ) => {
      return new Promise<void>( ( resolve, reject ) => {
        const _options: ( Options | O ) = typeof options === "function" ? options( { locals: $this.locals, chat: $this } ) : options;
        $this._prompt( $this, { ...$this.options, ..._options } as O )()
          .then( () => resolve() )
          .catch( reject );
      } );
    };
    this.pipeline.push( { id: id, stage: "prompt", promise } );
    return this;
  }

  /**
   * create 1 or more prompts from the chat context
   * 
   * @param func 
   * @returns {object} - the chat object   
   */
  promptForEach( func: StageFunction<O, L, M, ( Options | O )[]>, id: string = uuid() ) {
    const promise = ( $this: DSL<O, L, M> ) => {
      return new Promise<void>( ( resolve, reject ) => {
        const promises = func( { locals: $this.locals, chat: $this } )
          .map( p => {
            return { id: uuid(), stage: "prompt", promise: $this._prompt( $this, { ...$this.options, ...p } as O ) };
          } );
        $this.pipeline = [
          ...$this.pipeline.slice( 0, $this.pipelineCursor + 1 ),
          ...promises,
          ...$this.pipeline.slice( $this.pipelineCursor + 1 )
        ];
        resolve();
      } );
    };
    this.pipeline.push( { id: id, stage: "promptForEach", promise } );
    return this;
  }

  /**
   * create a branch of prompts from the chat context. Each branch will include all
   * prompts up to a .join() command.
   * 
   * @param func 
   * @returns {object} - the chat object   
   */
  branchForEach( func: StageFunction<O, L, M, ( Options | O )[]>, id: string = uuid() ) {
    const promise = ( $this: DSL<O, L, M> ) => {
      return new Promise<void>( ( resolve, reject ) => {
        const promises = func( { locals: $this.locals, chat: $this } ).map( p => {
          return { id: uuid(), stage: "prompt", promise: $this._prompt( $this, { ...$this.options, ...p } as O ) };
        } );
        const joinIndex = $this.pipeline.slice( $this.pipelineCursor ).map( p => p.stage ).indexOf( "join" );
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
    this.pipeline.push( { id: id, stage: "branchForEach", promise } );
    return this;
  }

  /**
   * establishes a stopping point for the `branchForEach`
   */
  join( id: string = uuid() ) {
    // see forEachBranch
    this.pipeline.push( { id: id, stage: "join", promise: ( $this: DSL<O, L, M> ) => new Promise<void>( ( resolve ) => resolve() ) } );
    return this;
  }

  /**
   * load a chat from storage
   * 
   * @param {string} id - a chat id 
   * @returns {object} - the chat object   
   */
  load( id: string, stageId: string = uuid() ) {
    const promise = ( $this: DSL<O, L, M> ) => new Promise<void>( async ( resolve, reject ) => {
      const result = $this.storage.getById( id );
      if ( result instanceof Promise ) {
        result
          .then( data => {
            $this.data = data;
            resolve();
          } )
          .catch( reject );
      } else {
        $this.data = result;
        resolve();
      }
    } );
    this.pipeline.push( { id: stageId, stage: "load", promise } );
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
  rule( options: ( Rule | StageFunction<O, L, M, Rule> ) ) {
    const promise = ( $this: DSL<O, L, M> ) => {
      const { name, requirement, key, id }: Rule = typeof options === "function" ? options( { locals: $this.locals, chat: $this } ) : options;
      const content = `This conversation has the following rule: Rule ${ name } - requirement - ${ requirement }`;
      return new Promise<void>( ( resolve, reject ) => {
        const ruleId = id || uuid();
        const _key = key || `Rule - ${ name }`;
        const index = $this.data.messages.map( m => m.key ).indexOf( _key );
        if ( index === -1 || $this.data.messages[ index ].content !== content ) {
          $this.data.messages.push( {
            id: ruleId,
            role: "system",
            key: _key,
            content: content,
            size: $this.llm.tokens( content ) + 3,
            visibility: Visibility.REQUIRED,
            createdAt: new Date(),
            prompt: ruleId
          } );
          $this.rules.push( ruleId );
        }
        resolve();
      } );
    };
    this.pipeline.push( { id: uuid(), stage: "rule", promise } );
    return this;
  }

  /**
   * add a function the LLM can call from the chat
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
   * directly access the LLM response the latest prompt.
   */
  response( func: ResponseStage<O, L, M>, id: string = uuid() ) {
    const promise = ( $this: DSL<O, L, M> ) => {
      return func( { response: $this.data.messages[ $this.data.messages.length - 1 ], locals: $this.locals, chat: $this } );
    };
    this.pipeline.push( { id: id, stage: "response", promise } );
    return this;
  }

  /**
   * Establish expectations for the response from the LLM.
   * When the 'reject' method is called, you can provide a message outlining your criteria. This rejection then becomes
   * a new prompt to the LLM which again the response is evaluted against the expecations. 
   * 
   * this doesn't support stage id assignment b/c of the rest arguments
   * 
   */
  expect( handler: ResponseStage<O, L, M>, ...others: ResponseStage<O, L, M>[] ) {
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
                  stage: `dispute`,
                  promise: $this._prompt( $this, {
                    ...$this.options,
                    role: "system",
                    visibility: Visibility.SYSTEM,
                    message: expectation,
                    responseSize: Math.floor( $this.settings.windowSize * 1.25 )
                  } as O
                  )
                },
                ...$this.pipeline.slice( $this.pipelineCursor )
              ];
              resolve();
            } );
        } );
      };
      this.pipeline.push( { id: stageId, stage: "expect", promise } );
    }
    return this;
  }

  /**
   * handlers to receive the chat stream and execute the pipeline
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
      try {
        let hasNext = true;
        this.out( { type: this.type, id: this.data.id!, state: "open" } );
        while ( hasNext ) {

          // check for an exit code
          if ( this.exitCode ) {
            if ( this.exitCode !== 1 ) throw this.exitCode;
            hasNext = false;
            continue;
          }

          // evaluate the call stack for a loop
          const slice = this.pipeline.slice( 0, this.pipelineCursor );
          const result = detectLoop( slice.map( ( { id } ) => id ), this.settings.maxCallStack );
          if ( result.loop ) throw new LoopError( result );

          // perform the stage
          this.pipelineCursor += 1;
          const item = this.pipeline[ this.pipelineCursor ];
          if ( item === undefined ) break;
          const { promise, stage, id } = item;
          this.out( { id: id, type: "stage", content: stage } );
          await promise( this );
        }
        const totalTokens = this.data.messages.reduce( ( prev, curr ) => {
          return prev + curr.size;
        }, 0 );
        this.data.size = totalTokens;
        resolve( this );
      } catch ( error ) {
        this.out( { id: uuid(), type: "error", error } );
        reject( error );
      } finally {
        this.out( { type: this.type, id: this.data.id!, state: "closed" } );
      }
    } );
  }

  /**
   * when called the pipeline will stop executing after the current stage is completed. If an error is provided this
   * will be thrown as a new Error()
   */
  exit( error: Error | 1 = 1 ) {
    this.exitCode = error;
  }

  /**
   * 
   */
  pause( func: ( args: { chat: DSL<O, L, M>, locals: L; } ) => ( void | Promise<void> ), id: string = uuid() ) {
    const promise = ( $this: DSL<O, L, M> ) => {
      return new Promise<void>( async ( resolve, reject ) => {
        const result = func( { locals: $this.locals, chat: $this } );
        if ( result instanceof Promise ) {
          result.then( resolve ).catch( reject );
        } else {
          resolve();
        };
      } );
    };
    this.pipeline.push( { id: id, stage: "pause", promise } );
    return this;
  }

  /**
   * sets the position of the pipeline to the stage with the provided id. If a id matches the stage will be executed
   * next and continue from that position. If a stage is not found a error is thrown.
   */
  moveTo( { id }: { id: string; } ) {
    const promise = ( $this: DSL<O, L, M> ) => {
      return new Promise<void>( ( resolve, reject ) => {
        const index = $this.pipeline.findIndex( ( { id: _id } ) => _id === id );
        if ( index === -1 ) {
          return reject( new Error( `No Pipeline Stage with id ${ id }` ) );
        }
        // apply the prior index b/c the execute process auto increments the
        // pipelineCursor by 1 before each stage
        $this.pipelineCursor = index - 1;
        resolve();
      } );
    };
    this.pipeline = [
      ...this.pipeline.slice( 0, this.pipelineCursor + 1 ),
      { id: uuid(), stage: "seek", promise },
      ...this.pipeline.slice( this.pipelineCursor + 1 )
    ];
    return this;
  }

  /**
   * 
   * @param options : the prompt options
   * @returns Promise<void>
   */
  private _prompt( $chat: DSL<O, L, M>, options: O, prompt?: string ) {
    return () => new Promise<void>( async ( resolve, reject ) => {
      // token calculation is based off https://stackoverflow.com/questions/77168202/calculating-total-tokens-for-api-request-to-chatgpt-including-functions
      const messageTokens = $chat.llm.tokens( options.message ) + 3;
      const responseSize = ( options.responseSize || $chat.settings.minResponseSize );
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

      const limit = $chat.settings.windowSize - responseSize - messageTokens - functionTokens;
      const messages = $chat.window( { messages: $chat.data.messages, tokenLimit: limit, key: options.key } );
      const messageId = uuid();
      const visibility = options.visibility !== undefined ? options.visibility : Visibility.OPTIONAL;
      const role = options.role || $chat.options.role || "user";
      const message: Message = {
        id: messageId,
        key: options.key,
        role: role,
        content: options.message.replaceAll( /\n\s+(\w)/gmi, '\n$1' ).trim(),
        size: messageTokens,
        visibility: visibility,
        window: messages.map( ( { id } ) => id! ),
        windowSize: messages.reduce( ( total, curr ) => total + curr.size, 0 ),
        user: $chat.user,
        createdAt: new Date(),
        prompt: prompt || messageId
      };
      $chat.data.messages.push( message );
      $chat.out( { ...message, type: "message", chat: $chat.data.id! } );
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
              const functionSize = $chat.llm.tokens( content ) + 3;
              const functionUuid = uuid();
              const functionMessage: Message = {
                id: functionUuid,
                role: "assistant",
                content: content,
                size: functionSize,
                visibility: options.visibility !== undefined ? options.visibility : Visibility.SYSTEM,
                createdAt: new Date(),
                prompt: prompt || messageId
              };
              $chat.data.messages.push( functionMessage );
              $chat.out( {
                ...functionMessage,
                type: "message",
                chat: $chat.data.id!
              } );
            } else if ( buffer ) {
              response += chunk.content;
              if ( response.length >= 5 ) {
                if ( response.startsWith( "call:" ) ) {
                  isFunction = true;
                } else {
                  $chat.out( {
                    id: responseId,
                    type: "response",
                    role: "assistant",
                    content: response,
                    chat: $chat.data.id!,
                    visibility: visibility,
                    prompt: prompt || messageId
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
                const functionMessage: Message = {
                  id: functionUuid,
                  role: "assistant",
                  content: response,
                  size: $chat.llm.tokens( response ) + 3,
                  visibility: options.visibility !== undefined ? options.visibility : Visibility.SYSTEM,
                  createdAt: new Date(),
                  prompt: prompt || messageId
                };
                $chat.data.messages.push( functionMessage );
                $chat.out( { ...functionMessage, chat: $chat.data.id!, type: "message" } );
                response = "";
              }
            } else {
              response += chunk.content;
              $chat.out( {
                id: responseId,
                type: "response",
                role: "assistant",
                content: chunk.content,
                chat: $chat.data.id!,
                visibility: visibility,
                prompt: prompt || messageId
              } );
            }
          }
        } )();
      } catch ( error ) {
        reject( error );
        return;
      }
      // response has finished streaming
      if ( response.trim() !== "" ) {
        const blocks = extract( response );
        const responseSize = $chat.llm.tokens( response ) + 3;
        const responseMessage: Message = {
          id: responseId,
          role: "assistant",
          content: response,
          size: responseSize,
          visibility: visibility,
          codeBlocks: blocks.length > 0 ? blocks : undefined,
          createdAt: new Date(),
          prompt: prompt || messageId
        };
        $chat.data.messages.push( responseMessage );
        $chat.out( { ...responseMessage, type: "message", chat: $chat.data.id! } );
      }

      // evaluate the functions is one was called;
      let position = 1;
      const currentStage = $chat.pipeline[ $chat.pipelineCursor ].stage;
      for ( const func of funcs ) {
        const { func: promise, parameters, name, args } = func!;
        const calls = $chat.functions[ name ].calls;
        if ( calls > 2 && currentStage === name ) {
          // this function has been called multiple times within the current stage
          //  which is going to be treated as a never resolving loop.
          reject( new Error( `Function Loop - function: ${ name }` ) );
          return;
        }
        $chat.functions[ name ].calls += 1;
        // todo error handling for args
        let params: { [ key: string ]: unknown; } = {};
        try {
          params = args !== "" ? JSON.parse( args! ) : {};
        } catch ( error ) {
          $chat.out( { id: uuid(), type: "error", error } );
        }
        let result: O | Options;
        try {
          result = await promise( { ...params, locals: $chat.locals, chat: $chat } );
          result.message = `call ${ name }() -> ${ result.message.replaceAll( /\n\s+(\w)/gmi, '\n$1' ).trim() }`;
        } catch ( error ) {
          result = {
            message: `call ${ name }() -> ${ error }`
          };
        }
        result.role = "system";
        result.visibility = options.visibility !== undefined ? options.visibility : Visibility.SYSTEM;
        const stage = { id: uuid(), stage: name, promise: $chat._prompt( $chat, { ...$chat.options, ...result } as O, prompt || messageId ) };
        if ( $chat.pipelineCursor === $chat.pipeline.length ) {
          // end of the chat, just need to push the new stage
          $chat.pipeline.push( stage );
        } else {
          // middle of pipeline, we need to insert the stage in the current position and shift all subsequent stages
          $chat.pipeline = [
            ...$chat.pipeline.slice( 0, $chat.pipelineCursor + position ),
            stage,
            ...$chat.pipeline.slice( $chat.pipelineCursor + position )
          ];
        }
        position += 1;
      }
      resolve();
    } );
  }

  /***
   * evaluates the Chunk across all stream handlers
   */
  private out( chunk: Chunk ) {
    this.streamHandlers.forEach( handler => handler( chunk ) );
  }
}