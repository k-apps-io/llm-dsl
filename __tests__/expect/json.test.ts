import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { Message, Visibility } from "../../src/Chat";
import extract, { toCodeBlock } from "../../src/CodeBlocks";
import { DSL } from "../../src/DSL";
import { json } from "../../src/Expect";


describe( ".expect", () => {

  const chat = new DSL<Options, any, undefined>( {
    llm: new ChatGPT( {}, "gpt-3.5-turbo" ),
    options: {
      model: "gpt-3.5-turbo"
    },
    settings: {
      maxCallStack: 3
    }
  } );

  it( '1 block', async () => {
    const handler = json<Options, any, undefined>( { blocks: 1 } );
    const $chat = chat.clone();
    const content = `${ toCodeBlock( "json", { "key": 1 } ) }`;
    const response: Message = {
      role: "assistant",
      content: content,
      codeBlocks: extract( content ),
      visibility: Visibility.OPTIONAL,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    console.log( response );
    const res = await handler( { response, locals: $chat.locals, chat: $chat } );
    const blocks = $chat.locals.$blocks;
    expect( blocks ).toBeDefined();
    expect( blocks.key ).toBe( 1 );
  } );
} );