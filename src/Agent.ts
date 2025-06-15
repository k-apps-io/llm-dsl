import { readFileSync } from "fs";
import { cloneDeep } from "lodash";
import { NoStorage } from "./Storage";
import { main } from "./Window";
import { LLM } from "./definitions";
import { LoopError, detectLoop, extractCodeBlocks, parseJSON } from "./utilities";

const packageJson = JSON.parse( readFileSync( require.resolve( "../package.json" ), "utf8" ) ); // Read package.json
const version = packageJson.version;

export interface Initializer<Options extends LLM.Model.Options, Prompts extends LLM.Model.Prompts, Responses extends LLM.Model.Responses, ToolResults extends LLM.Model.ToolResults, Locals extends LLM.Locals, Metadata extends LLM.Metadata> {
  llm: LLM.Model.Service<Options, Prompts, Responses, ToolResults>;
  options?: Options;
  locals?: Locals;
  metadata?: Metadata;
  storage?: LLM.Storage.Service;
  settings?: {
    windowSize?: number;
    minResponseSize?: number;
    maxCallStack?: number;
  };
  window?: LLM.Window;
}

export class Agent<Options extends LLM.Model.Options
  , Prompts extends LLM.Model.Prompts = LLM.Model.Prompts
  , Responses extends LLM.Model.Responses = LLM.Model.Responses
  , ToolResults extends LLM.Model.ToolResults = LLM.Model.ToolResults
  , Locals extends LLM.Locals = LLM.Locals
  , Metadata extends LLM.Metadata = LLM.Metadata
