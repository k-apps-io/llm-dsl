import { AzureOpenAI, ClientOptions, OpenAI } from "openai";
import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam
} from "openai/resources";
import { encoding_for_model, Tiktoken, TiktokenModel } from "tiktoken";
import {
  Function,
  FunctionResponse,
  LLM,
  Options as LLMOptions,
  Message,
  Stream,
  TextResponse,
} from "../src/index";

interface StreamOptions
  extends Stream,
  Omit<
    ChatCompletionCreateParamsStreaming,
    "messages" | "stream" | "functions" | "max_tokens"
  > { }

export type Content = ChatCompletionCreateParamsNonStreaming[ "messages" ][ 0 ][ "content" ];

export type Options
  = LLMOptions<Content> & ChatCompletionMessageParam & {
    model?: TiktokenModel | string;
    content: Content;
    tool_calls?: ChatCompletionAssistantMessageParam[ "tool_calls" ];
  };

interface ChatGPTOptions extends ClientOptions {
  model: TiktokenModel | string;
  client?: OpenAI | AzureOpenAI;
}

const determineEncoder = ( model: string ): Tiktoken => {
  const match = model.match( /ft:(.+):.+::.+/i );
  if ( match ) {
    model = match[ 1 ] as TiktokenModel;
  }
  try {
    return encoding_for_model( model as TiktokenModel );
  } catch ( error ) {
    process.emitWarning( `Encoder could not be determined for model: ${ model }` );
    return encoding_for_model( "gpt-4" );
  }
};

export class ChatGPT extends LLM<Content> {

  openapi: OpenAI | AzureOpenAI;
  options: ClientOptions;
  encoder: Tiktoken;
  model: string;

  constructor( options: ChatGPTOptions ) {
    super();
    this.model = options.model;
    if ( typeof options.model !== "string" ) {
      this.encoder = options.model;
    } else {
      this.encoder = determineEncoder( options.model );
    }
    this.options = options;
    if ( options.client ) {
      this.openapi = options.client;
      delete options.client;
    } else {
      this.openapi = new OpenAI( options );
    }
  }

  tokens( content: Content ): number {
    if ( content === undefined || content === null ) {
      return 0; // no content, no tokens
    } else if ( typeof content === "string" ) {
      const tokens = this.encoder.encode( content );
      return tokens.length;
    } else if ( Array.isArray( content ) ) {
      return content.reduce( ( total, item ) => {
        if ( item.type === "text" ) {
          total += this.tokens( item.text );
        }
        return total;
      }, 0 );
    } else {
      return -1; // unknown type
    }
  }

  /**
   * this calculation is based off https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb and
   * should be treated as an estimate and not a exact calculation
   *
   * @param {Message[]} window
   * @returns number
   */
  windowTokens( window: Message[] ): number {
    let tokensPerMessage: number;
    let tokensPerName: number;
    const model = this.model;
    if ( model === "gpt-3.5-turbo-0301" ) {
      tokensPerMessage = 4; // every message follows {role/name}\n{content}\n
      tokensPerName = -1; // if there's a name, the role is omitted
    } else if (
      model === "gpt-3.5-turbo-0613" ||
      model === "gpt-3.5-turbo-16k-0613" ||
      model === "gpt-4-0314" ||
      model === "gpt-4-32k-0314" ||
      model === "gpt-4-0613" ||
      model === "gpt-4-32k-0613" ||
      model.includes( "gpt-3.5-turbo" ) ||
      model.includes( "gpt-4" )
    ) {
      tokensPerMessage = 3;
      tokensPerName = 1;
    } else {
      process.emitWarning(
        `model ${ model } is unknown. The window tokens will be calculated using gpt-4`
      );
      tokensPerMessage = 3;
      tokensPerName = 1;
    }

    let numTokens = 0;

    for ( const message of window ) {
      numTokens += tokensPerMessage + message.size;
      if ( Object.keys( message ).includes( "name" ) ) {
        numTokens += tokensPerName;
      }
    }

    numTokens += 3; // every reply is primed with assistant
    return numTokens;
  }

