import { cloneDeep } from "lodash";
import { v4 as uuid } from "uuid";
import { Chat, Message as ChatMessage, Message, Visibility } from "./Chat";
import extractBlocks from "./CodeBlocks";
import { Rule } from "./Rules";
import ChatStorage from "./Storage";


export interface Prompt {
  prompt: string;
  role: "user" | "assistant" | "system";
}

export interface Function {
  name: string;
  parameters: { [ key: string ]: any; };
  description: string;
}

export interface FunctionArguments<O extends Options, L extends { [ key: string ]: unknown; }> {
  locals: L;
  chat: DSL<O, L>;
}

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
  type: "chat" | "sidebar";
  id: string;
  state: "open" | "closed";
  metadata?: { [ key: string ]: unknown; };
}
export interface MessageChunk extends Omit<Message, "includes" | "codeBlocks" | "createdAt" | "updatedAt"> {
  type: "message";
  state: "streaming" | "final";
  chat: string;
}

export interface CommandChunk {
  type: "command";
  content: string | Uint8Array;
}

export type CommandFunction<L extends { [ key: string ]: unknown; }, O extends Options, F> = ( locals: L, chat: DSL<O, L> ) => F;

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

export class DSL<O extends Options, L extends { [ key: string ]: unknown; }> {

  llm: LLM;
  storage: ChatStorage;
  options: Omit<O, "message">;
  data: Chat;
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
    command: string;
    promise: ( $this: DSL<O, L> ) => Promise<void>;
  }> = [];
  private pipelineCursor: number = -1; // manages current position in the pipeline
  private out: ( data: ChatChunk | MessageChunk | CommandChunk ) => void = () => { };

  constructor( { llm, storage, options, locals, metadata, settings }: {
    llm: LLM;
    storage: ChatStorage;
    options: Omit<O, "message">;
    locals?: L;
    metadata?: { [ key: string ]: any; };
    settings?: Settings;
  } ) {
    this.llm = llm;
    this.storage = storage;
    this.options = options;
    this.locals = locals || {} as L;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.data = {
      id: uuid(),
      name: "Not Named", // todo move to metadata
      messages: [],
      sidebars: [],
      metadata: metadata
    };
  }

  /**
   * 
   * @param options : the prompt options
   * @returns Promise<void>
   */
  private _prompt( $chat: DSL<O, L>, options: O ) {
    return () => new Promise<void>( async ( resolve, reject ) => {
      const messageTokens = $chat.llm.tokens( options.message );
      const responseSize = ( options.responseSize || Math.floor( this.settings.minReponseSize ) );
      const limit = $chat.settings.contextWindowSize - responseSize;

      // prepare the messages
      //  reduce to the latest keys
      //  calculate the message size
      let messages = ( cloneDeep( this.data.messages ) as Chat[ "messages" ] )
        .reduce( ( prev, curr ) => {
          if ( curr.key !== undefined ) {
            const prevIndex = prev.map( p => p.key ).indexOf( curr.key );
            // remove the preivous key
            if ( prevIndex > -1 ) prev.splice( prevIndex );
          }
          // add the message
          prev.push( curr );
          return prev;
        }, [] as Chat[ "messages" ] )
        .map( m => {
          // const size = this.size;
          const size = $chat.llm.tokens( m.content );
          return { ...m, size: size };
        } )
        ;

      const required = messages.filter( m => m.visibility === Visibility.REQUIRED );
      const functions = Object.keys( $chat.functions ).map( k => $chat.functions[ k ] );
      const requiredTokens = required.reduce( ( total, curr ) => total + curr.size, 0 );
      const functionTokens = functions.map( ( { name, description, parameters } ) => $chat.llm.tokens( JSON.stringify( { name, description, parameters } ) ) ).reduce( ( total, curr ) => total + curr, 0 );
      let totalTokens = requiredTokens + messageTokens + functionTokens;

      // build the message window
      messages = [
        ...required
        , ...messages
          .filter( m => m.visibility !== Visibility.EXCLUDE )
          .sort( ( a, b ) => b.createdAt.getTime() - a.createdAt.getTime() )
          .reduce( ( prev, curr ) => {
            if ( totalTokens + curr.size < limit ) {
              prev.push( curr );
              totalTokens += curr.size;
            }
            return prev;
          }, [] as Array<Chat[ "messages" ][ 0 ] & { size: number; }> )
      ].sort( ( a, b ) => a.createdAt.getTime() - b.createdAt.getTime() );

      const messageId = uuid();
      const visibility = options.visibility !== undefined ? options.visibility : Visibility.OPTIONAL;
      const message: Message = {
        id: messageId,
        role: "user",
        content: options.message,
        visibility: visibility,
        createdAt: new Date(),
        updatedAt: new Date(),
        included: messages.map( m => m.id! ),
        user: $chat.user
      };
      $chat.data.messages.push( message );
      $chat.out( { ...message, chat: this.data.id!, type: "message", state: "streaming" } ); // todo stream to final
      $chat.out( { ...message, chat: this.data.id!, type: "message", state: "final" } ); // todo stream to final
      const stream = $chat.llm.stream( {
        messages: [ ...messages.map( m => ( { prompt: m.content, role: m.role } ) ), { prompt: options.message, role: "user" } ],
        functions: functions,
        user: this.user,
        responseSize: responseSize,
        ...options
      } );
      let response = "";
      const funcs: Array<Function & { args: string; func: ( args: any ) => Promise<Options | O>; }> = [];
      const responseId = uuid();
      try {
        await ( async () => {
          for await ( const chunk of stream ) {
            if ( chunk.type === "text" ) {
              response += chunk.content;
              $chat.out( {
                id: responseId,
                type: "message",
                state: "streaming",
                role: "assistant",
                content: chunk.content,
                chat: this.data.id!,
                visibility: Visibility.OPTIONAL
              } );
            } else {
              const func = $chat.functions[ chunk.name! ];
              if ( func !== undefined ) funcs.push( { ...func, args: chunk.arguments } );
              const content = `call: ${ chunk.name }(${ chunk.arguments })`;
              const functionUuid = uuid();
              $chat.data.messages.push( {
                id: functionUuid,
                role: "assistant",
                content: content,
                visibility: Visibility.SYSTEM,
                createdAt: new Date(),
                updatedAt: new Date()
              } );
              $chat.out( {
                type: "message",
                state: "final",
                role: "assistant",
                content: content,
                chat: $chat.data.id!,
                id: functionUuid,
                visibility: Visibility.SYSTEM
              } );
            }
          }
        } )();
      } catch ( error ) {
        console.log( requiredTokens, messageTokens, functionTokens, responseSize, totalTokens );
        reject( error );
        return;
      }
      if ( response.trim() !== "" ) {
        const blocks = extractBlocks( response );
        $chat.data.messages.push( {
          id: responseId,
          role: "assistant",
          content: response,
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
        const params = args !== "" ? JSON.parse( args! ) : {};
        const prompt = await promise( { ...params, locals: $chat.locals, chat: $chat } );
        prompt.message = `${ name }(${ JSON.stringify( params ) }) => ${ prompt.message }`;
        const command = { command: name, promise: $chat._prompt( $chat, { ...$chat.options, ...prompt } as O ) };
        if ( $chat.pipelineCursor === $chat.pipeline.length ) {
          $chat.pipeline.push( command );
        } else {
          $chat.pipeline = [
            ...$chat.pipeline.slice( 0, this.pipelineCursor + position ),
            command,
            ...$chat.pipeline.slice( this.pipelineCursor + position )
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
    const sidebar = new DSL<O, L>( {
      llm: this.llm,
      storage: this.storage,
      options: this.options,
      metadata: {
        ...this.data.metadata,
        parent: this.data.id!
      }
    } );
    this.data.sidebars.push( sidebar.data.id! );
    sidebar.data.user = this.data.user;
    sidebar.functions = this.functions;
    sidebar.rules = this.rules;
    sidebar.locals = this.locals;
    sidebar.type = "sidebar";
    return sidebar;
  }

  /**
   * 
   * @param id: a user id to associate with the chat and new prompts
   */
  setUser( id: string ) {
    this.user = id;
    if ( this.data.user === undefined ) this.data.user = this.user;
    return this;
  }

  /**
   * set the context for the chat
   * 
   * @param value 
   * @returns 
   */
  setLocals( locals: L ) {
    this.locals = locals;
    return this;
  }

  /**
   * add a message to the end of the chat without generating a prompt. This action occurrs
   * immediately; outside of the chain of commands
   * 
   * @param message - a custom message to add to the chat
   * @returns 
   */
  push( message: Omit<Message, "id" | "createdAt" | "updatedAt" | "tokens"> ) {
    this.data.messages.push( {
      ...message,
      id: uuid(),
      createdAt: new Date(),
      updatedAt: new Date()
    } );
    return this;
  }

  /**
   * load a chat from storage
   * 
   * @param {string} id - a chat uuid 
   * @returns {object} - the chat object   
   */
  load( id: string ) {
    const promise = ( $this: DSL<O, L> ) => new Promise<void>( ( resolve, reject ) => {
      $this.storage.getById( id )
        .then( data => {
          $this.data = data;
          resolve();
        } )
        .catch( reject );
    } );
    this.pipeline.push( { command: "load", promise } );
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
  rule( options: ( Rule | CommandFunction<L, O, Rule> ) ) {
    const { name, requirement, key }: Rule = typeof options === "function" ? options( this.locals, this ) : options;
    const content = `This conversation has the following rule: Rule ${ name } - requirement - ${ requirement }`;
    const promise = ( $this: DSL<O, L> ) => {
      return new Promise<void>( ( resolve, reject ) => {
        const ruleId = uuid();
        const _key = key || `Rule - ${ name }`;
        const index = $this.data.messages.map( m => m.key ).indexOf( _key );
        if ( index === -1 || $this.data.messages[ index ].content !== content ) {
          $this.data.messages.push( {
            id: ruleId,
            role: "user",
            key: _key,
            content: content,
            visibility: Visibility.REQUIRED,
            createdAt: new Date(),
            updatedAt: new Date()
          } );
          $this.rules.push( ruleId );
        }
        resolve();
      } );
    };
    this.pipeline.push( { command: "rule", promise } );
    return this;
  }

  /**
   * create a function the LLM can call from the chat
   * 
   * @param options 
   * @returns {object} - the chat object
   */
  function<F>( options: Function & { func: ( args: F & { locals: L, chat: DSL<O, L>; } ) => Promise<Options | O>; } ) {
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
  prompt( options: ( Options | O | CommandFunction<L, O, Options | O> ) ) {
    const promise = ( $this: DSL<O, L> ) => {
      return new Promise<void>( ( resolve, reject ) => {
        const _options: ( Options | O ) = typeof options === "function" ? options( $this.locals, $this ) : options;
        $this._prompt( $this, { ...$this.options, ..._options } as O )()
          .then( () => resolve() )
          .catch( reject );
      } );
    };
    this.pipeline.push( { command: "prompt", promise } );
    return this;
  }
  /**
   * a hook to direclty access the LLM response of the latest prompt
   * 
   * @param func 
   * @returns {object} - the chat object   
   */
  response( func: ( args: { response: ChatMessage, locals: L, chat: DSL<O, L>; } ) => Promise<void> ) {
    const promise = ( $this: DSL<O, L> ) => {
      return new Promise<void>( ( resolve, reject ) => {
        func( { response: $this.data.messages[ $this.data.messages.length - 1 ], locals: $this.locals, chat: $this } )
          .then( resolve )
          .catch( reject );
      } );
    };
    this.pipeline.push( { command: "response", promise } );
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
  expect( func: ( args: { response: ChatMessage, locals: L, chat: DSL<O, L>; } ) => Promise<void> ) {
    const promise = ( $this: DSL<O, L> ) => {
      return new Promise<void>( async ( resolve, reject ) => {
        const expectationStack: string[] = [];
        let response = $this.data.messages[ $this.data.messages.length - 1 ];
        let sidebar: DSL<O, L> | null = null;
        for await ( const i of Array( $this.settings.maxCallStack ).fill( null ).map( ( _v, i ) => i ) ) {
          try {
            await func( { response: response, locals: $this.locals, chat: $this } );
            if ( sidebar !== null ) {
              // a sidebar chat was used, replace the lastest main response with the targetMessage ( the latest response that passed the expectations )
              // this is done by not remove the message but marking it as EXCLUDE
              $this.data.messages[ $this.data.messages.length - 1 ].visibility = Visibility.EXCLUDE;
              $this.data.messages.push( response );
              await sidebar.save();
            }
            resolve();
            break;
          } catch ( expectation ) {
            if ( typeof expectation !== "string" ) {
              reject( expectation );
              break;
            }

            expectationStack.push( expectation );
            if ( sidebar === null ) {
              sidebar = $this.sidebar();
              sidebar.rules = $this.rules;
              sidebar.data.messages = [
                // include the previous user and assitant message
                ...$this.data.messages.filter( m => m.visibility === Visibility.REQUIRED ),
                $this.data.messages[ $this.data.messages.length - 2 ],
                $this.data.messages[ $this.data.messages.length - 1 ],
              ];
            }

            const _promise = () => {
              return new Promise<void>( ( _resolve, _reject ) => {
                sidebar!
                  .prompt( { message: `the prior response did not meet expectations: ${ expectation }.` } )
                  .response( ( { response: message } ) => {
                    return new Promise<void>( ( __resolve ) => {
                      response = message;
                      _resolve();
                    } );
                  } )
                  .stream( $this.out )
                  .then( () => _resolve() )
                  .catch( _reject );
              } );
            };
            try {
              await _promise();
            } catch ( error ) {
              reject( error );
              break;
            }
          };
        }
        if ( expectationStack.length >= $this.settings.maxCallStack ) {
          reject( `Expect Call Stack exceeded - ${ $this.settings.maxCallStack }. Refine your prompt and/or adjust your expectations` );
        }
      } );
    };
    this.pipeline.push( { command: "expect", promise } );
    return this;
  }

  /**
   * create 1 or more prompts from the chat context
   * 
   * @param func 
   * @returns {object} - the chat object   
   */
  promptForEach( func: CommandFunction<L, O, ( Options | O )[]> ) {
    const promise = ( $this: DSL<O, L> ) => {
      return new Promise<void>( ( resolve, reject ) => {
        const promises = func( $this.locals, $this )
          .map( p => {
            return { command: "prompt", promise: $this._prompt( $this, { ...$this.options, ...p } as O ) };
          } );
        $this.pipeline = [
          ...$this.pipeline.slice( 0, $this.pipelineCursor + 1 ),
          ...promises,
          ...$this.pipeline.slice( $this.pipelineCursor + 1 )
        ];
        resolve();
      } );
    };
    this.pipeline.push( { command: "promptForEach", promise } );
    return this;
  }

  /**
   * create a branch of prompts from the chat context. Each branch will include all
   * prompts up to a .join() command.
   * 
   * @param func 
   * @returns {object} - the chat object   
   */
  branchForEach( func: CommandFunction<L, O, ( Options | O )[]> ) {
    const promise = ( $this: DSL<O, L> ) => {
      return new Promise<void>( ( resolve, reject ) => {
        const promises = func( $this.locals, $this ).map( p => {
          return { command: "", promise: $this._prompt( $this, { ...$this.options, ...p } as O ) };
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
    this.pipeline.push( { command: "promptForEach", promise } );
    return this;
  }

  /**
   * establishes a stopping point for the `branchForEach`
   * @returns {object} - the chat object   
   */
  join() {
    // see forEachBranch
    this.pipeline.push( { command: "join", promise: ( $this: DSL<O, L> ) => new Promise<void>( ( resolve ) => resolve() ) } );
    return this;
  }

  /**
   * provide custom input to the chat from any mechanism
   * 
   * @param func 
   * @returns {object} - this chat object
   */
  input( func: () => Promise<Options | O> ) {
    const promise = ( $this: DSL<O, L> ) => {
      return new Promise<void>( async ( resolve, reject ) => {
        const options = await func();
        await $this._prompt( $this, { ...$this.options, ...options } as O )();
        resolve();
      } );
    };
    this.pipeline.push( { command: "input", promise } );
    return this;
  }

  /**
   * 
   * @param f 
   */
  file( f: any ) {
    // todo
    throw "chat.file() is Not Implemented";
  }

  /**
   * 
   * @param f 
   */
  image( i: any ) {
    // todo
    throw "chat.image() is Not Implemented";
  }

  /**
   * a handler to receive the stream of text
   * 
   * @param output 
   * @returns 
   */
  async stream( output: ( data: ChatChunk | MessageChunk | CommandChunk ) => void ) {
    this.out = output;
    return this.execute();
  }

  /**
   * save the chat to storage
   * 
   * @returns {Promise}
   */
  save() {
    return this.storage.save( this.data );
  }

  /**
   * executes the pipeline
   * 
   * @returns {Promise}
   */
  async execute() {
    return new Promise<DSL<O, L>>( async ( resolve, reject ) => {
      // todo validate the commands e.g. a branchForEach as a join
      try {
        let hasNext = true;
        this.out( { type: this.type, id: this.data.id!, state: "open" } );
        while ( hasNext ) {
          this.pipelineCursor += 1;
          const stage = this.pipeline[ this.pipelineCursor ];
          if ( stage === undefined ) break;
          const { promise, command } = stage;
          this.out( { type: "command", content: `command: ${ command }\n` } );
          await promise( this );
        }
        await this.storage.save( this.data );
        resolve( this );
      } catch ( error ) {
        await this.storage.save( this.data );
        reject( error );
      }
      this.out( { type: this.type, id: this.data.id!, state: "closed" } );
    } );
  }
}