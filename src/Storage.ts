import { readFile, writeFile } from "fs";
import { promisify } from "util";
import { Chat } from "./Chat";

const write = promisify( writeFile );
const read = promisify( readFile );

export interface ChatStorage extends Object {
  getById: ( id: string ) => Chat<any> | Promise<Chat<any>>;
  save: ( chat: Chat<any> ) => Promise<void>;
}

interface LocalStorageOptions {
  directory: string;
}
export const LocalStorage = ( { directory }: LocalStorageOptions ): ChatStorage => {
  const handler: ChatStorage = {
    getById: ( id: string ): Promise<Chat<any>> => {
      return new Promise<Chat<any>>( ( resolve, reject ) => {
        read( `${ directory }/${ id }.json` )
          .then( content => {
            const chat: Chat<any> = JSON.parse( content.toString() );
            resolve( chat );
          } )
          .catch( reject );
      } );
    },
    save: ( chat: Chat<any> ): Promise<void> => {
      return new Promise<void>( ( resolve, reject ) => {
        write( `${ directory }/${ chat.id }.json`, JSON.stringify( chat, null, 4 ) )
          .then( resolve )
          .catch( reject );
      } );
    }
  };
  return handler;
};

export const NoStorage: ChatStorage = {
  getById: function ( id: string ): Promise<Chat<any>> {
    throw 'Not Implemented - Choose an alternative storage engine';
  },
  save: function ( chat: Chat<any> ): Promise<void> {
    return new Promise<void>( ( resolve, reject ) => resolve() );
  }
};

export default ChatStorage;