import { ChatGPT, Options } from "@k-apps.io/llm-dsl-chatgpt";
import { createWriteStream } from "fs";
import { DSL } from "../src/DSL";
import { CODE_BLOCK_RULE } from "../src/Rules";
import { LocalStorage } from "../src/Storage";


describe( ".expect", () => {
  it( 'expectJSON', async () => {
    const chat = new DSL<Options, any>( {
      llm: new ChatGPT( {}, "gpt-3.5-turbo" ),
      storage: LocalStorage,
      options: {
        model: "gpt-3.5-turbo"
      },
      metadata: {},
      locals: {
        attempts: 0
      }
    } );
    const fileStream = createWriteStream( `./__tests__/expectJSON.log` );
    await chat
      .rule( CODE_BLOCK_RULE )
      .prompt( {
        message: `
          generate a JSON Array of 2 city names
        `
      } )
      .expect( ( { response, locals } ) => new Promise<void>( ( resolve, reject ) => {
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
              locals.attempts += 1;
              if ( locals.attempts <= 1 ) {
                reject( "I need 3 more cities" );
              } else {
                resolve();
              }
            } catch ( error ) {
              reject( `\`JSON.parse\` threw the exception ${ error }` );
            }
          }
        }
      } ) )
      .stream( chunk => {
        if ( chunk.type === "chat" ) fileStream.write( `// chat: ${ chunk.id } - ${ chunk.state }` );
        if ( chunk.type === "command" ) fileStream.write( `\n${ chunk.content }\n` );
        if ( ( chunk.type === "message" && chunk.state === "streaming" ) ) fileStream.write( chunk.content );
      } );
    expect( true ).toBe( true );
    fileStream.end();
  }, 100000 );

  it( 'expectCallstackExceeded', async () => {
    let fileStream: any = null;
    try {
      const chat = new DSL<Options, any>( {
        llm: new ChatGPT( {}, "gpt-3.5-turbo" ),
        storage: LocalStorage,
        options: {
          model: "gpt-3.5-turbo"
        },
        metadata: {},
        settings: {
          maxCallStack: 3
        }
      } );
      fileStream = createWriteStream( `./__tests__/expectCallstackExceeded.log` );
      await chat
        .rule( CODE_BLOCK_RULE )
        .prompt( {
          message: "generate a JSON Array of city names"
        } )
        .expect( response => new Promise<void>( ( resolve, reject ) => {
          reject( "I need different cities" );
        } ) )
        .stream( chunk => {
          if ( chunk.type === "chat" ) fileStream.write( `// chat: ${ chunk.id } - ${ chunk.state }` );
          if ( chunk.type === "command" ) fileStream.write( `\n${ chunk.content }\n` );
          if ( ( chunk.type === "message" && chunk.state === "streaming" ) ) fileStream.write( chunk.content );
        } );
      // it shouldn't succeed
      fileStream.end();
      expect( false ).toBe( true );
    } catch ( error ) {
      const e = String( error );
      fileStream.write( "\n" );
      fileStream.write( e );
      fileStream.end();
      expect( e ).toContain( "Max Call Stack Exceeded" );
    }
  }, 200000 );
} );