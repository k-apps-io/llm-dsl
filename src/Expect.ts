

import JSON from "json5";
import { Message } from "./Chat";
import { DSL, Locals, Metadata, Options } from "./DSL";

export interface ResponseStageArgs<O extends Options, L extends Locals, M extends Metadata> {
  response: Message,
  locals: L;
  chat: DSL<O, L, M>;
}
export type ResponseStage<O extends Options, L extends Locals, M extends Metadata> = ( args: ResponseStageArgs<O, L, M> ) => Promise<void>;

type JSONValue = string | number | boolean | null | { [ key: string ]: JSONValue; } | JSONValue[];

interface ExpectJSON {
  /**
   * the number of JSON code blocks to expect in the response. When the response matches you will find a JSON value
   * in chat.locals.$blocks as either a single JSONValue when blocks is 1 otherwise a JSONValue[].
   * 
   * if not defined the default value is 1
   */
  blocks?: number;
  /**
   * an optional prompt to send to the LLM if a json code block is missing from the response or the code blocks provided do not
   * include any json code blocks.
   */
  errorPrompt?: string;
  /**
   * how to handle when the number of json blocks in the response does not match the number of blocks expected. When true, a prompt
   * will be sent to the LLM requesting the exact number of json code blocks.
   * 
   * the default is true
   */
  exact?: boolean;
}
/**
 * this expects that a response includes json codeBlocks. Each codeBlock will be evaluated into a usuable JSON object which will be 
 * made accessible in the chat locals as $blocks.
 */
export const json = <O extends Options, L extends Locals & { $blocks: JSONValue; }, M extends Metadata>( { blocks, errorPrompt, exact }: ExpectJSON = { blocks: 1, exact: true } ): ResponseStage<O, L, M> => {
  const handler: ResponseStage<O, L, M> = ( { response, chat } ) => {
    return new Promise( ( resolve, expect ) => {
      if ( response.codeBlocks === undefined ) {
        expect( errorPrompt || "1 or more json code blocks were expected in the response e.g. ```json /** ... */```" );
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
        return expect( errorPrompt || "1 or more json code blocks are expected in the response e.g. ```json /** ... */```" );
      } else if ( _blocks.length !== blocks && exact ) {
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