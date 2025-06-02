import { LLM } from "../../src/definitions";
import { json, JSON } from "../../src/Expect";
import { CODE_BLOCK_RULE } from "../../src/Rules";
import { localFileStorage, localFileStream } from "../../src/Stream";
import { LoopError } from "../../src/utilities";
import { ChatGPT } from "../ChatGPT";


describe( ".expect", () => {
  it( 'expectJSON', async () => {
    interface Locals extends LLM.Locals {
      attempts: number;
      json?: JSON;
    }
    const chat = new ChatGPT<Locals>( { model: "gpt-4o-mini" }, { locals: { attempts: 0 } } );
    await chat
      .rule( CODE_BLOCK_RULE )
      .prompt( {
        prompt: {
          role: "user",
          content: `generate a JSON Array of 2 city names`
        }
      } )
      .expect(
        json( { blocks: 1, errorPrompt: "generate a JSON Array of 2 different city names" } ),
        ( { chat, json } ) => new Promise<LLM.Stage.ExpectErrorResult | void>( ( resolve, reject ) => {
          if ( chat.locals.attempts <= 1 ) {
            chat.locals.attempts += 1;
            resolve( {
              type: "error",
              error: "generate a JSON Array of 2 different city names"
            } );
          } else {
            chat.locals.json = json;
            resolve();
          }
        } )
      )
      .pipe( localFileStream( { directory: __dirname, filename: 'expectJSON' } ) )
      .execute();
    localFileStorage( { directory: __dirname, chat, filename: 'expectJSON' } );
    expect( chat.locals.json ).toBeDefined();
    expect( true ).toBe( true );
  }, 100000 );

  it( 'expectCallstackExceeded', async () => {
    const chat = new ChatGPT( { model: "gpt-4o-mini" }, { settings: { maxCallStack: 3 } } );
    const $chat = chat
      .rule( CODE_BLOCK_RULE )
      .prompt( {
        prompt: {
          role: "user",
          content: "generate a JSON Array of city names"
        }
      } )
      .expect( () => new Promise( ( resolve, reject ) => {
        resolve( {
          type: "error",
          error: "I need different cities"
        } );
      } ) )
      .pipe( localFileStream( { directory: __dirname, filename: 'expectCallstackExceeded', append: false } ) )
      .execute();
    await expect( $chat ).rejects.toThrow( LoopError );
  }, 200000 );
} );