> {

  llm: LLM.Model.Service<Options, Prompts, Responses, ToolResults>;
  options: Options;
  window: LLM.Window;
  storage: LLM.Storage.Service;
  data: LLM.Chat<Options, Prompts, Responses, ToolResults, Metadata>;
  locals: Locals;
  rules: string[] = [];
  type: "chat" | "sidebar" = "chat";
  user?: string = undefined;
  settings: LLM.Settings;

  functions: {
    [ key: string ]: LLM.Tool.Tool<Options, Prompts, Responses, ToolResults, Locals, Metadata, any> & { calls: number; };
  } = {};
  pipeline: Array<{
    id: string;
    stage: string;
    promise: ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => Promise<void>;
  }> = [];

  exitCode?: 1 | Error = undefined;
  /**
   * manages the current position of the pipeline
   */
  private pipelineCursor: number = -1;
  private nextPosition: number = 0;

  /**
   * these are the stream handlers that will receive any this.out calls
   */
  private streamHandlers: LLM.Stream.Handler<Options, Prompts, Responses, ToolResults, Metadata>[] = [];

  constructor( { llm, options, locals, metadata, settings, window, storage }: Initializer<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) {
    this.llm = llm;
    this.options = options ?? ( {} as Options );
    this.locals = locals ?? ( {} as Locals );
    this.settings = { ...LLM.DEFAULT_SETTINGS, ...settings };
    this.window = window || main;
    this.storage = storage || new NoStorage();
    this.data = {
      id: this.storage.newId(),
      messages: [],
      sidebars: [],
      metadata: { ...metadata, $: { version } } as Metadata, // Use the dynamically fetched version
      inputs: 0,
      outputs: 0
    };
  }

  /**
   * create a sidebar associated with this chat, the metadata of the sidebar
   * will inherit the main chat's metadata in addition to `parent` which will
   * be the id of the main chat.
   * 
   * @returns Agent
   */
  sidebar( { rules: _rules, functions: _functions, locals: _locals }: LLM.Stage.Sidebar = {} ) {
    // create a new chat and have a sidebar conversation
    const metadata = {
      ...this.data.metadata,
      $: {
        ...this.data.metadata.$,
        parent: this.data.id!,
      },
    } as Metadata;
    const sidebar = new Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata>( {
      llm: this.llm,
      options: this.options,
      storage: this.storage,
      settings: this.settings,
      metadata,
      window: this.window,
    } );
    this.data.sidebars.push( sidebar.data.id! );
    if ( this.user ) sidebar.setUser( this.user );
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
    const promise = ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => new Promise<void>( ( resolve, reject ) => {
      $this.user = id;
      if ( $this.data.user === undefined ) $this.data.user = $this.user;
      resolve();
    } );
    this._addStage( { id: this.storage.newId(), stage: "user", promise } );
    return this;
  }

  /**
   * set locals for the chat
   * 
   * @param value: L
   * @returns Agent
   */
  setLocals( args: LLM.Stage.SetLocals<Options, Prompts, Responses, ToolResults, Locals, Metadata>, id: string = this.storage.newId() ) {
    const promise = ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => new Promise<void>( async ( resolve, reject ) => {
      let locals: Locals;
      if ( typeof args === "function" ) {
        const result = args( { chat: $this, locals: $this.locals } );
        if ( result instanceof Promise ) {
          locals = await result;
        } else {
          locals = result;
        }
      } else {
        locals = args;
      }
      $this.locals = { ...$this.locals, ...locals };
      resolve();
    } );
    this._addStage( { id: id, stage: "locals", promise } );
    return this;
  }

  /**
   * set metadata for the chat
   */
  setMetadata( args: LLM.Stage.SetMetadata<Options, Prompts, Responses, ToolResults, Locals, Metadata>, id: string = this.storage.newId() ) {
    const promise = ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => new Promise<void>( async ( resolve, reject ) => {
      let metadata: Metadata;
      if ( typeof args === "function" ) {
        const result = args( { chat: $this, locals: $this.locals } );
        if ( result instanceof Promise ) {
          metadata = await result;
        } else {
          metadata = result;

        }
      } else {
        metadata = args;
      }
      $this.data.metadata = { ...$this.data.metadata, ...metadata };
      $this.out( {
        type: "metadata",
        chat: $this.data.id!,
        metadata: $this.data.metadata,
        id: $this.storage.newId()
      } );
    } );
    this._addStage( { id: id, stage: "metadata", promise } );
    return this;
  }


  /**
   * add a message after the current pipeline position without generating a prompt.
   */
  push( args: LLM.Stage.Push<Options, Prompts, Responses, ToolResults, Locals, Metadata>, id: string = this.storage.newId() ) {
    const promise = ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => new Promise<void>( async ( resolve, reject ) => {
      let result: LLM.Stage.ContextArgs;
      if ( typeof args === "function" ) {
        const _args = args( { locals: $this.locals, chat: $this } );
        if ( _args instanceof Promise ) {
          result = await _args;
        } else {
          result = _args;
        }
      } else {
        result = args;
      }
      const message: LLM.Message.Context = {
        id: this.storage.newId(),
        type: "context",
        visibility: LLM.Visibility.OPTIONAL,
        ...result,
        createdAt: new Date(),
        user: $this.user,
        tokens: {
          message: 0
        }
      };
      message.tokens.message = $this.llm.tokens( message );
      $this.data.messages.push( message );
      $this.out( { id: message.id, type: "message", message, chat: $this.data.id! } );
      resolve();
    } );

    const stage = { id, stage: "push", promise };
    this._addStage( stage );
    return this;
  }

  /**
   * add a message to the end of the chat without generating a prompt.
   */
  append( args: LLM.Stage.Append<Options, Prompts, Responses, ToolResults, Locals, Metadata>, id: string = this.storage.newId() ) {
    const promise = ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => new Promise<void>( async ( resolve, reject ) => {
      let result: LLM.Stage.ContextArgs;
      if ( typeof args === "function" ) {
        const _args = args( { locals: $this.locals, chat: $this } );
        if ( _args instanceof Promise ) {
          result = await _args;
        } else {
          result = _args;
        }
      } else {
        result = args;
      }
      const message: LLM.Message.Context = {
        id: this.storage.newId(),
        type: "context",
        visibility: LLM.Visibility.OPTIONAL,
        ...result,
        createdAt: new Date(),
        user: $this.user,
        tokens: {
          message: 0
        }
      };
      message.tokens.message = $this.llm.tokens( message );
      $this.data.messages.push( message );
      $this.out( { id: message.id, type: "message", chat: $this.data.id!, message } );
      resolve();
    } );
    this._addStage( { id: id, stage: "append", promise } );
    return this;
  }

  /**
   * send a new prompt to the LLM including the chat history
   * 
   * @param options 
   * @returns {object} - the chat object   
   */
  prompt( args: LLM.Stage.Prompt<Options, Prompts, Responses, ToolResults, Locals, Metadata>, id: string = this.storage.newId() ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    const promise = ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => {
      return new Promise<void>( async ( resolve, reject ) => {
        let result: LLM.Stage.PromptArgs<Options, Prompts>;
        if ( typeof args === "function" ) {
          const _args = args( { locals: $this.locals, chat: $this } );
          if ( _args instanceof Promise ) {
            result = await _args;
          } else {
            result = _args;
          }
        } else {
          result = args;
        }
        const { options, prompt, key } = result;
        const message: LLM.Message.Prompt<Options, Prompts> = {
          id: $this.storage.newId(),
          key: key,
          type: "prompt",
          visibility: LLM.Visibility.OPTIONAL,
          createdAt: new Date(),
          user: $this.user,
          options,
          prompt,
          tokens: {
            message: 0
          }
        };
        message.tokens.message = $this.llm.tokens( message );
        $this.data.messages.push( message );
        $this.out( { id: message.id, type: "message", message, chat: $this.data.id! } );
        $this._send( { chat: $this, functions: true, caller: message.id, options } )
          .then( resolve )
          .catch( reject );
      } );
    };
    this._addStage( { id: id, stage: "prompt", promise } );
    return this;
  }

  /**
   * create 1 or more prompts from the chat context
   * 
   * @param func 
   * @returns {object} - the chat object   
   */
  promptForEach( func: LLM.Stage.PromptForEach<Options, Prompts, Responses, ToolResults, Locals, Metadata>, id: string = this.storage.newId() ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    console.warn( "Deprecation Warning: 'promptForEach' is deprecated and may be removed in future versions. Use `forEach` instead." );
    const promise = ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => {
      return new Promise<void>( async ( resolve, reject ) => {
        let prompts: LLM.Stage.PromptArgs<Options, Prompts>[] = [];
        const result = func( { locals: $this.locals, chat: $this } );
        if ( result instanceof Promise ) {
          prompts = await result;
        } else {
          prompts = result;
        }
        prompts.forEach( p => $this.prompt( p ) );
        resolve();
      } );
    };
    this._addStage( { id: id, stage: "promptForEach", promise } );
    return this;
  }

  /**
   * load a chat from storage
   * 
   * @param {string} id - a chat id 
   * @returns {object} - the chat object   
   */
  load( id: string, stageId: string = this.storage.newId() ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    const promise = ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => new Promise<void>( async ( resolve, reject ) => {
      const result = $this.storage.getById( id );
      if ( result instanceof Promise ) {
        result
          .then( data => {
            // merge the messages from the previous executed stages
            // with the history from the loaded chat
            // this is required for chat's that have been created
            // outside of the executing pipeline. Any messages created by prior
            // executing stages will be added if the id or key is unique between
            // the current pipeline messages and the incoming messages.
            const messages: LLM.Message.Message<Options, Prompts, Responses, ToolResults>[] = [
              ...$this.data.messages.filter( m => m.visibility === LLM.Visibility.REQUIRED || m.key !== undefined ),
              ...data.messages,
            ].reduce<LLM.Message.Message<Options, Prompts, Responses, ToolResults>[]>( ( prev, curr ) => {
              const index = prev.findIndex( ( m ) => m.id === curr.id || ( m.key && curr.key && m.key === curr.key ) );
              if ( index === -1 ) {
                prev.push( curr as LLM.Message.Message<Options, Prompts, Responses, ToolResults> );
              } else {
                prev[ index ] = curr as LLM.Message.Message<Options, Prompts, Responses, ToolResults>;
              }
              return prev;
            }, [] );
            $this.data = data as LLM.Chat<Options, Prompts, Responses, ToolResults, Metadata>;
            $this.data.messages = messages;
            resolve();
          } )
          .catch( reject );
      } else {
        $this.data = result;
        resolve();
      }
    } );
    this._addStage( { id: stageId, stage: "load", promise } );
    return this;
  }

  /**
   * save the chat to storage
   * 
   * @returns {Promise}
   */
  save(): Promise<void> {
    return this.storage.save( this.data );
  }

  /**
   * create a clone of the chat pipeline with unique ids and as new object in memory
   * 
   * @returns a clone of the chat object
   */
  clone( { startAt }: { startAt: "beginning" | "end" | number; } = { startAt: "beginning" } ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    const $this = cloneDeep( this );
    $this.data.id = this.storage.newId();
    $this.data.messages = $this.data.messages.map( m => {
      const index = $this.rules.indexOf( m.id! );
      m.id = this.storage.newId();
      if ( index !== -1 ) {
        $this.rules[ index ] = m.id;
      }
      return m;
    } );
    if ( startAt === "beginning" ) {
      $this.pipelineCursor = -1;
    } else if ( startAt === "end" ) {
      $this.pipelineCursor = $this.pipeline.length - 1;
    } else {
      $this.pipelineCursor = startAt;
    }
    return $this;
  }

  /**
   * create a rule for the chat
   * 
   * @param options 
   * @returns {object} - the chat object
   */
  rule( options: LLM.Stage.Rule<Options, Prompts, Responses, ToolResults, Locals, Metadata>, id: string = this.storage.newId() ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    const promise = async ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => {
      let rule: LLM.Stage.RuleArgs;
      if ( typeof options === "function" ) {
        const result = options( { locals: $this.locals, chat: $this } );
        if ( result instanceof Promise ) {
          rule = await result;
        } else {
          rule = result;
        }
      } else {
        rule = options;
      }
      const { name, requirement, key } = rule;
      return new Promise<void>( ( resolve, reject ) => {
        const ruleId = id || this.storage.newId();
        const _key = key || name;
        // upsert the rule if the content has changed
        const message: LLM.Message.Rule = {
          id: ruleId,
          key: _key,
          type: "rule",
          rule: requirement,
          visibility: LLM.Visibility.REQUIRED,
          createdAt: new Date(),
          tokens: {
            message: 0
          }
        };
        message.tokens.message = $this.llm.tokens( message );
        $this.data.messages.push( message );
        $this.rules.push( ruleId );
        resolve();
      } );
    };
    this._addStage( { id: this.storage.newId(), stage: "rule", promise } );
    return this;
  }

  /**
   * 
   * @param options 
   * @returns {object} - the chat object
   */
  instruction( options: LLM.Stage.Instruction ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    const promise = ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => {
      return new Promise<void>( ( resolve, reject ) => {
        let instruction: string | undefined = undefined;
        if ( typeof options === "string" ) {
          // the instructions are a string
          instruction = options;
        } else if ( typeof options === "object" && options.filepath ) {
          instruction = readFileSync( options.filepath, "utf8" );
        } else {
          reject( new Error( "instruction must be a string or an object with a filepath property" ) );
          return;
        }
        const message: LLM.Message.Instruction = {
          id: $this.storage.newId(),
          type: "instruction",
          key: "instruction",
          instruction: instruction,
          visibility: LLM.Visibility.REQUIRED,
          createdAt: new Date(),
          tokens: {
            message: 0
          }
        };
        message.tokens.message = $this.llm.tokens( message );
        $this.data.messages.push( message );
        resolve();
      } );
    };
    this._addStage( { id: this.storage.newId(), stage: "instruction", promise } );
    return this;
  }

  /**
   * add a function the LLM can call from the chat
   * 
   * @param options 
   * @returns {object} - the chat object
   */
  function<F>( options: LLM.Tool.Tool<Options, Prompts, Responses, ToolResults, Locals, Metadata, F> ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    console.warn( "Deprecation Warning: 'function' is deprecated and may be removed in future versions. Use `tool` instead." );
    return this.tool( options );
  }

  tool<F>( options: LLM.Tool.Tool<Options, Prompts, Responses, ToolResults, Locals, Metadata, F> ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    const { name } = options;
    this.functions[ name ] = { ...options, calls: 0 };
    return this;
  }

  /**
   * manually call a function within the Agent
   */
  call<F>( { name, args, generateResponse }: LLM.Stage.Call<F>, id: string = this.storage.newId() ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    const promise = ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => {
      return new Promise<void>( async ( resolve, reject ) => {
        if ( !$this.functions[ name ] ) {
          return reject( `function not found: ${ name }` );
        }

        // execute the function
        const { func } = $this.functions[ name ];
        let result: any;
        const _result = func( { ...args, locals: $this.locals, chat: $this } );
        if ( _result instanceof Promise ) {
          result = await _result;
        } else {
          result = _result;
        }
        const message: LLM.Message.ToolResult<ToolResults> = {
          id: $this.storage.newId(),
          type: "tool",
          result,
          createdAt: new Date(),
          visibility: LLM.Visibility.SYSTEM,
          tokens: {
            message: 0
          }
        };
        message.tokens.message = $this.llm.tokens( message );
        $this.data.messages.push( message );
        if ( generateResponse ) {
          // todo - _send should accept the prompt options but not require a content
          await $this._send( { chat: $this, functions: true, caller: message.id } );
        }
        resolve();
      } );
    };
    this._addStage( { id: id, stage: `call function - ${ name }`, promise } );
    return this;
  }

  /**
   * directly access the LLM response the latest prompt.
   */
  response( func: LLM.Stage.Response<Options, Prompts, Responses, ToolResults, Locals, Metadata>, id: string = this.storage.newId() ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    const promise = async ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => {
      const response = $this.data.messages[ $this.data.messages.length - 1 ];
      const result = func( { response, locals: $this.locals, chat: $this } );
      if ( result instanceof Promise ) {
        await result;
      }
      return Promise.resolve();
    };
    this._addStage( { id: id, stage: "response", promise } );
    return this;
  }


  // 1 argument
  expect<A extends Record<string, any>>(
    a: LLM.Stage.Expect<Options, Prompts, Responses, ToolResults, Locals, Metadata, A>
  ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata>;

  // 2 arguments
  expect<A extends Record<string, any>, B extends Record<string, any>>(
    a: LLM.Stage.Expect<Options, Prompts, Responses, ToolResults, Locals, Metadata, A>,
    b: LLM.Stage.Expect<Options, Prompts, Responses, ToolResults, Locals, Metadata, B, A>
  ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata>;

  // 3 arguments
  expect<A extends Record<string, any>, B extends Record<string, any>, C extends Record<string, any>,>(
    a: LLM.Stage.Expect<Options, Prompts, Responses, ToolResults, Locals, Metadata, A>,
    b: LLM.Stage.Expect<Options, Prompts, Responses, ToolResults, Locals, Metadata, B, A>,
    c: LLM.Stage.Expect<Options, Prompts, Responses, ToolResults, Locals, Metadata, C, B>,
  ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata>;

  /**
   * Establish expectations for the response from the LLM.
   * When the 'reject' method is called, you can provide a message outlining your criteria. This rejection then becomes
   * a new prompt to the LLM which again the response is evaluted against the expecations. 
   * 
   * this doesn't support stage id assignment b/c of the rest arguments
   * 
   */
  expect(
    ...handlers: LLM.Stage.Expect<Options, Prompts, Responses, ToolResults, Locals, Metadata>[]
  ) {
    const stageId = this.storage.newId();
    const promise = ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => {
      return new Promise<void>( async ( resolve, reject ) => {
        let isDone: boolean = false;
        let attempts = $this.settings.maxCallStack;
        while ( !isDone && attempts > 0 ) {
          attempts--;
          const response = $this.data.messages.findLast( m => m.type === "response" ) as LLM.Message.TextResponse | undefined;
          if ( !response ) {
            process.emitWarning( "No response found in the chat history. Expectation cannot be set." );
            return resolve();
          }
          // evaluate the handlers 
          let expect: Record<string, any> | LLM.Stage.ExpectErrorResult | void = {};
          let errorResult: undefined | LLM.Stage.ExpectErrorResult;
          for ( const handler of handlers ) {
            const result = handler( { response, locals: $this.locals, chat: $this, ...expect } );
            let expectation: Record<string, any> | LLM.Stage.ExpectErrorResult | void;
            if ( result instanceof Promise ) {
              expectation = await result;
            } else {
              expectation = result;
            }
            if ( !expectation ) {
              continue; // no expectation set, continue to the next handler
            } else if ( expectation.type !== "error" ) {
              // expectation is a valid result
              expect = expectation;
              continue;
            }
            // expectation is a error result
            errorResult = expectation as LLM.Stage.ExpectErrorResult;
            break;
          }
          if ( !errorResult ) {
            // no error found, we are done
            isDone = true;
            continue;
          }
          const { error } = errorResult;
          const message: LLM.Message.Error = {
            id: $this.storage.newId(),
            type: "error",
            error: error || "Expectation failed",
            visibility: LLM.Visibility.SYSTEM,
            createdAt: new Date(),
            tokens: {
              message: 0
            }
          };
          message.tokens.message = $this.llm.tokens( message );
          $this.data.messages.push( message );
          $this.out( { id: message.id, message, type: "message", chat: $this.data.id! } );
          await $this._send( { chat: $this, functions: true, caller: message.id } );
        }
        if ( attempts === 0 ) {
          // we reached the maximum call stack, throw a loop error
          return reject( new Error( `Maximum call stack exceeded while evaluating expectations. Please check your expectations for loops or excessive complexity.` ) );
        }
        resolve();
      } );
    };
    this._addStage( { id: stageId, stage: "expect", promise } );
    return this;
  }

  /**
   * handlers to receive the chat stream and execute the pipeline
   */
  stream( handler: LLM.Stream.Handler<Options, Prompts, Responses, ToolResults, Metadata>, ...others: LLM.Stream.Handler<Options, Prompts, Responses, ToolResults, Metadata>[] ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    console.warn( "Deprecation Warning: 'stream' is deprecated and may be removed in future versions. Use `pipe` instead." );
    return this.pipe( handler, ...others );
  }

  pipe( handler: LLM.Stream.Handler<Options, Prompts, Responses, ToolResults, Metadata>, ...others: LLM.Stream.Handler<Options, Prompts, Responses, ToolResults, Metadata>[] ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    this.streamHandlers = [ ...this.streamHandlers, handler, ...others ];
    return this;
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
  pause( func: LLM.Stage.Pause<Options, Prompts, Responses, ToolResults, Locals, Metadata>, id: string = this.storage.newId() ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    const promise = ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => {
      return new Promise<void>( async ( resolve, reject ) => {
        const result = func( { locals: $this.locals, chat: $this } );
        if ( result instanceof Promise ) {
          await result;
        }
        resolve();
      } );
    };
    this._addStage( { id: id, stage: "pause", promise } );
    return this;
  }

  /**
   * sets the position of the pipeline to the stage with the provided id. If a id matches a stage, that stage will be executed
   * next and continue from that position. If a stage is not found a error is thrown.
   */
  moveTo( args: LLM.Stage.MoveTo<Options, Prompts, Responses, ToolResults, Locals, Metadata> ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    const promise = ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => {
      return new Promise<void>( async ( resolve, reject ) => {
        let targetId: string;
        if ( typeof args === "function" ) {
          const _args = args( { locals: $this.locals, chat: $this } );
          if ( _args instanceof Promise ) {
            const result = await _args;
            targetId = result.id;
          } else {
            targetId = _args.id;
          }
        } else {
          targetId = args.id;
        }
        const index = $this.pipeline.findIndex( ( { id: _id } ) => _id === targetId );
        if ( index === -1 ) {
          return reject( new Error( `No Pipeline Stage with id ${ targetId }` ) );
        }
        // apply the prior index b/c the execute process auto increments the
        // pipelineCursor by 1 before each stage
        $this.pipelineCursor = index - 2;
        resolve();
      } );
    };
    const stage = { id: this.storage.newId(), stage: "moveTo", promise };
    this._addStage( stage );
    return this;
  }

  forEach<T>( iterable: T[], func: LLM.Stage.ForEach<Options, Prompts, Responses, ToolResults, Locals, Metadata>, id: string = this.storage.newId() ): Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
    const promise = ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => new Promise<void>( ( resolve, reject ) => {
      try {
        // const originalPosition = $this.pipelineCursor;
        // let currentPosition = originalPosition;
        for ( var index = 0; index < iterable.length; index++ ) {
          const item: T = iterable[ index ];
          func( { locals: $this.locals, chat: $this, item, index } );
        }
        resolve();
      } catch ( e ) {
        return reject( e );
      }
    } );

    this._addStage( { id, stage: "forEach", promise } );
    return this;
  }

  /***
   * evaluates the Chunk across all stream handlers
   */
  private out( chunk: LLM.Stream.Chunk<Options, Prompts, Responses, ToolResults, Metadata> ) {
    this.streamHandlers.forEach( handler => handler( chunk ) );
  }

  private _addStage( stage: {
    id: string;
    stage: string;
    promise: ( $this: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => Promise<void>;
  } ) {
    if ( this.pipelineCursor === -1 ) {
      this.pipeline.push( stage );
    } else {
      this.pipeline = [
        ...this.pipeline.slice( 0, this.nextPosition + 1 ), // 0 to the current stage inclusive
        stage,
        ...this.pipeline.slice( this.nextPosition + 1 ) // the next stage to the end
      ];
    }
    // we need to increment the next position anytime a stage is added
    // as a new stage is always added after the current position to maintain the order
    this.nextPosition += 1;
  }

  private _send( { chat, functions, windowSize, responseSize, caller, options }: LLM.Stage.Send<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) {
    return new Promise<void>( async ( resolve, reject ) => {
      windowSize = windowSize || chat.settings.windowSize;
      responseSize = responseSize || chat.settings.minResponseSize;
      const tools = functions ? Object.keys( chat.functions ).map( k => chat.functions[ k ] ) : [];
      const functionTokens = chat.llm.functionTokens( tools );
      const limit = windowSize - responseSize - ( functionTokens.total || 0 );
      const messages: LLM.Message.Message<Options, Prompts, Responses, ToolResults>[] = chat.window( { chat: chat as any, messages: chat.data.messages, tokenLimit: limit } );
      const stream = chat.llm.stream( {
        messages,
        functions: tools,
        user: chat.user,
        options
      } );

      let buffer = true;
      let responseText = "";
      let tokens: LLM.Stream.UsageResponse[ "tokens" ] = {
        input: 0,
        output: 0,
      };
      const funcs: Array<LLM.Tool.Tool<Options, Prompts, Responses, ToolResults, Locals, Metadata, any> & { args?: string; tool_call_id?: string; }> = [];
      const responseId = this.storage.newId();
      try {
        await ( async () => {
          for await ( const chunk of stream ) {
            if ( chunk.type === "usage" ) {
              tokens = chunk.tokens;
            } else if ( chunk.type === "tool" ) {
              const func = chat.functions[ chunk.function.name! ];
              if ( func !== undefined ) funcs.push( { ...func, args: chunk.function.arguments, tool_call_id: chunk.call_id } );
              const functionMessage: LLM.Message.FunctionResponse = {
                id: this.storage.newId(),
                type: "function",
                function: {
                  name: chunk.function.name!,
                  arguments: chunk.function.arguments,
                },
                call_id: chunk.call_id,
                visibility: LLM.Visibility.SYSTEM,
                createdAt: new Date(),
                prompt: caller,
                tokens: {
                  message: tokens.output,
                  input: tokens.input,
                },
                window: messages.map( ( { id } ) => id ),
                tools: tools.length ? tools.map( f => f.name ) : undefined,
              };
              chat.data.messages.push( functionMessage );
              chat.out( {
                id: functionMessage.id,
                message: functionMessage,
                type: "message",
                chat: this.data.id!
              } );
            } else if ( buffer ) {
              responseText += chunk.text;
              if ( responseText.length >= 5 ) {
                chat.out( {
                  id: responseId,
                  type: "stream",
                  chat: chat.data.id!,
                  text: responseText,
                } );
                buffer = false;
              }
            } else {
              responseText += chunk.text;
              chat.out( {
                id: responseId,
                type: "stream",
                text: chunk.text,
                chat: chat.data.id!,
              } );
            }
          }
        } )();
      } catch ( error ) {
        // this is a error with the LLM service, 
        // we assume this error is unrecoverable
        reject( error );
        return;
      }
      // response has finished streaming
      if ( responseText.trim() !== "" ) {
        // we have a textual response
        const responseMessage: LLM.Message.TextResponse = {
          id: responseId,
          type: "response",
          text: responseText,
          visibility: LLM.Visibility.OPTIONAL,
          createdAt: new Date(),
          tokens: {
            message: tokens.output,
            input: tokens.input,
          },
          prompt: caller,
          codeBlocks: extractCodeBlocks( responseText ),
          window: messages.map( ( { id } ) => id ),
          tools: tools.length ? tools.map( f => f.name ) : undefined,
        };
        chat.data.messages.push( responseMessage );
        chat.out( { id: responseMessage.id, type: "message", message: responseMessage, chat: chat.data.id! } );
      }

      // evaluate the functions if any were requested
      const currentStage = chat.pipeline[ chat.pipelineCursor ]?.stage;
      for ( const func of funcs ) {
        const { func: promise, name, args } = func!;
        const calls = chat.functions[ name ].calls;
        if ( calls > 2 && currentStage === name ) {
          // this function has been called multiple times within the current stage
          //  which is going to be treated as a never resolving loop.
          reject( new Error( `Function Loop - function: ${ name }` ) );
          return;
        }
        chat.functions[ name ].calls += 1;
        // todo error handling for args
        let params: { [ key: string ]: unknown; } = {};
        try {
          params = args !== "" ? parseJSON( args! ) : {};
        } catch ( error ) {
          const errorMessage: LLM.Message.Error = {
            id: chat.storage.newId(),
            type: "error",
            error: `Error parsing function arguments for ${ name }: ${ error }`,
            createdAt: new Date(),
            visibility: LLM.Visibility.SYSTEM,
            tokens: {
              message: 0
            }
          };
          errorMessage.tokens.message = chat.llm.tokens( errorMessage );
          chat.out( { id: errorMessage.id, type: "message", message: errorMessage, chat: chat.data.id! } );
        }
        let result: ToolResults;
        try {
          const _result = promise( { ...params, locals: chat.locals, chat, tool_call_id: func.tool_call_id } );
          if ( _result instanceof Promise ) {
            result = await _result;
          } else {
            result = _result;
          }
          const toolResult: LLM.Message.ToolResult<ToolResults> = {
            id: chat.storage.newId(),
            type: "tool",
            result,
            createdAt: new Date(),
            call_id: func.tool_call_id,
            visibility: LLM.Visibility.SYSTEM,
            tokens: {
              message: 0,
            }
          };
          toolResult.tokens.message = chat.llm.tokens( toolResult );
          chat.data.messages.push( toolResult );
          chat.out( { id: toolResult.id, type: "message", message: toolResult, chat: chat.data.id! } );
        } catch ( error ) {
          const errorMessage: LLM.Message.Error = {
            id: chat.storage.newId(),
            type: "error",
            error: String( error ),
            createdAt: new Date(),
            visibility: LLM.Visibility.SYSTEM,
            tokens: {
              message: 0
            }
          };
          errorMessage.tokens.message = chat.llm.tokens( errorMessage );
          chat.data.messages.push( errorMessage );
        }
      }

      if ( !funcs.length ) {
        // no functions were requested and only a response was received
        // no further action is needed
        resolve();
        return;
      }

      // function results were added to the chat
      // we will resend the chat to have the LLM respond to 
      // the function results
      const stage = { id: this.storage.newId(), stage: "tool:result", promise: ( $chat: Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> ) => chat._send( { chat: $chat, functions, windowSize, caller } ) };
      const currentStageIndex = chat.pipelineCursor + 1;
      if ( currentStageIndex >= chat.pipeline.length ) {
        // end of the chat, just need to push the new stage
        chat.pipeline.push( stage );
      } else {
        // middle of pipeline, we need to insert the stage in the current position and shift all subsequent stages
        chat.pipeline = [
          ...chat.pipeline.slice( 0, currentStageIndex + 1 ),
          stage,
          ...chat.pipeline.slice( currentStageIndex + 1 )
        ];
      }
      resolve();
    } );
  }
  /**
   * executes the pipeline
   * 
   * @returns {Promise}
   */
  async execute( { locals, metadata }: { locals?: Locals; metadata?: Omit<Metadata, "$">; } = {} ): Promise<Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata>> {
    return new Promise<Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata>>( async ( resolve, reject ) => {
      this.locals = { ...this.locals, ...locals };
      this.data.metadata = { ...this.data.metadata, ...metadata };
      let error: any = undefined;
      let stageIds: string[] = [];
      try {
        let hasNext = true;
        this.out( { id: this.data.id!, type: this.type, state: "open", chat: this.data.id! } );
        while ( hasNext ) {

          // check for an exit code
          if ( this.exitCode ) {
            if ( this.exitCode !== 1 ) throw this.exitCode;
            hasNext = false;
            continue;
          }

          // evaluate the call stack for a loop
          const result = detectLoop( stageIds, this.settings.maxCallStack );
          const a = false;
          if ( result.loop ) throw new LoopError( result );

          // perform the stage
          const item = this.pipeline[ this.pipelineCursor + 1 ];
          if ( item === undefined ) break;
          const { promise, stage, id } = item;
          stageIds.push( id );
          this.out( { id: id, type: "stage", stage, chat: this.data.id!, state: "begin" } );
          await promise( this );
          this.out( { id: id, type: "stage", stage, chat: this.data.id!, state: "end" } );
          this.pipelineCursor += 1;
          this.nextPosition = this.pipelineCursor + 1;
        }
      } catch ( e ) {
        const errorMessage: LLM.Message.Error = {
          id: this.storage.newId(),
          type: "error",
          visibility: LLM.Visibility.SYSTEM,
          createdAt: new Date(),
          error: e instanceof Error ? e.message : String( e ),
          tokens: {
            message: 0
          }
        };
        errorMessage.tokens.message = this.llm.tokens( errorMessage );
        this.data.messages.push( errorMessage );
        this.out( { id: errorMessage.id, type: "message", chat: this.data.id!, message: errorMessage } );
        error = e;
      } finally {
        this.llm.close();
        this.out( { id: this.data.id!, type: this.type, state: "closed", chat: this.data.id! } );
        const totalTokens = this.data.messages
          .reduce( ( prev, curr ) => {
            if ( curr.type === "response" || curr.type === "function" ) {
              prev.inputs += curr.tokens.input || 0;
              prev.outputs += curr.tokens.message || 0;
            } else {
              prev.inputs += curr.tokens.message;
            }
            return prev;
          }, { inputs: 0, outputs: 0 } );
        this.data.inputs = totalTokens.inputs;
        this.data.outputs = totalTokens.outputs;
        await this.save();
        error ? reject( error ) : resolve( this );
      }
    } );
  }
}