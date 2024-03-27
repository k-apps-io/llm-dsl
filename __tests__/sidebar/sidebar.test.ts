import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { v4 as uuid } from "uuid";
import { DSL, Locals } from "../../src/DSL";
import { CODE_BLOCK_RULE } from "../../src/Rules";

interface L extends Locals {
  key: string;
}

const chat = new DSL<Options, L, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );
chat
  .setUser( "1234" )
  .rule( CODE_BLOCK_RULE )
  .function( {
    name: "test",
    description: "testing",
    parameters: {
      type: "object",
      properties: {}
    },
    func: () => new Promise<Options>( ( resolve, reject ) => resolve( { message: "success" } ) )
  } )
  .setLocals( {
    key: uuid()
  } );

describe( ".sidebar()", () => {
  it( "no args", async () => {
    const sidebar = chat.sidebar();
    expect( sidebar.locals ).toMatchObject( {} );
    expect( sidebar.functions ).toMatchObject( {} );
    expect( sidebar.rules ).toMatchObject( [] );
  } );
  it( "locals", async () => {
    const sidebar = chat.sidebar( { locals: true } );
    expect( sidebar.locals ).toMatchObject( sidebar.locals );
    expect( sidebar.functions ).toMatchObject( {} );
    expect( sidebar.rules ).toMatchObject( [] );
  } );
  it( "functions", async () => {
    const sidebar = chat.sidebar( { functions: true } );
    expect( sidebar.locals ).toMatchObject( {} );
    expect( sidebar.functions ).toMatchObject( chat.functions );
    expect( sidebar.rules ).toMatchObject( [] );
  } );
  it( "rules", async () => {
    const sidebar = chat.sidebar( { rules: true } );
    expect( sidebar.locals ).toMatchObject( {} );
    expect( sidebar.functions ).toMatchObject( {} );
    expect( sidebar.rules ).toMatchObject( chat.rules );
    expect( sidebar.pipeline ).toMatchObject( chat.pipeline.filter( p => p.stage === "rule" ) );
    for ( let i = 0; i < sidebar.pipeline.length; i++ ) {
      expect( sidebar.pipeline[ i ] ).not.toBe( chat.pipeline[ i ] );
    }
  } );
} );