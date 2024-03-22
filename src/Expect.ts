

import JSON from "json5";
import { ExpectHandler, Locals, Metadata, Options } from "./DSL";

type JSONValue = string | number | boolean | null | { [ key: string ]: JSONValue; } | JSONValue[];

interface ExpectJSON {
  /**
   * the number of JSON code blocks to expect to find in the response. When the response matches you will find a JSON value
   * in chat.locals.$blocks as either a single JSONValue when blocks is 1 otherwise a JSONValue[]
   */
  blocks: number;
}
export const json = <O extends Options, L extends Locals & { $blocks: JSONValue; }, M extends Metadata>( options: ExpectJSON = { blocks: 1 } ): ExpectHandler<O, L, M> => {
  const { blocks } = options;
  const handler: ExpectHandler<O, L, M> = ( { response, locals, chat } ) => {
    return new Promise( ( resolve, expect ) => {
      if ( response.codeBlocks === undefined ) {
        expect( "1 or more json code blocks were expected e.g. ```json /** ... */```" );
        return;
      }
      const _blocks: {}[] = [];
      let blockNumber = 1;
      for ( const { lang, code } of response.codeBlocks! ) {
        if ( lang !== "json" ) continue;
        let json: { [ key: string ]: unknown; } = {};
        try {
          json = JSON.parse( code );
          _blocks.push( json );
          blockNumber += 1;
        } catch ( error ) {
          expect( `could not JSON.parse code block #${ blockNumber }. Error details: ${ error } - please update the code block` );
          return;
        }
      }
      if ( _blocks.length === 0 ) {
        return expect( `no JSON code blocks were found in the response` );
      } else if ( _blocks.length !== blocks ) {
        const was_or_were = blocks === 1 ? "was" : "were";
        const _was_or_were = _blocks.length === 1 ? "was" : "were";
        return expect( `${ blocks } json code block(s) ${ was_or_were } expected but ${ _blocks.length } ${ _was_or_were } in the response` );
      } else {
        chat.locals.$blocks = blocks === 1 ? _blocks[ 0 ] : _blocks;
      }
      resolve();
    } );
  };
  return handler;
};