import { CODE_BLOCK_RULE, DSL, localFileStorage, localFileStream } from "../../src";
import { ChatGPT } from "../ChatGPT";

describe( "window.main.promptForEach", () => {
  it( "window.main.promptForEach", async () => {
    const chat = new DSL( {
      llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
    } );
    const $chat = await chat
      .push( {
        content: "Help me generate a hello world program."
      } )
      .rule( CODE_BLOCK_RULE )
      .promptForEach( () => {
        return [ "javascript", "python", "C++" ].map( lang => ( {
          content: `use ${ lang }`,
          key: "1"
        } ) );
      } )
      .stream( localFileStream( { directory: __dirname, filename: "window.main.promptForEach", append: false } ) );
    localFileStorage( { directory: __dirname, chat: $chat, filename: "window.main.promptForEach" } );
    const execptedWindow = $chat.data.messages.slice( 0, 2 ).map( m => m.id );
    const prompts = $chat.data.messages.filter( m => m.key === "1" );
    const [ js, py, c ] = prompts;
    expect( js.window!.length ).toBe( 2 );
    expect( js.window ).toMatchObject( execptedWindow );
    expect( py.window!.length ).toBe( 2 );
    expect( py.window ).toMatchObject( execptedWindow );
    expect( c.window!.length ).toBe( 2 );
    expect( c.window ).toMatchObject( execptedWindow );

  }, 60000 );
} );