import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals } from "../../src/DSL";
import { localFileStorage, localFileStream } from "../../src/Stream";

interface L extends Locals {
  key: string;
}

const chat = new DSL<Options, L, undefined>( {
  llm: new ChatGPT( {
    timeout: 10000,
    model: "gpt-3.5-turbo"
  } )
} );
describe( "pipeline.move", () => {
  it( "forward 1", async () => {
    const $chat = await chat
      .clone()
      .prompt( {
        message: "hello!"
      }, "1" )
      .response( ( { chat } ) => {
        return new Promise<void>( ( resolve, reject ) => {
          chat.moveTo( { id: "4" } );
          resolve();
        } );
      } )
      .prompt( {
        message: "love ya"
      }, "3" )
      .prompt( {
        message: "goodbye."
      }, "4" )
      .stream( localFileStream( { directory: __dirname, filename: "move.forward.1", append: false } ) );
    localFileStorage( { directory: __dirname, filename: "move.forward.1", chat: $chat } );
    expect( $chat.data.messages.length ).toBe( 4 ); // x2 for each prompt
  } );
  it( "forward 2", async () => {
    const $chat = await chat
      .clone()
      .prompt( {
        message: "hello!"
      }, "1" )
      .prompt( {
        message: "tell me a joke"
      }, "3" )
      .response( ( { chat } ) => {
        return new Promise<void>( ( resolve, reject ) => {
          chat.moveTo( { id: "6" } );
          resolve();
        } );
      } )
      .prompt( {
        message: "I liked that. tell me another please."
      }, "4" )
      .prompt( {
        message: "I liked that. tell me another please."
      }, "5" )
      .prompt( {
        message: "goodbye."
      }, "6" )
      .stream( localFileStream( { directory: __dirname, filename: "move.forward.2", append: false } ) );
    localFileStorage( { directory: __dirname, filename: "move.forward.2", chat: $chat } );
    expect( $chat.data.messages.length ).toBe( 6 ); // x2 for each prompt
  } );
} );