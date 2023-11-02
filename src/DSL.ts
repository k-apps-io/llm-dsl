import { cloneDeep } from "lodash";
import { v4 as uuid } from "uuid";
import { Chat, Message as ChatMessage, Visibility } from "./Chat";
import extractBlocks from "./CodeBlocks";
import ChatStorage from "./Storage";


export interface Prompt {
  prompt: string;
  role: "user" | "assistant";
}

export interface Function {
  name: string;
  parameters: { [ key: string ]: any; };
  description: string;
}

export interface Stream {
  messages: Prompt[];
  functions?: Function[];
}

export interface Options {
  key?: string;
  message: string;
}

export interface Context { }

export type TextResponse = {
  type: "text";
  content: string;
};

export type FunctionResponse = {
  type: "function";
  name: string;
  arguments: any;
};

export abstract class LLM {

  constructor() { }
  /**
   * cacluates the total number of tokens a string
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

export class DSL<T extends Options, C extends Context> {

  llm: LLM;
  storage: ChatStorage;
  options: Omit<T, "message">;
  chat: Chat;
  rules: string[] = [];
  functions: { [ key: string ]: ( Function & { func: ( args: any ) => Promise<Options | T>; } ); } = {};
  pipeline: Array<{
    command: string;
    promise: () => Promise<void>;
  }> = [];
  pipelineCursor: number = -1; // manages current position in the pipeline
  _context?: C;

  out: ( data: { content: string | Uint8Array; chatId: string; messageId: string; } ) => void = () => { };

  constructor( { llm, storage, name, options }: {
    llm: LLM;
    storage: ChatStorage;
    options: Omit<T, "message">;
    name?: string;
  } ) {
    this.llm = llm;
    this.storage = storage;
    this.options = options;
    this.chat = {
      id: uuid(),
      name: name || "Not Named",
      messages: [],
      sidebars: []
    };
  }

  public set context( v: C ) {
    this._context = v;
  }

  public get context(): C | undefined {
    return this._context;
  }

  private _prompt( options: T ) {
    return () => new Promise<void>( async ( resolve, reject ) => {
      const messageTokens = this.llm.tokens( options.message );
      const limit = 700; // todo

      // reduce the messages to the latest keys
      let messages: Chat[ "messages" ] = cloneDeep( this.chat.messages )
        .reduce( ( prev, curr ) => {
          if ( curr.key !== undefined ) {
            const prevIndex = prev.map( p => p.key ).indexOf( curr.key );
            if ( prevIndex > -1 ) prev.splice( prevIndex );
          }
          prev.push( curr );
          return prev;
        }, [] as Chat[ "messages" ] );

      const required = messages.filter( m => m.visibility === Visibility.REQUIRED );
      const requiredTokens = required.reduce( ( total, curr ) => total + curr.tokens, 0 );
      let currentTokens = requiredTokens + messageTokens;
      messages = [
        ...required
        , ...messages
          .filter( m => m.visibility === Visibility.OPTIONAL )
          .sort( ( a, b ) => b.createdAt.getTime() - a.createdAt.getTime() )
          .reduce( ( prev, curr ) => {
            const tokens = prev.reduce( ( total, curr ) => total + curr.tokens, 0 );
            if ( currentTokens + tokens <= limit ) prev.push( curr );
            return prev;
          }, [] as Chat[ "messages" ] )
      ].sort( ( a, b ) => a.createdAt.getTime() - b.createdAt.getTime() );
      const messageId = uuid();
      this.chat.messages.push( {
        id: messageId,
        role: "user",
        content: options.message,
        tokens: messageTokens,
        visibility: Visibility.OPTIONAL,
        createdAt: new Date(),
        updatedAt: new Date(),
        included: messages.map( m => m.id! )
      } );
      await this.storage.save( this.chat );
      this.out( { content: options.message + "\n", chatId: this.chat.id!, messageId } );
      const stream = await this.llm.stream( {
        messages: [ ...messages.map( m => ( { prompt: m.content, role: m.role } ) ), { prompt: options.message, role: "user" } ],
        functions: Object.keys( this.functions ).map( k => this.functions[ k ] ),
        ...options
      } );
      let message = "";
      let func: Function & { func: ( args: any ) => Promise<Options | T>; } | undefined = undefined;
      let args: string | undefined = undefined;
      await ( async () => {
        for await ( const chunk of stream ) {
          if ( chunk.type === "text" ) {
            this.out( { content: chunk.content, chatId: this.chat.id!, messageId } );
            message += chunk.content;
          } else {
            const content = `call: ${ chunk.name! }(${ chunk.arguments })`;
            this.out( { content: content, chatId: this.chat.id!, messageId } );
            message += content;
            func = this.functions[ chunk.name! ];
            args = chunk.arguments!;
          }
        }
      } )();
      this.out( { content: "\n", chatId: this.chat.id!, messageId } );
      const blocks = extractBlocks( message );
      this.chat.messages.push( {
        id: uuid(),
        role: "assistant",
        content: message,
        tokens: this.llm.tokens( message ),
        visibility: Visibility.OPTIONAL,
        codeBlocks: blocks.length > 0 ? blocks : undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      } );
      await this.storage.save( this.chat );
      if ( ( func as any ) !== undefined ) {
        // todo parse args as JSON object
        // todo validate / map the args to the 
        const { func: promise, parameters } = func!;
        const params = args !== "" ? JSON.parse( args! ) : {};
        const prompt = await promise( params );
        this.pipeline = [
          ...this.pipeline.slice( 0, this.pipelineCursor ),
          { command: "", promise: this._prompt( { ...this.options, ...prompt as T } ) },
          ...this.pipeline.slice( this.pipelineCursor + 1 )
        ];
      }
      resolve();
    } );
  }

  private async sidebar( { name }: { name?: string; } ) {
    // create a new chat and have a sidebar conversation
    const sidebar = new DSL<T, C>( { llm: this.llm, storage: this.storage, options: this.options, name: `Sidebar - ${ name || this.chat.name }` } );
    this.chat.sidebars.push( sidebar.chat.id! );
    await sidebar.storage.save( sidebar.chat );
    sidebar.functions = this.functions;
    await this.storage.save( this.chat );
    return sidebar;
  }

  /**
   * load a chat from storage
   * 
   * @param {string} id - a chat uuid 
   * @returns {object} - the chat object   
   */
  load( id: string ) {
    const promise = () => new Promise<void>( ( resolve, reject ) => {
      this.storage.getById( id )
        .then( chat => {
          this.chat = chat;
          resolve();
        } )
        .catch( reject );
    } );
    this.pipeline.push( { command: "load", promise } );
    return this;
  }

