import { DSL, Locals } from "../../src/DSL";
import { localFileStream } from "../../src/Stream";
import { ChatGPT, Options } from "../ChatGPT";

interface L extends Locals {
  key: string;
}

const chat = new DSL<Options, L, undefined>( {
  llm: new ChatGPT( {
    timeout: 10000,
    model: "gpt-3.5-turbo"
  } )
} );
describe( "pipeline.exit", () => {

  it( "exit with OK", async () => {
    const $chat = await chat
      .clone()
      .prompt( {
        content: "hello!"
      }, "1" )
      .response( ( { chat: $this } ) => {
        return new Promise<void>( ( resolve, reject ) => {
          $this.exit();
          resolve();
        } );
      } )
      .prompt( {
        content: "goodbye."
      }, "3" )
      .stream( localFileStream( { directory: __dirname, filename: "exit.ok.test" } ) );
    expect( $chat.data.messages.length ).toBe( 2 );
    expect( $chat.exitCode ).toBe( 1 );
  }, 60000 );

  it( "exit with Error", async () => {
    const $chat = chat
      .clone()
      .prompt( {
        content: "hello!"
      }, "1" )
      .response( ( { chat: $this } ) => {
        return new Promise<void>( ( resolve, reject ) => {
          $this.exit( new Error( "this error is expected" ) );
          resolve();
        } );
      } )
      .prompt( {
        content: "goodbye."
      }, "3" )
      .stream( localFileStream( { directory: __dirname, filename: "exit.error.test" } ) );

    await expect( $chat ).rejects.toThrow();
  }, 60000 );

} );