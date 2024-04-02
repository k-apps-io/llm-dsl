import { Chat, Message } from "./Chat";
import { DSL } from "./DSL";

/** 
* An enum representing the different visibility statuses a message can hold.
* @enum {number}
*/
export enum Visibility {
  /**
   * This is the default option.
   * It represents a message that can be excluded from the context window. This exclusion
   * would be implemneted in a Window function.
   */
  OPTIONAL,
  /**
   * same as optional however the message is tagged as a system level message. This 
   * may be helpful for messages that are system level e.g. a function resopnse a user may n
   */
  SYSTEM,
  REQUIRED, // will always be included in the context window
  EXCLUDE // will be removed from the context window
}

interface WindowOptions {
  chat: DSL<any, any, any>;
  messages: Chat<any>[ "messages" ];
  tokenLimit: number;
  key?: string;
}
export type Window = ( options: WindowOptions ) => Chat<any>[ "messages" ];

interface LatestWindowOptions {
  /**
   * the maximum number of messages to include in the window starting from the end of the message
   * history
   */
  n: number;
}
/**
 * A Window strategy that will include the latest messages in the Window up to the defined amount. This does
 * not consider the token limit, keys or visibility.
 */
export const latest = ( { n }: LatestWindowOptions ): Window => {
  const reduce: Window = ( { messages }: WindowOptions ) => {
    if ( n <= 0 ) throw `max must greater than 0, received ${ n }`;
    return messages.slice( -n );
  };
  return reduce;
};

/**
 * A Window strategy that accounts for keys, visiblity and a token limit for the window
 * 
 * Messages with keys will be reduced to the latest Message of the maintaining the position of the latest Message.
 *  
 * Visibility is accounted for, all REQUIRED will be included in the window maintaining relative position. 
 * All but EXCLUDED messages are then evaluated to fill the window up to the token limit. These messages
 * are evaluted in descending order and will maintain relative positioning. 
 */
export const main: Window = ( { chat, messages, tokenLimit, key } ) => {
  const _messages: Chat<any>[ "messages" ] = messages
    // reduce to the latest keys
    .reduce( ( prev, curr, index ) => {
      if ( curr.key !== undefined ) {
        const prevIndex = prev.findIndex( ( p, i ) => p.key === curr.key && p.id !== curr.id && i < index );
        const keyMatchesTarget = key && curr.key === key;
        let targetId: string | undefined = undefined;
        if ( prevIndex > -1 ) {
          // previous message in the history shares the current key
          targetId = prev[ prevIndex ].id;
        } else if ( keyMatchesTarget ) {
          // the current message shares targeted key
          targetId = curr.id;
        }
        if ( targetId ) prev = prev.filter( p => p.prompt !== targetId );
      }
      return prev;
    }, messages as Chat<any>[ "messages" ] )
    ;
  // identify the required messages and their position
  const required = _messages
    .map( ( message, index ) => ( { index, message } ) )
    .filter( m => m.message.visibility === Visibility.REQUIRED );

  // build the window
  const _window = _messages
    // including the index for relative positioning
    .map( ( message, index ) => ( { index, message } ) )
    .filter( m => m.message.visibility !== Visibility.EXCLUDE )
    // sort REQUIRED first and then in descending order by index
    .sort( ( a, b ) => {
      if ( a.message.visibility === Visibility.REQUIRED && b.message.visibility !== Visibility.REQUIRED ) return -1;
      if ( a.message.visibility !== Visibility.REQUIRED && b.message.visibility === Visibility.REQUIRED ) return 1;
      return b.index - a.index;
    } )
    // reduce the messages to be within the tokenLimit
    .reduce( ( prev, curr ) => {
      const tokens = chat.llm.windowTokens( [ ...prev.map( ( { message } ) => message ), curr.message ] );
      if ( tokens <= tokenLimit ) prev.push( curr );
      return prev;
    }, [] as { index: number, message: Message; }[] );

  return _window
    // sort by the relative position
    .sort( ( a, b ) => a.index - b.index )
    .map( ( { message } ) => message )
    ;
};