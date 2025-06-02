import { LLM } from "../src/definitions";
import { localFileStorage, localFileStream } from "../src/Stream";
import { ChatGPT, Options, Prompts } from "./ChatGPT";

const chat = new ChatGPT( { model: "gpt-4o-mini" } );

describe( "Options in Prompts", () => {
  it( 'validates options are included in prompts and present in chat.data.messages', async () => {
    const $chat = chat.clone();
    const options: Options = {
      temperature: 0.7,
      max_completion_tokens: 500
    };
    await $chat
      .prompt( {
        prompt: {
          role: "user",
          content: "test prompt with options",
        },
        options
      } )
      .pipe( localFileStream( { directory: __dirname, filename: "test-prompt-with-options" } ) )
      .execute();
    localFileStorage( { directory: __dirname, chat: $chat, filename: "test-prompt-with-options" } );

    const messages = $chat.data.messages;
    const promptMessage = messages.find( ( msg ) => msg.type === "prompt" ) as LLM.Message.Prompt<Options, Prompts> | undefined;

    expect( promptMessage ).toBeDefined();
    expect( promptMessage!.options ).toEqual( options );
  }, 60000 );

  it( 'ensures options are not included for non-prompt messages', async () => {
    const $chat = chat.clone();

    await $chat
      .prompt( {
        prompt: {
          role: "user",
          content: "test prompt without options",
        },
      } )
      .pipe( localFileStream( { directory: __dirname, filename: "test-prompt-without-options" } ) )
      .execute();
    localFileStorage( { directory: __dirname, chat: $chat, filename: "test-prompt-without-options" } );

    const messages = $chat.data.messages;
    const promptMessage = messages.find( ( msg ) => msg.type === "prompt" ) as LLM.Message.Prompt<Options, Prompts> | undefined;;

    expect( promptMessage ).toBeDefined();
    expect( promptMessage!.options ).toBeUndefined();
  }, 60000 );
} );
