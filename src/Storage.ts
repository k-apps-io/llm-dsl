import { randomUUID } from "crypto";
import { readFile, rm, writeFile } from "fs";
import { promisify } from "util";
import { LLM } from "./definitions";

const write = promisify( writeFile );
const read = promisify( readFile );
const del = promisify( rm );

const defaultIdGenerator = () => {
  return randomUUID();
};

interface LocalStorageOptions {
  directory: string;
}

export class LocalStorage implements LLM.Storage.Service {
  private directory: string;

  constructor( { directory }: LocalStorageOptions ) {
    this.directory = directory;
  }

  newId(): string {
    return defaultIdGenerator();
  }
  getById( id: string ): Promise<LLM.Chat> {
    return new Promise<LLM.Chat>( ( resolve, reject ) => {
      read( `${ this.directory }/${ id }.json` )
        .then( content => {
          const chat: LLM.Chat = JSON.parse( content.toString() );
          resolve( chat );
        } )
        .catch( reject );
    } );
  }
  save( chat: LLM.Chat ): Promise<void> {
    return new Promise<void>( ( resolve, reject ) => {
      write( `${ this.directory }/${ chat.id }.json`, JSON.stringify( chat, null, 2 ) )
        .then( resolve )
        .catch( reject );
    } );
  }
  getArtifact( id: string ): Promise<LLM.Artifact | undefined> {
    return new Promise<LLM.Artifact | undefined>( ( resolve, reject ) => {
      read( `${ this.directory }/artifacts/${ id }` )
        .then( content => {
          const artifact: LLM.Artifact = JSON.parse( content.toString() );
          resolve( artifact );
        } )
        .catch( error => {
          if ( error.code === 'ENOENT' ) {
            resolve( undefined ); // Artifact not found
          } else {
            reject( error );
          }
        } );
    } );
  }
  getArtifacts( ids: string[] ): Promise<LLM.Artifact[]> {
    const artifacts: LLM.Artifact[] = [];
    const promises = ids.map( async id => {
      const artifact = await this.getArtifact( id );
      if ( artifact ) {
        artifacts.push( artifact );
      }
    }
    );
    return new Promise<LLM.Artifact[]>( ( resolve, reject ) => {
      Promise.all( promises )
        .then( () => resolve( artifacts ) )
        .catch( reject );
    } );
  }
  createArtifact( artifact: Omit<LLM.Artifact, "id"> ): Promise<LLM.Artifact> {
    return new Promise<LLM.Artifact>( ( resolve, reject ) => {
      const id = this.newId();
      write( `${ this.directory }/artifacts/${ id }`, Buffer.isBuffer( artifact.content ) ? artifact.content.toString() : artifact.content )
        .then( () => resolve( { id, ...artifact } ) )
        .catch( reject );
    } );
  }
  createArtifacts( artifacts: Omit<LLM.Artifact, "id">[] ): Promise<LLM.Artifact[]> {
    const createdArtifacts: LLM.Artifact[] = [];
    const promises = artifacts.map( async artifact => {
      const createdArtifact = await this.createArtifact( artifact );
      createdArtifacts.push( createdArtifact );
    } );
    return new Promise<LLM.Artifact[]>( ( resolve, reject ) => {
      Promise.all( promises )
        .then( () => resolve( createdArtifacts ) )
        .catch( reject );
    } );
  }
  updateArtifact( artifact: LLM.Artifact ): Promise<void> {
    return new Promise<void>( ( resolve, reject ) => {
      write( `${ this.directory }/artifacts/${ artifact.id }`, Buffer.isBuffer( artifact.content ) ? artifact.content.toString() : artifact.content )
        .then( resolve )
        .catch( reject );
    } );
  }
  updateArtifacts( artifacts: LLM.Artifact[] ): Promise<void> {
    return new Promise<void>( ( resolve, reject ) => {
      const promises = artifacts.map( artifact => this.updateArtifact( artifact ) );
      Promise.all( promises )
        .then( () => resolve() )
        .catch( reject );
    } );
  }
  deleteArtifact( id: string ): Promise<void> {
    return new Promise<void>( ( resolve, reject ) => {
      del( `${ this.directory }/artifacts/${ id }` )
        .then( () => resolve() )
        .catch( error => {
          if ( error.code === 'ENOENT' ) {
            resolve(); // Artifact not found, resolve successfully
          } else {
            reject( error );
          }
        } );
    } );
  }
  deleteArtifacts( ids: string[] ): Promise<void> {
    return new Promise<void>( ( resolve, reject ) => {
      const promises = ids.map( id => this.deleteArtifact( id ) );
      Promise.all( promises )
        .then( () => resolve() )
        .catch( reject );
    } );
  }
}
export class NoStorage implements LLM.Storage.Service {
  getArtifact( id: string ): Promise<LLM.Artifact | undefined> {
    throw new Error( 'Not Implemented - Choose an alternative storage engine' );
  }
  getArtifacts( ids: string[] ): Promise<LLM.Artifact[]> {
    throw new Error( 'Not Implemented - Choose an alternative storage engine' );
  }
  createArtifact( artifact: Omit<LLM.Artifact, "id"> ): Promise<LLM.Artifact> {
    throw new Error( 'Not Implemented - Choose an alternative storage engine' );
  }
  createArtifacts( artifacts: Omit<LLM.Artifact, "id">[] ): Promise<LLM.Artifact[]> {
    throw new Error( 'Not Implemented - Choose an alternative storage engine' );
  }
  updateArtifact( artifact: LLM.Artifact ): Promise<void> {
    throw new Error( 'Not Implemented - Choose an alternative storage engine' );
  }
  updateArtifacts( artifacts: LLM.Artifact[] ): Promise<void> {
    throw new Error( 'Not Implemented - Choose an alternative storage engine' );
  }
  deleteArtifact( id: string ): Promise<void> {
    throw new Error( 'Not Implemented - Choose an alternative storage engine' );
  }
  deleteArtifacts( ids: string[] ): Promise<void> {
    throw new Error( 'Not Implemented - Choose an alternative storage engine' );
  }
  newId = defaultIdGenerator;
  getById( id: string ): Promise<LLM.Chat> {
    throw new Error( 'Not Implemented - Choose an alternative storage engine' );
  }
  save( chat: LLM.Chat ): Promise<void> {
    return new Promise<void>( ( resolve, reject ) => resolve() );
  }
}