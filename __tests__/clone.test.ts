import { ChatGPT, Options } from "@k-apps.io/llm-dsl-chatgpt";
import { DSL } from "../src/DSL";
import { LocalStorage } from "../src/Storage";

const chat = new DSL<Options, any>( {
  llm: new ChatGPT( {
    timeout: 10000
  } ),
  storage: LocalStorage,
  options: {
    model: "gpt-3.5-turbo",
  },
  metadata: {}
} );
describe( ".clone()", () => {
  it( "chat !== clone", async () => {
    const $clone = chat.clone();
    expect( Object.is( $clone, chat ) ).toBe( false );
  } );
} );