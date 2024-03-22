import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL } from "../src/DSL";
import { key } from "../src/Window";

const chat = new DSL<Options, any, undefined>( {
  llm: new ChatGPT( {
    timeout: 10000
  }, "gpt-3.5-turbo" ),
  options: {
    model: "gpt-3.5-turbo",
  },
  window: key
} );
describe( ".clone()", () => {
  it( "chat !== clone", async () => {
    const $clone = chat.clone();
    expect( Object.is( $clone, chat ) ).toBe( false );
  } );
} );