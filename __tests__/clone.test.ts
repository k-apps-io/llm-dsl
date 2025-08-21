import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL } from "../src/DSL";

const chat = new DSL<Options, any, undefined>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );
describe( ".clone()", () => {
  it( "chat !== clone", async () => {
    const $clone = chat.clone();
    expect( Object.is( $clone, chat ) ).toBe( false );
  } );

  it( "clone is instance of DSL", () => {
    const $clone = chat.clone();
    expect( $clone ).toBeInstanceOf( DSL );
  } );

  it( "clone has different id", () => {
    const $clone = chat.clone();
    expect( $clone.data.id ).not.toBe( chat.data.id );
  } );

  it( "clone has separate messages array", () => {
    chat.data.messages.push( {
      id: "msg1",
      key: "msg1",
      role: "user",
      content: "hi",
      size: 2,
      visibility: 0,
      createdAt: new Date(),
      prompt: "msg1"
    } );
    const $clone = chat.clone();
    expect( $clone.data.messages ).not.toBe( chat.data.messages );
    expect( $clone.data.messages.length ).toBe( chat.data.messages.length );
  } );

  it( "clone preserves rules and type", () => {
    chat.rules.push( "rule1" );
    chat.type = "sidebar";
    const $clone = chat.clone();
    expect( $clone.rules ).toEqual( chat.rules );
    expect( $clone.type ).toBe( chat.type );
  } );

  it( "mutating clone does not affect original", () => {
    const $clone = chat.clone();
    $clone.data.messages.push( {
      id: "msg2",
      key: "msg2",
      role: "user",
      content: "bye",
      size: 2,
      visibility: 0,
      createdAt: new Date(),
      prompt: "msg2"
    } );
    expect( chat.data.messages.find( m => m.id === "msg2" ) ).toBeUndefined();
  } );

  it( "clone can execute independently", async () => {
    const $clone = chat.clone();
    $clone.pipeline.push( { id: "p3", stage: "test", promise: async () => { } } );
    await expect( $clone.execute() ).resolves.toBe( $clone );
  } );
} );