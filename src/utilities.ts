import { Grammars, IToken } from "ebnf";
import JSON from "json5";
import { jsonrepair } from "jsonrepair";
import { LLM } from "./definitions";

type OK = {
  loop: false;
};
type NotOK = {
  loop: true;
  pattern: string[];
  count: number;
  occurrences: number[];
};
type Result = OK | NotOK;

/**
 * Detects a loop in an array of string values.
 * 
 * @param arr An array of string values to search for a loop.
 * @param window The size of the window to consider when detecting a pattern. Default is 2.
 * @param max The maximum allowed occurrences of a pattern before considering it as a loop. Default is 1.
 * @returns An object of type {@link Result} containing information about the result of the loop detection.
 */
export const detectLoop = ( arr: string[], window: number = 2, max: number = 1 ): Result => {
  const data = arr
    .map( ( _, index, $array ) => index <= arr.length - window + 1 ? $array.slice( index, index + window ).join( "" ) : null )
    .filter( v => v !== null )
    .reduce( ( prev, curr, pos ) => {
      const index = prev.findIndex( ( { key } ) => key === curr! );
      if ( index === -1 ) {
        prev.push( { key: curr!, count: 1, occurrences: [ pos ] } );
      } else {
        prev[ index ].count += 1;
        prev[ index ].occurrences.push( pos );
      }
      return prev;
    }, [] as { key: string, count: number; occurrences: number[]; }[] );
  const index = data.findIndex( ( { count } ) => count > max );
  if ( index === -1 ) {
    return { loop: false };
  } else {
    const item = data[ index ];
    return { loop: true, pattern: arr.slice( index, index + window ), count: item.count, occurrences: item.occurrences };
  }
};

export class LoopError extends Error {

  pattern: string[];
  count: number;
  occurrences: number[];

  constructor( { loop, pattern, count, occurrences }: NotOK ) {
    super( "a loop was detected" );
    this.pattern = pattern;
    this.count = count;
    this.occurrences = occurrences;
    // Ensure stack trace is captured
    if ( Error.captureStackTrace ) {
      Error.captureStackTrace( this, LoopError );
    }
  }

  toString(): string {
    return `${ this.name }: ${ this.message } ${ JSON.stringify( { count: this.count, pattern: this.pattern, occurrences: this.occurrences } ) }`;
  }
}

const grammar = `
message     ::= TEXT* WS* ( block ) WS* TEXT* WS* message*  /* Represents a message with zero or more blocks */
block       ::= "\`\`\`" lang WS* code WS* "\`\`\`"         /* Represents a code block with language specification */
lang        ::= [\\w:\\-_.@]+                               /* Matches word characters, hyphens, colons, underscores, and periods */
code        ::= TEXT*                                       /* Represents the content of a code block */
WS          ::= [#x20#x09#x0A#x0D]+                         /* Space | Tab | \\n | \\r - Matches one or more whitespace characters */
TEXT        ::= [^\`] | "\`" [^\`]                          /* Any character except a backtick or a backtick not followed by another backtick */
`;

const parser = new Grammars.W3C.Parser( grammar );

const collectCodeBlocks = ( token: IToken ): LLM.CodeBlock[] => {
  return token.children.flatMap( child => {
    if ( child.type === "message" ) return collectCodeBlocks( child );
    return child.children.reduce( ( prev, curr ) => {
      prev[ curr.type ] = curr.text.trim();
      return prev;
    }, {} as LLM.CodeBlock & { [ key: string ]: any; } );
  } );
};

export const extractCodeBlocks = ( text: string ): LLM.CodeBlock[] => {
  const token = parser.getAST( text );
  if ( token === null ) return [];
  const blocks = collectCodeBlocks( token );
  return blocks;
};

export const toCodeBlock = ( lang: string, value: any ) => {
  if ( lang.toLowerCase() === "json" && typeof value === "object" ) value = JSON.stringify( value, null, 2 );
  return `\`\`\`${ lang }\n${ value }\n\`\`\`\n`;
};

/**
 * cleans text that is assumed to be json. This text will also be repaired to be JSON if possible
 * @param text a JSON string
 * @returns a JSON string
 */
export const cleanJSON = ( text: string ): string => {
  // convert fractions to the decimal version e.g. // values like `: 1/2` -> : 0.5
  text = text.replaceAll( /:\s*?(\d+)\/(\d+)/g, ( _, numerator, denominator ) => {
    // Convert fraction to decimal
    return `: ${ parseFloat( numerator ) / parseFloat( denominator ) }`;
  } );
  text = jsonrepair( text );
  return text;
};

export const parseJSON = ( text: string ): { [ key: string ]: unknown; } => {
  try {
    return JSON.parse( cleanJSON( text ) );
  } catch ( e ) {
    throw new Error( `Failed to parse JSON: ${ e instanceof Error ? e.message : String( e ) }` );
  }
};