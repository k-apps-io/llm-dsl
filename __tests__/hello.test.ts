import { ChatGPT, Options } from "@k-apps.io/llm-dsl-chatgpt";
import { DSL } from "../src/DSL";
import { LocalStorage } from "../src/Storage";

const chat = new DSL<Options, any>( {
  llm: new ChatGPT( {}, "gpt-3.5-turbo" ),
  storage: LocalStorage,
  options: {
    model: "gpt-3.5-turbo"
  },
  metadata: {}
} );
describe( "'Hello, World!'", () => {
  it( 'hello world', async () => {
    await chat
      .clone()
      .prompt( {
        message: "hello world"
      } )
      .execute();
    expect( true ).toBe( true );
  }, 60000 );
} );