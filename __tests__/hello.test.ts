import { localFileStorage, localFileStream } from "../src/Stream";
import { ChatGPT } from "./ChatGPT";

const chat = new ChatGPT( { model: "gpt-4o-mini" } );

describe( "'Hello, World!'", () => {
  it( 'hello world', async () => {
    const $chat = chat
      .clone();
    await $chat
      .prompt( {
        prompt: {
          role: "user",
          content: "hello world"
        },
      } )
      .pipe( localFileStream( { directory: __dirname, filename: "hello world" } ) )
      .execute();
    localFileStorage( { directory: __dirname, chat: $chat, filename: "hello world" } );
    expect( true ).toBe( true );
  }, 60000 );
} );