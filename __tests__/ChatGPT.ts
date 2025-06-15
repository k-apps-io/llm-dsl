import { AzureOpenAI, ClientOptions, OpenAI } from "openai";
import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionDeveloperMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam
} from "openai/resources";
import { encoding_for_model, Tiktoken, TiktokenModel } from "tiktoken";
import { Agent, Initializer } from "../src/Agent";
import {
  LLM
} from "../src/definitions";

export type Options = LLM.Model.Options & Omit<ChatCompletionCreateParams, "messages" | "stream" | "model"> & {
  model?: TiktokenModel | string;
  stream?: true;
};

export type Prompts = LLM.Model.Prompts & (
  ChatCompletionDeveloperMessageParam
  | ChatCompletionUserMessageParam
  | ChatCompletionSystemMessageParam
  | ChatCompletionSystemMessageParam
);

export type Responses = LLM.Model.Responses & (
  ChatCompletionAssistantMessageParam
);

export type ToolResults = LLM.Model.ToolResults & (
  ChatCompletionToolMessageParam
);

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

const mapMessage = ( message: LLM.Message.Message<Options, Prompts, Responses, ToolResults> ): ChatCompletionMessageParam => {
  switch ( message.type ) {
    case "prompt":
      const { prompt } = message;
      return prompt as ChatCompletionMessageParam;
    case "response":
      return {
        role: "assistant",
        content: message.text,
      };
    case "function":
      return {
        role: "assistant",
        tool_calls: [
          {
            id: message.call_id!,
            type: "function",
            function: {
              name: message.function.name,
              arguments: message.function.arguments ?? "",
            },
          }
        ]
      };
    case "instruction":
      return {
        role: "system",
        content: message.instruction,
      };
    case "rule":
      return {
        role: "system",
        content: message.rule,
      };

    case "context":
      return {
        role: "system",
        content: message.context,
      };

    case "tool":
      return message.result as ChatCompletionToolMessageParam;
    case "error":
      return {
        role: "system",
        content: message.error,
      };
    default:
      throw new Error( `Unsupported message type` );
  }
};


const main = ( encoder: Tiktoken, content: string | OpenAI.Chat.Completions.ChatCompletionContentPartText[] | OpenAI.Chat.Completions.ChatCompletionContentPart[] ): number => {
  if ( typeof content === "string" ) {
    return encoder.encode( content ).length;
  } else if ( Array.isArray( content ) ) {
    return content.reduce( ( total, item ) => {
      if ( item.type == "text" ) {
        total += encoder.encode( item.text ).length;
      } else if ( item.type == "image_url" ) {
        total += 0;
      } else if ( item.type == "input_audio" ) {
        total += 0;
      } else if ( item.type == "file" ) {
        if ( item.file.file_data ) {
          // todo
          total += 0;
        } else if ( item.file.filename ) {
          // todo 
          total += 0;
        } else if ( item.file.file_id ) {
          // todo
          total += 0;
        }
      }
      return total;
    }, 0 );
  } else {
    return 0;
  }
};

export class ChatGPT<Locals extends LLM.Locals = LLM.Locals, Metadata extends LLM.Metadata = LLM.Metadata> extends Agent<Options, Prompts, Responses, ToolResults, Locals, Metadata> {

  constructor( service: ChatGPTOptions, options: Omit<Initializer<Options, Prompts, Responses, ToolResults, Locals, Metadata>, "llm"> = {} ) {
    super( {
      llm: new Service( service ),
      ...options,
    } );
  }

  // expect( handler: LLM.Stage.Expect<Options, Prompts, Responses, ToolResults, Locals, Metadata>, ...others: LLM.Stage.Expect<Options, Prompts, Responses, ToolResults, Locals, Metadata>[] ): DSL<Options, Prompts, Responses, ToolResults, Locals, Metadata> {
  //   return super.expect( handler, ...others );
  // }
}

export class Service implements LLM.Model.Service<Options, Prompts, Responses, ToolResults> {

  openapi: OpenAI | AzureOpenAI;
  options: ClientOptions;
  encoder: Tiktoken;
  model: string;

  constructor( options: ChatGPTOptions ) {
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

  tokens(
    message: LLM.Message.Message<Options, Prompts, Responses, ToolResults>
  ): number {
    switch ( message.type ) {
      case "prompt":
        const { prompt } = message;
        return main( this.encoder, prompt.content );
      case "response":
        return this.encoder.encode( message.text ).length;
      case "function":
        const name = message.function.name;
        const args = message.function.arguments;
        return this.encoder.encode( `${ name }${ args }` ).length;
      case "tool":
        const result: ChatCompletionToolMessageParam = message.result;
        return main( this.encoder, result.content );
      case "instruction":
        return this.encoder.encode( message.instruction ).length;
      case "rule":
        return this.encoder.encode( message.rule ).length;
      case "context":
        return this.encoder.encode( message.context ).length;
      case "error":
        return this.encoder.encode( message.error ).length;
      default:
        return 0; // unsupported message type
    }
  }

  /**
   * this calculation is based off https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb and
   * should be treated as an estimate and not a exact calculation
   *
   * @param {Message[]} window
   * @returns number
   */
  windowTokens(
    window: LLM.Message.Message<Options, Prompts, Responses, ToolResults>[]
  ): number {
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
      numTokens += tokensPerMessage + message.tokens.message;
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
   */
  functionTokens(
    functions: Omit<LLM.Tool.Tool<Options, Prompts, Responses, ToolResults>, "func">[]
  ): {
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
    config: LLM.Stream.Args<Options, Prompts, Responses, ToolResults>
  ): AsyncIterable<LLM.Stream.Response> {
    const { user, messages: _messages, functions, options } = config;
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
    const messages = _messages.map( mapMessage );
    const body: ChatCompletionCreateParamsStreaming = {
      ...options,
      tools: tools?.length ? tools : undefined,
      model: options?.model || this.model,
      stream: options?.stream ?? true,
      messages: messages as any,
      user,
      stream_options: {
        include_usage: true,
        ...options?.stream_options
      },
    };

    const stream = await this.openapi.chat.completions.create( body );

    const toolCallsMap = new Map<
      string,
      { id: string; type: string; function: { name: string; arguments: string; }; }
    >();
    let toolCallId: string | undefined = undefined;
    for await ( const chunk of stream ) {

      if ( chunk.usage ) {
        yield {
          type: "usage",
          tokens: {
            input: chunk.usage.prompt_tokens,
            output: chunk.usage.completion_tokens
          },
        };
        continue;
      }
      // todo - handle multi choice responses
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
        yield { type: "text", text: content };
      }
    }

    // Yield complete tool calls
    for ( const [ , toolCall ] of toolCallsMap.entries() ) {
      yield {
        type: "tool",
        function: toolCall.function,
        call_id: toolCall.id,
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
