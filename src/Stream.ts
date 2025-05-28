import { createWriteStream, writeFileSync, WriteStream } from "fs";
import { Message } from "./Chat";
import { DSL } from "./DSL";


/**
 * this chunk indicates a new chat or sidebar
 */
interface ChatChunk {
  id: string;
  type: "chat" | "sidebar";
  state: "open" | "closed";
  metadata?: { [ key: string ]: unknown; };
}

/**
 * this chunk represents a response stream which contain parts of the response
 */
interface ResponseChunk extends Omit<Message, "size" | "codeBlocks" | "user" | "createdAt" | "window"> {
  type: "response";
  chat: string;
}

/**
 * this chunk will represent a completed message in the chat and emitted when a Message is generated e.g. prompt, push, response, etc.
 */
interface MessageChunk extends Message {
  id: string;
  type: "message";
  chat: string;
}
/**
 * this chunk is emitted when a new stage in the pipeline is executed. The content will be the stage name which closely aligns
 * with the pipeline function name.
 */
interface StageChunk {
  id: string;
  type: "stage";
  content: string;
}

/**
 * this chunk is emitted when an error occurred in the pipeline that was unhandled. The error can be received here as well
 * as caught in a catch block or callback.
 */
interface ErrorChunk {
  id: string;
  type: "error";
  error: unknown;
}

export type Chunk = ChatChunk | ResponseChunk | MessageChunk | StageChunk | ErrorChunk;

export type StreamHandler = ( chunk: Chunk ) => void;

export const stdout = (): StreamHandler => {
  let id: string | undefined = undefined;
  const handler: StreamHandler = ( chunk ) => {
    // skip these
    if ( chunk.type === "chat" || chunk.type === "sidebar" || chunk.type === "stage" ) return;

    // write a message if it's not associated with a response
    if ( ( chunk.type === "message" && chunk.id !== id ) ) process.stdout.write( chunk.content );
    if ( ( chunk.type === "response" ) ) process.stdout.write( JSON.stringify( chunk.content, null, 2 ) );
    if ( chunk.type === "error" ) process.stderr.write( String( chunk.error ) );

    if ( id === undefined || chunk.id !== id ) {
      process.stdout.write( "\n" );
      id = chunk.id;
    }
  };
  return handler;
};

interface FileSystemOptions {
  /**
   * the directory to write the file to, the directory will not be created if it does not already exist.
   */
  directory: string;
  /**
   * the name of the file, when not defined the chat id will be used
   */
  filename?: string;
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
export const localFileStream = ( { directory, filename, append, timestamps }: LocalFileStream ): StreamHandler => {
  let id: string;
  let stage: string;
  let fileStream: WriteStream;
  const flags = append === undefined || append ? "a" : undefined;
  timestamps = timestamps ? true : false;
  const handler: StreamHandler = ( chunk ) => {
    if ( chunk.type === "chat" && chunk.state === "open" ) {
      fileStream = createWriteStream( `${ directory }/${ filename || chunk.id }.log`, { encoding: "utf-8", flags: flags } );
    }
    if ( chunk.type === "chat" || chunk.type === "sidebar" ) {
      if ( stage ) fileStream.write( `\n// ${ stage }: end` );
      fileStream?.write( `\n// ${ chunk.type } - ${ chunk.id }: ${ chunk.state }` );
      if ( chunk.state === "closed" ) return fileStream.end();
    }
    if ( id === undefined || chunk.id !== id ) {
      fileStream.write( "\n" );
      id = chunk.id;
    }
    if ( chunk.type === "stage" ) {
      if ( stage ) fileStream.write( `\n// ${ stage }: end` );
      stage = chunk.content;
      let line = `\n// ${ stage }: begin`;
      if ( timestamps ) line += ` ${ new Date() }`;
      fileStream.write( line );
    }
    if ( ( chunk.type === "message" ) ) {
      const content = typeof chunk.content === "string" ? chunk.content : JSON.stringify( chunk.content, null, 2 );
      fileStream.write( content );
    }
    if ( chunk.type === "error" ) fileStream.write( String( chunk.error ) );
  };
  return handler;
};

interface WriteOptions extends FileSystemOptions {
  chat: DSL<any, any, any>;
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