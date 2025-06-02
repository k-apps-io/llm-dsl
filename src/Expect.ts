import { LLM } from "./definitions";
import { parseJSON } from "./utilities";

type JSONPrimitive = string | number | boolean | null;

type JSONValue =
  | JSONPrimitive
  | JSONObject
  | JSONArray;

export interface JSONObject {
  [ key: string ]: JSONValue;
}

export interface JSONArray extends Array<JSONValue> { }

export type JSON = JSONArray | JSONObject;

// CASE 1: Exactly 1 block
export function json<
  Options extends LLM.Model.Options = LLM.Model.Options,
  Prompts extends LLM.Model.Prompts = LLM.Model.Prompts,
  Responses extends LLM.Model.Responses = LLM.Model.Responses,
  ToolResults extends LLM.Model.ToolResults = LLM.Model.ToolResults,
  Locals extends LLM.Locals = LLM.Locals,
  Metadata extends LLM.Metadata = LLM.Metadata
>( config: { blocks?: 1; errorPrompt?: string; exact?: boolean; } ): LLM.Stage.Expect<
  Options, Prompts, Responses, ToolResults, Locals, Metadata,
  { json: JSON; }
>;

// CASE 2: More than 1 block
export function json<
  Options extends LLM.Model.Options = LLM.Model.Options,
  Prompts extends LLM.Model.Prompts = LLM.Model.Prompts,
  Responses extends LLM.Model.Responses = LLM.Model.Responses,
  ToolResults extends LLM.Model.ToolResults = LLM.Model.ToolResults,
  Locals extends LLM.Locals = LLM.Locals,
  Metadata extends LLM.Metadata = LLM.Metadata
>( config: { blocks: number; errorPrompt?: string; exact?: boolean; } ): LLM.Stage.Expect<
  Options, Prompts, Responses, ToolResults, Locals, Metadata,
  { json: JSON[]; }
>;

/**
 * this expects that a response includes json codeBlocks. Each codeBlock will be evaluated into a usuable JSON object which will be 
 * made accessible in the chat locals as $blocks.
 */

export function json<
  Options extends LLM.Model.Options = LLM.Model.Options,
  Prompts extends LLM.Model.Prompts = LLM.Model.Prompts,
  Responses extends LLM.Model.Responses = LLM.Model.Responses,
  ToolResults extends LLM.Model.ToolResults = LLM.Model.ToolResults,
  Locals extends LLM.Locals = LLM.Locals,
  Metadata extends LLM.Metadata = LLM.Metadata
>( config: { blocks?: number; errorPrompt?: string; exact?: boolean; } = { blocks: 1, exact: true } ) {
  const { blocks = 1, errorPrompt, exact = true } = config;

  const handler: LLM.Stage.Expect<Options, Prompts, Responses, ToolResults, Locals, Metadata, { json: JSON | JSON[]; }> =
    ( { response } ) => {
      return new Promise( ( resolve, expect ) => {
        if ( !response.codeBlocks ) {
          expect( errorPrompt || "1 or more json code blocks were expected..." );
          return;
        }

        const _blocks: JSON[] = [];
        let blockNumber = 1;
        for ( const { lang, code } of response.codeBlocks ) {
          if ( lang !== "json" ) continue;
          try {
            _blocks.push( parseJSON( code ) as JSON );
            blockNumber++;
          } catch ( err ) {
            resolve( {
              type: "error",
              error: `could not JSON.parse code block #${ blockNumber }: ${ err }`
            } );
            return;
          }
        }

        if ( _blocks.length === 0 ) {
          resolve( {
            type: "error",
            error: errorPrompt || "1 or more json code blocks expected"
          } );
          return;
        }

        if ( exact && _blocks.length !== blocks ) {
          resolve( {
            type: "error",
            error: `${ blocks } json block(s) expected but got ${ _blocks.length }`
          } );
          return;
        }

        const result = blocks === 1 ? _blocks[ 0 ] : _blocks;
        resolve( { json: result } );
      } );
    };

  return handler;
}
