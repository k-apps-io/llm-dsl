import { DSL, localFileStorage, localFileStream } from "../../src";
import { ChatGPT } from "../ChatGPT";

describe( "window.main.prompt", () => {
  it( "window.main.prompt", async () => {
    const chat = new DSL( {
      llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
    } );
    const $chat = await chat
      .prompt( {
        content: "Hello World!",
        key: "1"
      } )
      .prompt( {
        content: "I'm doing greate",
        key: "2"
      } )
      .prompt( {
        content: "I'm not doing well",
        key: "2"
      } )
      .stream( localFileStream( { directory: __dirname, filename: "window.main.prompt", append: false } ) );
    localFileStorage( { directory: __dirname, chat: $chat, filename: "window.main.prompt" } );
    const firstPromptId = $chat.data.messages.filter( m => m.key === "1" )[ 0 ].id;
    const firstMessages = $chat.data.messages.filter( m => m.prompt === firstPromptId );
    const secondPromptId = $chat.data.messages.filter( m => m.key === "2" )[ 0 ].id;
    const secondMessages = $chat.data.messages.filter( m => m.prompt === secondPromptId );
    const secondActualWindow = secondMessages[ 0 ].window!;
    expect( secondActualWindow.length ).toBe( 2 );
    const secondExpectedWindow = [ firstMessages[ 0 ].id, firstMessages[ 1 ].id ];
    expect( secondActualWindow ).toMatchObject( secondExpectedWindow );
    const thirdPromptId = $chat.data.messages.filter( m => m.key === "2" )[ 1 ].id;
    const thirdMessages = $chat.data.messages.filter( m => m.prompt === thirdPromptId );
    const thirdActualWindow = thirdMessages[ 0 ].window!;
    expect( thirdActualWindow.length ).toBe( 2 );
    const thirdExpectedWindow = [ firstMessages[ 0 ].id, firstMessages[ 1 ].id ];
    expect( thirdActualWindow ).toMatchObject( thirdExpectedWindow );
  }, 60000 );
} );