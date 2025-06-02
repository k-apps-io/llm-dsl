import { json, JSON } from "../../src/Expect";
import { latest } from "../../src/Window";
import { LLM } from "../../src/definitions";
import { extractCodeBlocks, toCodeBlock } from "../../src/utilities";
import { ChatGPT } from "../ChatGPT";

describe( ".expect", () => {

  const chat = new ChatGPT( { model: "gpt-4o-mini" },
    {
      settings: { maxCallStack: 3 }, window: latest( { n: 10 } )
    } );

  it( '1 block', async () => {
    const handler = json( { blocks: 1 } );
    const $chat = chat.clone();
    const content = `${ toCodeBlock( "json", { "key": 1 } ) }`;
    const response: LLM.Message.TextResponse = {
      id: "test",
      text: content,
      tokens: {
        message: 10,
        input: 5
      },
      codeBlocks: extractCodeBlocks( content ),
      visibility: LLM.Visibility.OPTIONAL,
      createdAt: new Date(),
      type: "response",
      window: [],
      prompt: ""
    };
    const res = ( await handler( { response, locals: $chat.locals, chat: $chat as any } ) ) as { json: JSON; };
    const blocks = res.json;
    expect( Array.isArray( blocks ) ).toBe( false );
    expect( blocks ).toBeDefined();
    expect( ( blocks as any ).key ).toBe( 1 );
  } );
} );