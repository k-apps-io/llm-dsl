import { localFileStream } from "../../src/Stream";
import { ChatGPT } from "../ChatGPT";

const chat = new ChatGPT( {
  timeout: 10000,
  model: "gpt-4o-mini"
} );
describe( "pipeline.exit", () => {

  it( "exit with OK", async () => {
    const $chat = await chat
      .clone()
      .prompt( {
        prompt: {
          role: "user",
          content: "hello!"
        }
      }, "1" )
      .response( ( { chat: $this } ) => {
        return new Promise<void>( ( resolve, reject ) => {
          $this.exit();
          resolve();
        } );
      } )
      .prompt( {
        prompt: {
          role: "user",
          content: "goodbye."
        }
      }, "3" )
      .pipe( localFileStream( { directory: __dirname, filename: "exit.ok.test" } ) )
      .execute();
    expect( $chat.data.messages.length ).toBe( 2 );
    expect( $chat.exitCode ).toBe( 1 );
  }, 60000 );

  it( "exit with Error", async () => {
    const $chat = chat
      .clone()
      .prompt( {
        prompt: {
          role: "user",
          content: "hello!"
        }
      }, "1" )
      .response( ( { chat: $this } ) => {
        return new Promise<void>( ( resolve, reject ) => {
          $this.exit( new Error( "this error is expected" ) );
          resolve();
        } );
      } )
      .prompt( {
        prompt: {
          role: "user",
          content: "goodbye."
        }
      }, "3" )
      .pipe( localFileStream( { directory: __dirname, filename: "exit.error.test" } ) )
      .execute();

    await expect( $chat ).rejects.toThrow();
  }, 60000 );

} );