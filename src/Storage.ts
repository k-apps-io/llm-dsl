import { randomUUID } from "crypto";
import { readFile, writeFile } from "fs";
import { promisify } from "util";
import { Chat } from "./Chat";
import { DSL } from "./DSL";

const write = promisify( writeFile );
const read = promisify( readFile );

const defaultIdGenerator = () => {
  return randomUUID();
};

export interface ChatStorage extends Object {
  newId: () => string;
  getById: ( id: string ) => Chat<any> | Promise<Chat<any>>;
  save: ( chat: DSL<any, any, any> ) => Promise<void>;
}

interface LocalStorageOptions {
  directory: string;
}
export const LocalStorage = ( { directory }: LocalStorageOptions ): ChatStorage => {
  const handler: ChatStorage = {
    newId: defaultIdGenerator,
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
    save: ( chat: DSL<any, any, any> ): Promise<void> => {
      return new Promise<void>( ( resolve, reject ) => {
        write( `${ directory }/${ chat.data.id }.json`, JSON.stringify( chat.data, null, 2 ) )
          .then( resolve )
          .catch( reject );
      } );
    }
  };
  return handler;
};

export const NoStorage: ChatStorage = {
  newId: defaultIdGenerator,
  getById: function ( id: string ): Promise<Chat<any>> {
    throw 'Not Implemented - Choose an alternative storage engine';
  },
  save: function ( chat: DSL<any, any, any> ): Promise<void> {
    return new Promise<void>( ( resolve, reject ) => resolve() );
  }
};

export default ChatStorage;