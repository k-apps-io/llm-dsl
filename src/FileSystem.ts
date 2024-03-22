import { createWriteStream, writeFileSync } from "fs";
import { DSL, StreamHandler } from "./DSL";

interface FileSystemOptions {
  directory: string;
  filename: string;
}

export const stream = ( { directory, filename }: FileSystemOptions ): StreamHandler => {
  const fileStream = createWriteStream( `${ directory }/${ filename }.log`, { encoding: "utf-8" } );
  const handler: StreamHandler = ( chunk ) => {
    if ( chunk.type === "chat" || chunk.type === "sidebar" ) {
      fileStream?.write( `// chat: ${ chunk.id } - ${ chunk.state }\n` );
      if ( chunk.state === "closed" ) fileStream.end();
    }
    if ( chunk.type === "command" ) fileStream.write( `${ chunk.content }\n` );
    if ( ( chunk.type === "message" && chunk.state === "streaming" ) ) fileStream.write( chunk.content );
    if ( ( chunk.type === "message" && chunk.state === "final" ) ) fileStream.write( `\n` );
    if ( chunk.type === "error" ) fileStream.write( chunk.error );
  };
  return handler;
};

interface WriteOptions extends FileSystemOptions {
  chat: DSL<any, any, any>;
}
export const write = ( { directory, chat, filename }: WriteOptions ) => {
  filename = `${ directory }/${ filename ? filename : chat.data.id }.json`;
  writeFileSync( filename, JSON.stringify( chat.data, null, 2 ) );
};
