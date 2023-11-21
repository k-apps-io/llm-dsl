import { ChatGPT, Options } from "@k-apps.io/llm-dsl-chatgpt";
import { createWriteStream } from "fs";
import { DSL } from "../src/DSL";
import { CODE_BLOCK_RULE } from "../src/Rules";
import { LocalStorage } from "../src/Storage";

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
describe( "branchForEach", () => {
  it( 'should not hit the max call stack', async () => {
    const fileStream = createWriteStream( `./__tests__/branchForEachMaxCallStack.log` );
    try {
      await chat
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
        .branchForEach( ( locals ) => {
          return locals.colors.map( ( color: string ) => ( {
            message: `write the word '${ color }' backwards as plain text`
          } as Options ) );
        } )
        .expect( ( { response } ) => {
          return new Promise<void>( ( ok, expect ) => {
            ok();
          } );
        } )
        .join()
        .stream( chunk => {
          if ( chunk.type === "chat" ) fileStream.write( `// chat: ${ chunk.id } - ${ chunk.state }` );
          if ( chunk.type === "command" ) fileStream.write( `\n${ chunk.content }\n` );
          if ( ( chunk.type === "message" && chunk.state === "streaming" ) ) fileStream.write( chunk.content );
        } );
      expect( true ).toBe( true );
      fileStream.end();
    } catch ( error ) {
      const e = String( error );
      fileStream.write( "\n" );
      fileStream.write( e );
      fileStream.end();
      expect( false ).toBe( true );
    }
  }, 60000 );
} );