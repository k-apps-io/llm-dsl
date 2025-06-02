import { LLM, main } from "../../src";
import { ChatGPT, Options, Prompts, Responses, ToolResults } from "../ChatGPT";

describe( "window.main.prompt", () => {
  it( "window.main.prompt", async () => {
    const chat = new ChatGPT( { model: "gpt-4o-mini" } );
    const messages: LLM.Message.Message<Options, Prompts, Responses, ToolResults>[] = [
      { visibility: LLM.Visibility.OPTIONAL, key: "a", }, // 0: 1200
      { visibility: LLM.Visibility.EXCLUDE, },  // 1: 1100
      { visibility: LLM.Visibility.OPTIONAL, }, // 2: 1000
      { visibility: LLM.Visibility.REQUIRED, }, // 3: 900
      { visibility: LLM.Visibility.EXCLUDE, },  // 4: 800
      { visibility: LLM.Visibility.SYSTEM, },   // 5: 700
      { visibility: LLM.Visibility.OPTIONAL, }, // 6: 600
      { visibility: LLM.Visibility.OPTIONAL, }, // 7: 500
      { visibility: LLM.Visibility.REQUIRED, }, // 8: 400
      { visibility: LLM.Visibility.OPTIONAL, }, // 9: 300
      { visibility: LLM.Visibility.OPTIONAL, }, // 10: 200
      { visibility: LLM.Visibility.OPTIONAL, }, // 11: 100
    ].map( ( { key, visibility }, index ) => ( {
      id: String( index ),
      key: key,
      type: "prompt",
      prompt: {
        content: String( index ),
        role: "user",
      },
      visibility,
      size: 0,
      createdAt: new Date(),
      tokens: {
        message: 100
      }
    } ) );
    // messages total tokens: 1200
    // note - ChatGPT has some additional tokens for each message in the window,
    // thus the tokenLimit of 600 will not includ 6 messages but just 5.
    const result = main( { chat: chat as any, messages, tokenLimit: 600 } );
    const actual = result.map( ( { id } ) => id );
    const expected = [ "3", "8", "9", "10", "11" ];
    expect( actual ).toMatchObject( expected );
  }, 60000 );
} );