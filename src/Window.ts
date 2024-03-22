// https://stackoverflow.com/questions/77168202/calculating-total-tokens-for-api-request-to-chatgpt-including-functions

import { Chat } from "./Chat";

export interface WindowOptions {
  messages: Chat<any>[ "messages" ];
  tokenLimit: number;
}
export type Window = ( options: WindowOptions ) => Chat<any>[ "messages" ];

export interface LatestWindowOptions {
  max: number; // New property
}
export const latest = ( { max }: LatestWindowOptions ): Window => {
  const reduce: Window = ( { messages }: WindowOptions ) => {
    if ( max <= 0 ) throw `max must greater than 0, received ${ max }`;
    return messages.slice( -max );
  };
  return reduce;
};

export const key: Window = ( { messages, tokenLimit } ) => {
  let tokenCount = 0;
  return messages
    // reduce to the latest keys
    .reduce( ( prev, curr ) => {
      if ( curr.key !== undefined ) {
        const prevIndex = prev.map( p => p.key ).indexOf( curr.key );
        // remove the preivous key
        if ( prevIndex > -1 ) prev.splice( prevIndex );
      }
      // add the message
      prev.push( curr );
      return prev;
    }, [] as Chat<any>[ "messages" ] )
    .reduce( ( prev, curr ) => {
      if ( tokenCount + curr.size < tokenLimit ) {
        prev.push( curr );
        tokenLimit += curr.size;
      }
      return prev;
    }, [] as Chat<any>[ "messages" ] )
    ;
};