import { v4 as uuid } from "uuid";
import { CODE_BLOCK_RULE } from "../../src/Rules";
import { ChatGPT } from "../ChatGPT";


const chat = new ChatGPT( { model: "gpt-4o-mini" } );
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
    func: ( { tool_call_id } ) => new Promise( ( resolve, reject ) => resolve( {
      role: "tool",
      content: "success",
      tool_call_id: tool_call_id!
    } ) )
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