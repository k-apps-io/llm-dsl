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