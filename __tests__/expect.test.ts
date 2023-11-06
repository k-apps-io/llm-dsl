import { ChatGPT, Options } from "@k-apps.io/llm-dsl-chatgpt";
import { createWriteStream } from "fs";
import { DSL } from "../src/DSL";
import { CODE_BLOCK_RULE } from "../src/Rules";
import { LocalStorage } from "../src/Storage";

const chat = new DSL<Options, any>( {
  llm: new ChatGPT( {} ),
  storage: LocalStorage,
  options: {
    model: "gpt-3.5-turbo"
  },
  metadata: {}
} );
describe( ".expect", () => {
  it( 'get json', async () => {
    const $chat = chat.clone();
    const fileStream = createWriteStream( `./__tests__/${ $chat.chat.id }.log` );
    await $chat
      .rule( CODE_BLOCK_RULE )
      .prompt( {
        message: "generate a JSON Array of city names"
      } )
      .expect( response => new Promise<void>( ( resolve, reject ) => {
        const blocks = response.codeBlocks || [];
        if ( blocks.length === 0 ) {
          reject( "a json code block was expected" );
        } else if ( blocks.length > 1 ) {
          reject( "only 1 code block was expected" );
        } else {
          const block = blocks[ 0 ];
          if ( block.lang !== "json" ) {
            reject( "a json code block was requested" );
          } else {
            try {
              const data = JSON.parse( block.code );
              resolve();
            } catch ( error ) {
              reject( `\`JSON.parse\` threw the exception ${ error }` );
            }
          }
        }
      } ) )
      .stream( chunk => {
        if ( chunk.type === "message" ) fileStream.write( chunk.content );
      } );
    expect( true ).toBe( true );
    fileStream.end();
  }, 100000 );

  it( 'exceeds expect callstack', async () => {
    let fileStream: any = null;
    try {
      const $chat = chat.clone();
      fileStream = createWriteStream( `./__tests__/${ $chat.chat.id }.log` );
      await $chat
        .rule( CODE_BLOCK_RULE )
        .prompt( {
          message: "generate a JSON Array of city names"
        } )
        .expect( response => new Promise<void>( ( resolve, reject ) => {
          reject( "I need different cities" );
        } ) )
        .stream( chunk => {
          if ( chunk.type === "message" ) fileStream.write( chunk.content );
        } );
      // it shouldn't succeed
      fileStream.end();
      expect( false ).toBe( true );
    } catch ( error ) {
      fileStream.end();
      expect( true ).toBe( true );
    }
  }, 200000 );
} );