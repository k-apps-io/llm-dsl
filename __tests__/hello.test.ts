import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL, Locals } from "../src/DSL";

const chat = new DSL<Options, Locals, undefined>( {
  llm: new ChatGPT( {}, "gpt-3.5-turbo" ),
  options: {
    model: "gpt-3.5-turbo"
  }
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