import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals } from "../../src/DSL";
import { CODE_BLOCK_RULE } from "../../src/Rules";
import { localFileStorage, localFileStream } from "../../src/Stream";

interface ChatLocals extends Locals {
  colors: string[];
}
const chat = new DSL<Options, ChatLocals, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } ),
  settings: {
    maxCallStack: 3
  }
} );
describe( "branchForEach", () => {
  it( 'should not hit the max call stack', async () => {
    try {
      const $chat = await chat
        .clone()
        .rule( CODE_BLOCK_RULE )
        .prompt( {
          message: `generate a list of 10 colors as \`\`\`json {"colors": [] }\`\`\``
        } )
        .expect( ( { response, locals } ) => {
          return new Promise<void>( ( ok, expect ) => {
            const blocks = response.codeBlocks || [];
            if ( blocks.length !== 1 || blocks[ 0 ].lang !== "json" ) {
              expect( `a JSON code block of 10 colors as \`\`\`json {"colors": [] }\`\`\`` );
              return;
            }
            const block = blocks[ 0 ];
            const json = JSON.parse( block.code ).colors;
            locals.colors = json;
            ok();
          } );
        } )
        .branchForEach( ( { locals } ) => {
          return locals.colors.map( color => ( {
            message: `write the word '${ color }' backwards as plain text`
          } as Options ) );
        } )
        .expect( ( { response } ) => {
          return new Promise<void>( ( ok, expect ) => {
            ok();
          } );
        } )
        .join()
        .stream( localFileStream( { directory: __dirname, filename: 'branchForEach' } ) );
      localFileStorage( { directory: __dirname, chat: $chat, filename: 'branchForEach' } );
      expect( true ).toBe( true );
    } catch ( error ) {
      expect( false ).toBe( true );
    }
  }, 200000 );
} );