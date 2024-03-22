import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals } from "../src/DSL";
import { stream, write } from "../src/FileSystem";
import { key } from "../src/Window";

const chat = new DSL<Options, Locals, undefined>( {
  llm: new ChatGPT( {}, "gpt-3.5-turbo" ),
  options: {
    model: "gpt-3.5-turbo"
  },
  window: key
} );
describe( "'Hello, World!'", () => {
  it( 'hello world', async () => {
    const $chat = chat
      .clone();
    await $chat.prompt( {
      message: "hello world"
    } )
      .stream( stream( { directory: __dirname, filename: "hello world" } ) )
      .catch( error => {
        console.error( error );
      } );
    write( { directory: __dirname, chat: $chat, filename: "hello world" } );
    expect( true ).toBe( true );
  }, 60000 );
} );