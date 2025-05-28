import { DSL } from "../../src/DSL";
import { json } from "../../src/Expect";
import { CODE_BLOCK_RULE } from "../../src/Rules";
import { localFileStorage, localFileStream } from "../../src/Stream";
import { ChatGPT, Options } from "../ChatGPT";


describe( ".expect", () => {
  it( 'expectJSON', async () => {
    const chat = new DSL<Options, any, undefined>( {
      llm: new ChatGPT( { model: "gpt-3.5-turbo" } ),
      locals: {
        attempts: 0
      }
    } );
    await chat
      .rule( CODE_BLOCK_RULE )
      .prompt( {
        content: `
          generate a JSON Array of 2 city names
        `
      } )
      .expect( json(), ( { chat } ) => new Promise<void>( ( resolve, reject ) => {
        if ( chat.locals.attempts <= 1 ) {
          chat.locals.attempts += 1;
          reject( "I need 3 more cities" );
        } else {
          resolve();
        }
      } ) )
      .stream( localFileStream( { directory: __dirname, filename: 'expectJSON' } ) );
    localFileStorage( { directory: __dirname, chat, filename: 'expectJSON' } );
    expect( chat.locals.$blocks ).toBeDefined();
    expect( true ).toBe( true );
  }, 100000 );

  it( 'expectCallstackExceeded', async () => {
    const chat = new DSL<Options, any, undefined>( {
      llm: new ChatGPT( { model: "gpt-3.5-turbo" } ),
      settings: {
        maxCallStack: 3
      }
    } );
    const $chat = chat
      .rule( CODE_BLOCK_RULE )
      .prompt( {
        content: "generate a JSON Array of city names"
      } )
      .expect( response => new Promise<void>( ( resolve, reject ) => {
        reject( "I need different cities" );
      } ) )
      .stream( localFileStream( { directory: __dirname, filename: 'expectCallstackExceeded', append: false } ) );
    await expect( $chat ).rejects.toThrow();
  }, 200000 );
} );