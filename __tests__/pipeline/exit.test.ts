import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals } from "../../src/DSL";
import { localFileStream } from "../../src/Stream";

interface L extends Locals {
  key: string;
}

const chat = new DSL<Options, L, undefined>( {
  llm: new ChatGPT( {
    timeout: 10000
  }, "gpt-3.5-turbo" ),
  options: {
    model: "gpt-3.5-turbo",
  }
} );
describe( "pipeline.exit", () => {
  it( "exit with OK", async () => {
    const $chat = await chat
      .clone()
      .prompt( {
        message: "hello!"
      }, "1" )
      .response( ( { chat } ) => {
        return new Promise<void>( ( resolve, reject ) => {
          chat.exit();
          resolve();
        } );
      } )
      .prompt( {
        message: "goodbye."
      }, "3" )
      .stream( localFileStream( { directory: __dirname, filename: "exit.ok.test" } ) );
    expect( $chat.data.messages.length ).toBe( 2 );
    expect( $chat.exitCode ).toBe( 1 );
  } );
  it( "exit with Error", async () => {
    const $chat = chat
      .clone()
      .prompt( {
        message: "hello!"
      }, "1" )
      .response( ( { chat } ) => {
        return new Promise<void>( ( resolve, reject ) => {
          chat.exit( new Error( "this error is expected" ) );
          resolve();
        } );
      } )
      .prompt( {
        message: "goodbye."
      }, "3" )
      .stream( localFileStream( { directory: __dirname, filename: "exit.error.test" } ) );

    await expect( $chat ).rejects.toThrow();
  } );

} );