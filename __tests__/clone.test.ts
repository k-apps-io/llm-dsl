import { ChatGPT } from "./ChatGPT";

const chat = new ChatGPT( { model: "gpt-4o-mini" } );

describe( ".clone()", () => {
  it( "chat !== clone", async () => {
    const $clone = chat.clone();
    expect( Object.is( $clone, chat ) ).toBe( false );
  } );
} );