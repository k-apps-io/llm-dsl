import { DSL, Locals } from "../src/DSL";
import { localFileStorage, localFileStream } from "../src/Stream";
import { ChatGPT, Options } from "./ChatGPT";

const chat = new DSL<Options, Locals, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );
describe( "'Hello, World!'", () => {
  it( 'hello world', async () => {
    const $chat = chat
      .clone();
    await $chat
      .prompt( {
        content: "hello world"
      } )
      .stream( localFileStream( { directory: __dirname, filename: "hello world" } ) )
      .catch( error => {
        console.error( error );
      } );
    localFileStorage( { directory: __dirname, chat: $chat, filename: "hello world" } );
    expect( true ).toBe( true );
  }, 60000 );
} );