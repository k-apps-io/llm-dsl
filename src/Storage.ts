import { readFile, writeFile } from "fs";
import { promisify } from "util";
import { Chat } from "./Chat";

const write = promisify( writeFile );
const read = promisify( readFile );

export interface ChatStorage extends Object {
  getById: ( id: string ) => Promise<Chat>;
  save: ( chat: Chat ) => Promise<void>;
}

export const LocalStorage: ChatStorage = {
  getById: ( id: string ): Promise<Chat> => {
    return new Promise<Chat>( ( resolve, reject ) => {
      read( `${ process.env.CHATS_DIR }/${ id }.json` )
        .then( content => {
          const chat: Chat = JSON.parse( content.toString() );
          resolve( chat );
        } )
        .catch( reject );
    } );
  },
  save: ( chat: Chat ): Promise<void> => {
    return new Promise<void>( ( resolve, reject ) => {
      write( `${ process.env.CHATS_DIR }/${ chat.id }.json`, JSON.stringify( chat, null, 4 ) )
        .then( resolve )
        .catch( reject );
    } );
  }
};

export const NoStorage: ChatStorage = {
  getById: function ( id: string ): Promise<Chat> {
    throw 'Not Implemented - Choose an alternative storage engine';
  },
  save: function ( chat: Chat ): Promise<void> {
    return new Promise<void>( ( resolve, reject ) => resolve() );
  }
};

export default ChatStorage;