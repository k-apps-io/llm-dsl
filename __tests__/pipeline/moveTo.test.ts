import { localFileStorage, localFileStream } from "../../src/Stream";
import { ChatGPT } from "../ChatGPT";


const chat = new ChatGPT( {
  timeout: 10000,
  model: "gpt-4o-mini"
} );
describe( "pipeline.move", () => {
  it( "forward 1", async () => {
    const $chat = await chat
      .clone()
      .prompt( {
        prompt: {
          role: "user",
          content: "hello!"
        }
      }, "1" )
      .response( ( { chat } ) => {
        return new Promise<void>( ( resolve, reject ) => {
          chat.moveTo( { id: "4" } );
          resolve();
        } );
      } )
      .prompt( {
        prompt: {
          role: "user",
          content: "love ya"
        }
      }, "3" )
      .prompt( {
        prompt: {
          role: "user",
          content: "goodbye."
        }
      }, "4" )
      .pipe( localFileStream( { directory: __dirname, filename: "move.forward.1", append: false } ) )
      .execute();
    localFileStorage( { directory: __dirname, filename: "move.forward.1", chat: $chat } );
    expect( $chat.data.messages.length ).toBe( 4 ); // x2 for each prompt
  }, 60000 );

  it( "forward 2", async () => {
    const $chat = await chat
      .clone()
      .prompt( {
        prompt: {
          role: "user",
          content: "hello!"
        }
      }, "1" )
      .prompt( {
        prompt: {
          role: "user",
          content: "tell me a joke"
        }
      }, "3" )
      .response( ( { chat } ) => {
        return new Promise<void>( ( resolve, reject ) => {
          chat.moveTo( { id: "6" } );
          resolve();
        } );
      } )
      .prompt( {
        prompt: {
          role: "user",
          content: "I liked that. tell me another please."
        }
      }, "4" )
      .prompt( {
        prompt: {
          role: "user",
          content: "I liked that. tell me another please."
        }
      }, "5" )
      .prompt( {
        prompt: {
          role: "user",
          content: "goodbye."
        }
      }, "6" )
      .pipe( localFileStream( { directory: __dirname, filename: "move.forward.2", append: false } ) )
      .execute();
    localFileStorage( { directory: __dirname, filename: "move.forward.2", chat: $chat } );
    expect( $chat.data.messages.length ).toBe( 6 ); // x2 for each prompt
  }, 60000 );
} );