  /**
   * create a clone or copy of the chat object
   * 
   * @returns a clone of the chat object
   */
  clone() {
    return cloneDeep( this );
  }

  /**
   * create a rule for the chat
   * 
   * @param options 
   * @returns {object} - the chat object
   */
  rule( options: { name: string, requirement: string, key?: string; } ) {
    const { name, requirement, key } = options;
    const content = `This conversation has the following rule: Rule ${ name } - requirement - ${ requirement }`;
    const ruleId = uuid();
    this.chat.messages.push( {
      id: ruleId,
      role: "user",
      key: key || `Rule - ${ name }`,
      content: content,
      tokens: this.llm.tokens( content ),
      visibility: Visibility.REQUIRED,
      createdAt: new Date(),
      updatedAt: new Date()
    } );
    this.rules.push( ruleId );
    return this;
  }

  /**
   * create a function the LLM can call from the chat
   * 
   * @param options 
   * @returns {object} - the chat object
   */
  function<F>( options: Function & { func: ( args: F ) => Promise<Options | T>; } ) {
    const { name } = options;
    this.functions[ name ] = options;
    return this;
  }

  /**
   * send a new prompt to the LLM including the chat history
   * 
   * @param options 
   * @returns {object} - the chat object   
   */
  prompt( options: Options | T ) {
    const promise = this._prompt( { ...this.options, ...options } as T );
    this.pipeline.push( { command: "prompt", promise } );
    return this;
  }

  /**
   * a hook to direclty access the LLM response of the latest prompt
   * 
   * @param func 
   * @returns {object} - the chat object   
   */
  response( func: ( message: ChatMessage ) => Promise<void> ) {
    const promise = () => {
      return new Promise<void>( ( resolve, reject ) => {
        func( this.chat.messages[ this.chat.messages.length - 1 ] )
          .then( resolve )
          .catch( reject );
      } );
    };
    this.pipeline.push( { command: "response", promise } );
    return this;
  }

