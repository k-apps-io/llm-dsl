import { WriteStream, createWriteStream, existsSync, mkdirSync } from "fs";
import { StreamHandler } from "./DSL";

interface FileSystemOptions {
  directory: string;
}

export const stream = ( { directory }: FileSystemOptions ): StreamHandler => {
  let fileStreams: { [ key: string ]: WriteStream; } = {};
  let activeStream: WriteStream | undefined = undefined;
  const handler: StreamHandler = ( chunk ) => {
    if ( chunk.type === "chat" || chunk.type === "sidebar" ) {
      if ( fileStreams[ chunk.id ] === undefined ) {
        if ( !existsSync( directory ) ) mkdirSync( directory );
        activeStream = createWriteStream( `${ directory }/${ chunk.id }.log` );
        fileStreams[ chunk.id ] = activeStream;
      } else {
        activeStream = fileStreams[ chunk.id ];
      }
    }
    if ( chunk.type === "chat" || chunk.type === "sidebar" ) {
      activeStream?.write( `// chat: ${ chunk.id } - ${ chunk.state }` );
      if ( chunk.state === "closed" ) activeStream?.end();
      delete fileStreams[ chunk.id ];
    }
    if ( chunk.type === "command" ) activeStream?.write( `\n${ chunk.content }\n` );
    if ( ( chunk.type === "message" && chunk.state === "streaming" ) ) activeStream?.write( chunk.content );
    if ( chunk.type === "error" ) activeStream?.write( chunk.error );
  };
  return handler;
};
