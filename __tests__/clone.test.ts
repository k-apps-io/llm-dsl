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
} );