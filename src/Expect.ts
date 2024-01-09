

import JSON from "json5";
import { Message } from "./Chat";
import { DSL, Locals, Options } from "./DSL";
type Expect<O extends Options, L extends Locals> = (
  args: { response: Message, locals: L, chat: DSL<O, L>; }
) => Promise<{ response: Message, locals: L, chat: DSL<O, L>; blocks: { [ key: string ]: unknown; }[]; }>;

export const json: Expect<any, any> = ( { response, locals, chat } ) => {
  return new Promise( ( next, expect ) => {
    if ( response.codeBlocks === undefined ) {
      expect( "1 or more json code blocks were expected e.g. ```json /** ... */```" );
      return;
    }
    const blocks: {}[] = [];
    let blockNumber = 1;
    for ( const { lang, code } of response.codeBlocks! ) {
      if ( lang !== "json" ) continue;
      let json: { [ key: string ]: unknown; } = {};
      try {
        json = JSON.parse( code );
        blocks.push( json );
        blockNumber += 1;
      } catch ( error ) {
        expect( `could not JSON.parse code block #${ blockNumber }. Error details: ${ error } - please update the code block` );
        return;
      }
    }
    if ( blocks.length === 0 ) {
      expect( `no JSON code blocks were found in the response` );
      return;
    }
    next( { response, locals, chat, blocks } );
  } );
};