import { Message } from "../../src/Chat";
import { extract, toCodeBlock } from "../../src/CodeBlocks";
import { DSL } from "../../src/DSL";
import { json } from "../../src/Expect";
import { Visibility, latest } from "../../src/Window";
import { ChatGPT, Options } from "../ChatGPT";

describe( ".expect", () => {

  const chat = new DSL<Options, any, undefined>( {
    llm: new ChatGPT( { model: "gpt-3.5-turbo" } ),
    settings: {
      maxCallStack: 3
    },
    window: latest( { n: 10 } )
  } );

  it( '1 block', async () => {
    const handler = json( { blocks: 1 } );
    const $chat = chat.clone();
    const content = `${ toCodeBlock( "json", { "key": 1 } ) }`;
    const response: Message = {
      id: "test",
      role: "assistant",
      content: content,
      size: 0,
      codeBlocks: extract( content ),
      visibility: Visibility.OPTIONAL,
      createdAt: new Date(),
      prompt: "test"
    };
    const res = await handler( { response, locals: $chat.locals, chat: $chat } );
    const blocks = $chat.locals.$blocks;
    expect( blocks ).toBeDefined();
    expect( blocks.key ).toBe( 1 );
  } );
} );