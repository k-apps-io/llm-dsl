import { ClientOptions, OpenAI } from 'openai';
import { ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming } from 'openai/resources';
import { encoding_for_model } from 'tiktoken';
import { FunctionResponse, LLM, Options, Stream, TextResponse } from "../DSL";

interface StreamOptions extends Stream, Omit<ChatCompletionCreateParamsStreaming, "messages" | "stream" | "functions"> { }

export interface PromptOptions extends Options, Omit<ChatCompletionCreateParamsNonStreaming, "messages"> { }

class ChatGPT extends LLM {
  openapi: OpenAI;

  constructor( options: ClientOptions ) {
    super();
    this.openapi = new OpenAI( options );
  }

  tokens( text: string ): number {
    const enc = encoding_for_model( "gpt-4" );
    const tokens = enc.encode( text );
    enc.free();
    return tokens.length;
  }

  async *stream( config: StreamOptions ): AsyncIterable<FunctionResponse | TextResponse> {
    const { messages, functions } = config;
    const body: ChatCompletionCreateParamsStreaming = {
      model: config.model,
      stream: true,
      messages: messages.map( m => {
        return {
          content: m.prompt,
          role: m.role,
        };
      } ),
    };

    if ( functions !== undefined && functions.length > 0 ) body.functions = functions;

    const stream = await this.openapi.chat.completions.create( body );

    for await ( const chunk of stream ) {
      if ( chunk.choices[ 0 ].delta.function_call ) {
        const call = chunk.choices[ 0 ].delta.function_call;
        yield { type: "function", name: call.name!, arguments: call.arguments };
      } else {
        const content = chunk.choices[ 0 ].delta?.content || '';
        yield { content: content, type: "text" };
      }
    }
  }
}

export default ChatGPT;