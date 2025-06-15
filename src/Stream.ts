import { createWriteStream, writeFileSync, WriteStream } from "fs";
import { Agent } from "./Agent";
import { LLM } from "./definitions";

interface Options {
  debug?: true; // when defined, we will emit everything
}

interface MainOptions extends Options {
  pipe: ( text: string ) => void;
}

const main = ( { pipe, debug }: MainOptions ): LLM.Stream.Handler<any, any, any, any, any> => {
  let id: string | undefined = undefined;
  let lastChunkType: string | undefined = undefined;

  const handler: LLM.Stream.Handler<any, any, any, any, any> = ( chunk ) => {

    if ( lastChunkType !== chunk.type ) {
      pipe( `\n[${ chunk.type.toUpperCase() }] ` );
      lastChunkType = chunk.type;
    }

    switch ( chunk.type ) {
      case "chat":
      case "sidebar":
        pipe( `ID: ${ chunk.id }, State: ${ chunk.state }\n` );
        break;

      case "stage":
        pipe( `${ chunk.stage } (${ chunk.state })\n` );
        break;

      case "stream":
        pipe( chunk.text );
        break;

      case "message":
        switch ( chunk.message.type ) {
          case "prompt":
            pipe( ` [PROMPT] ${ JSON.stringify( chunk.message.prompt, null, 2 ) }\n` );
            break;

          case "response":
            // this content is already received by the stream chunk
            break;

          case "function":
            // this content is already received by the stream chunk
            break;

          case "tool":
            pipe( ` [TOOL RESULT] ${ JSON.stringify( chunk.message.result, null, 2 ) }\n` );
            break;

          case "instruction":
            pipe( ` [INSTRUCTION] ${ chunk.message.instruction }\n` );
            break;

          case "error":
            pipe( ` [ERROR] ${ String( chunk.message.error ) }\n` );
            break;

          case "rule":
            pipe( ` [RULE] ${ chunk.message.rule }\n` );
            break;

          case "context":
            pipe( ` [CONTEXT] ${ chunk.message.context }\n` );
            break;

          default:
            pipe( ` [UNKNOWN] ${ JSON.stringify( chunk.message, null, 2 ) }\n` );
            break;
        }
        break;

      default:
        pipe( `[UNKNOWN] ${ JSON.stringify( chunk, null, 2 ) }\n` );
        break;
    }

    if ( id === undefined || chunk.id !== id ) {
      pipe( "\n" );
      id = chunk.id;
    }
  };

  return handler;
};

interface StdoutOptions extends Options { }

export const stdout = ( options?: StdoutOptions ): LLM.Stream.Handler<any, any, any, any, any> => {
  return main( { ...options, pipe: process.stdout.write } );
};

interface FileSystemOptions extends Options {
  /**
   * the directory to write the file to, the directory will not be created if it does not already exist.
   */
  directory: string;
  /**
   * the name of the file, when not defined the chat id will be used
   */
  filename: string;
}

interface LocalFileStream extends FileSystemOptions {
  /**
   * whether to appended the chat stream to the target file. Default behavior is to append, when false the file will be overwriten
   */
  append?: boolean;
  /**
   * whether to include a timestamp in the stage. Default behavior is to exclude a timestamp 
   */
  timestamps?: boolean;
}
/**
 * a stream handler that will write the stream the chat pipeline to a local file
 */
export const localFileStream = ( { directory, filename, append, timestamps }: LocalFileStream ): LLM.Stream.Handler<any, any, any, any, any> => {
  let id: string;
  let stage: string;
  let fileStream: WriteStream;
  const flags = append === undefined || append ? "a" : undefined;
  timestamps = timestamps ? true : false;
  return main( {
    pipe: ( text ) => {
      if ( !fileStream ) {
        filename = `${ directory }/${ filename }.log`;
        fileStream = createWriteStream( filename, { flags, encoding: "utf8" } );
      }
      fileStream.write( text );
    }
  } );
};

interface WriteOptions extends FileSystemOptions {
  chat: Agent<any, any, any, any, any, any>;
  /**
   * Adds indentation, white space, and line break characters to the return-value JSON text to make it easier to read.
   * 
   * the default value is 2.
   */
  spaces?: string | number;
  /**
   * An array of strings and numbers that acts as an approved list for selecting the object properties that will be stringified.
   */
  replacer?: ( number | string )[];
}
/**
 * writes the chat to a local file using JSON.stringify. The file will be overwritten
 */
export const localFileStorage = ( { directory, filename, chat, spaces, replacer }: WriteOptions ) => {
  filename = `${ directory }/${ filename ? filename : chat.data.id }.json`;
  writeFileSync( filename, JSON.stringify( chat.data, replacer || null, spaces || 2 ) );
};