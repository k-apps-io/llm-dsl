import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL } from "../../src/DSL";
import { json } from "../../src/Expect";
import { stream, write } from "../../src/FileSystem";
import { CODE_BLOCK_RULE } from "../../src/Rules";
import { key } from "../../src/Window";


describe( ".expect", () => {
  it( 'expectJSON', async () => {
    const chat = new DSL<Options, any, undefined>( {
      llm: new ChatGPT( {}, "gpt-3.5-turbo" ),
      options: {
        model: "gpt-3.5-turbo"
      },
      locals: {
        attempts: 0
      },
      window: key
    } );
    await chat
      .rule( CODE_BLOCK_RULE )
      .prompt( {
        message: `
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
      .stream( stream( { directory: __dirname, filename: 'expectJSON' } ) );
    write( { directory: __dirname, chat, filename: 'expectJSON' } );
    expect( chat.locals.$blocks ).toBeDefined();
    expect( true ).toBe( true );
  }, 100000 );

  it( 'expectCallstackExceeded', async () => {
    try {
      const chat = new DSL<Options, any, undefined>( {
        llm: new ChatGPT( {}, "gpt-3.5-turbo" ),
        options: {
          model: "gpt-3.5-turbo"
        },
        settings: {
          maxCallStack: 3
        },
        window: key
      } );
      await chat
        .rule( CODE_BLOCK_RULE )
        .prompt( {
          message: "generate a JSON Array of city names"
        } )
        .expect( response => new Promise<void>( ( resolve, reject ) => {
          reject( "I need different cities" );
        } ) )
        .stream( stream( { directory: __dirname, filename: 'expectCallstackExceeded' } ) );
      write( { directory: __dirname, chat, filename: 'expectCallstackExceeded' } );
      expect( false ).toBe( true );
    } catch ( error ) {
      expect( String( error ) ).toContain( "Max Call Stack Exceeded" );
    }
  }, 200000 );
} );