  /**
   * a hook to direclty access the LLM response of the latest prompt and establish expectations of the response. 
   * When reject is called, provide a message with your criteria and a sidebar chat will be created to resolve the
   * dispute of the response and your expectations. 
   * 
   * This sidebar will continue to pass the LLM responses through the expect call until the response passes or the retries are exceeded
   * 
   * @param func 
   * @returns {object} - the chat object   
   */
  expect( func: ( response: ChatMessage ) => Promise<void> ) {
    const promise = () => {
      return new Promise<void>( ( resolve, reject ) => {
        func( this.chat.messages[ this.chat.messages.length - 1 ] )
          .then( resolve )
          .catch( async expectation => {
            if ( typeof expectation !== "string" ) {
              reject( expectation );
              return;
            }
            const $this = this;
            const sidebar = await $this.sidebar( { name: `Expectation - ${ expectation }` } );
            sidebar.rules = $this.rules;
            sidebar.chat.messages = [
              // include the rules
              ...this.chat.messages.filter( m => $this.rules.includes( m.id! ) ),
              // include the previous user and assitant message
              this.chat.messages[ this.chat.messages.length - 2 ],
              this.chat.messages[ this.chat.messages.length - 1 ],
            ];
            sidebar
              .prompt( { message: `the prior response did not meet expectations; specifically - '${ expectation }'. Please update the prior response focusing on my expecations` } )
              .response( ( message ) => {
                return new Promise<void>( ( _resolve, __ ) => {
                  func( message )
                    .then( async () => {
                      $this.chat.messages[ this.chat.messages.length - 1 ].visibility = Visibility.HIDDEN;
                      $this.chat.messages.push( message );
                      await $this.storage.save( $this.chat );
                      _resolve();
                      resolve();
                    } )
                    .catch( error => {
                      reject( `Failed Expectations - ${ expectation }` );
                    } );
                } );
              } )
              .stream( $this.out )
              .catch( reject );
          } );
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
  promptForEach( func: ( context: C ) => ( Options | T )[] ) {
    const promise = () => {
      return new Promise<void>( ( resolve, reject ) => {
        const promises = func( this.context! ).map( p => {
          return { command: "", promise: this._prompt( { ...this.options, ...p } as T ) };
        } );
        this.pipeline = [
          ...this.pipeline.slice( 0, this.pipelineCursor + 1 ),
          ...promises,
          ...this.pipeline.slice( this.pipelineCursor + 1 )
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
  branchForEach( func: ( context: C ) => ( Options | T )[] ) {
    const promise = () => {
      return new Promise<void>( ( resolve, reject ) => {
        const promises = func( this.context! ).map( p => {
          return { command: "", promise: this._prompt( { ...this.options, ...p } as T ) };
        } );
        const joinIndex = this.pipeline.slice( this.pipelineCursor ).map( p => p.command ).indexOf( "join" );
        if ( joinIndex === -1 ) {
          reject( "branchForEach requires a join()" );
          return;
        }
        this.pipeline = [
          ...this.pipeline.slice( 0, this.pipelineCursor + 1 ),
          ...promises.flatMap( p => [ p, ...this.pipeline.slice( this.pipelineCursor + 1, joinIndex + this.pipelineCursor ) ] ),
          ...this.pipeline.slice( joinIndex + this.pipelineCursor + 1 )
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
    this.pipeline.push( { command: "join", promise: () => new Promise<void>( ( resolve ) => resolve() ) } );
    return this;
  }

  /**
   * provide custom input to the chat from any mechanism
   * 
   * @param func 
   * @returns {object} - this chat object
   */
  input( func: () => Promise<Options | T> ) {
    const promise = () => {
      const $this = this;
      return new Promise<void>( async ( resolve, reject ) => {
        const options = await func();
        await $this._prompt( { ...this.options, ...options } as T )();
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
    // todo load a file
    throw "chat.file() is Not Implemented";
  }

  /**
   * 
   * @param f 
   */
  image( f: any ) {
    // todo load an image
    throw "chat.image() is Not Implemented";
  }

  /**
   * a handler to receive the stream of text
   * 
   * @param output 
   * @returns 
   */
  async stream( output: ( data: { content: string | Uint8Array; chatId: string; messageId: string; } ) => void ) {
    this.out = output;
    return this.execute();
  }

  /**
   * executes the chat
   * 
   * @returns {Promise}
   */
  async execute() {
    return new Promise<void>( async ( resolve, reject ) => {
      try {
        let hasNext = true;
        this.pipelineCursor = 0;
        while ( hasNext ) {
          const stage = this.pipeline[ this.pipelineCursor ];
          if ( stage === undefined ) break;
          const { command, promise } = stage;
          await promise();
          this.pipelineCursor += 1;
        }
        resolve();
      } catch ( error ) {
        reject( error );
      }
    } );
  }
}