  /**
   * calculation is based off https://stackoverflow.com/questions/77168202/calculating-total-tokens-for-api-request-to-chatgpt-including-functions
   * and should be treated as an estimate and not an exact calculation
   *
   * @param {Function[]} functions
   * @returns {{ total: number;[ key: string ]: number; }}
   */
  functionTokens( functions: Function[] ): {
    total: number;
    [ key: string ]: number;
  } {
    if ( functions.length === 0 ) return { total: 0 };
    return functions
      .map( ( { name, description, parameters } ) => {
        let tokenCount = 7; // 7 for each function to start
        tokenCount += this.encoder.encode( `${ name }:${ description }` ).length;
        if ( parameters ) {
          tokenCount += 3;
          Object.keys( parameters.properties ).forEach( ( key ) => {
            tokenCount += 3;
            const p_type = parameters.properties[ key ].type;
            const p_desc = parameters.properties[ key ].description;
            if ( p_type === "enum" ) {
              tokenCount += 3; // Add tokens if property has enum list
              const options: string[] = parameters.properties[ key ].enum;
              options.forEach( ( v: any ) => {
                tokenCount += this.encoder.encode( String( v ) ).length + 3;
              } );
            }
            tokenCount += this.encoder.encode(
              `${ key }:${ p_type }:${ p_desc }"`
            ).length;
          } );
        }
        return [ name, tokenCount ] as [ string, number ];
      } )
      .reduce(
        ( total, [ name, count ] ) => {
          total[ name ] = count;
          total.total += count;
          return total;
        },
        { total: 12 } as { total: number;[ key: string ]: number; }
      );
  }

  close(): void {
    // this.encoder.free();
  }

  async *stream(
    config: StreamOptions
  ): AsyncIterable<FunctionResponse<Options> | TextResponse> {
    const { messages, functions } = config;
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = functions?.map( ( func ) => {
      return {
        type: "function",
        function: {
          name: func.name,
          description: func.description,
          parameters: func.parameters,
        },
      };
    } );
    const body: ChatCompletionCreateParamsStreaming = {
      model: config.model || this.model,
      stream: true,
      user: config.user,
      messages: messages as any,
      frequency_penalty: config.frequency_penalty,
      logit_bias: config.logit_bias,
      logprobs: config.logprobs,
      max_tokens: config.responseSize,
      n: config.n,
      parallel_tool_calls: config.parallel_tool_calls,
      presence_penalty: config.presence_penalty,
      response_format: config.response_format,
      seed: config.seed,
      stop: config.stop,
      service_tier: config.service_tier,
      stream_options: config.stream_options,
      temperature: config.temperature,
      tool_choice: config.tool_choice,
      tools,
      top_logprobs: config.top_logprobs,
      top_p: config.top_p,
    };

    const stream = await this.openapi.chat.completions.create( body );

    const toolCallsMap = new Map<
      string,
      { id: string; type: string; function: { name: string; arguments: string; }; }
    >();
    let toolCallId: string | undefined = undefined;
    for await ( const chunk of stream ) {
      const choice = chunk.choices[ 0 ];

      // Tool call detected
      if ( choice.delta.tool_calls?.length ) {
        for ( const toolCall of choice.delta.tool_calls ) {
          if ( toolCall.id && toolCall.id !== toolCallId ) toolCallId = toolCall.id;
          const existing = toolCallsMap.get( toolCallId! ) || {
            id: toolCallId!,
            type: toolCall.type!,
            function: { name: "", arguments: "" },
          };

          if ( toolCall.function?.name ) {
            existing.function.name = toolCall.function.name;
          }
          if ( toolCall.function?.arguments ) {
            existing.function.arguments += toolCall.function.arguments;
          }

          toolCallsMap.set( toolCallId!, existing );
        }
        continue;
      }

      // Text content
      toolCallId = undefined; // Reset tool call ID after processing
      const content = choice.delta.content;
      if ( content ) {
        yield { type: "text", content };
      }
    }

    // Yield complete tool calls
    for ( const [ , toolCall ] of toolCallsMap.entries() ) {
      yield {
        type: "function",
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
        id: toolCall.id,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: toolCall.id,
              type: "function",
              function: {
                name: toolCall.function.name,
                arguments: toolCall.function.arguments,
              },
            },
          ],
        },
      };
    }
  }


  /**
 * Prepares the content/messages for the OpenAI API request.
 * Converts internal Message format to OpenAI's expected message format.
 * Optionally, can be extended to handle function calls or other OpenAI features.
 */
  prepareContent( options: Options ) {
    let { content, functions, ...rest } = options;
    if ( typeof content === "string" ) {
      content = content.replaceAll( /\n\s+(\w)/gmi, '\n$1' ).trim();
    }
    return content;
  }
}
