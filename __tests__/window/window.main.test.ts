import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { Message } from "../../src/Chat";
import { DSL } from "../../src/DSL";
import { Visibility, main } from "../../src/Window";

const chat = new DSL<Options, any, any>( {
  llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
} );

const content: string = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed id justo euismod, cursus nulla eget, tristique tellus. Vivamus JSON Example eleifend eu ex eget tempus. Integer quis dolor eget urna ultricies placerat. Donec sit amet vehicula metus. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Suspendisse potenti.";
const size = chat.llm.tokens( content );
describe( "main.window", () => {
  it( "keys reducing", () => {
    const messages: Message[] = [
      { visibility: Visibility.OPTIONAL, key: "a" },
      { visibility: Visibility.OPTIONAL },
      { visibility: Visibility.OPTIONAL, key: "a" }
    ].map( ( { key, visibility }, index ) => ( {
      id: String( index ),
      key: key,
      content: content,
      role: "user",
      visibility,
      size: size,
      createdAt: new Date(),
      prompt: String( index )
    } ) );
    const result = main( { chat, messages, tokenLimit: size * 3 } );
    expect( result.length ).toBe( 2 );
    expect( result.reduce( ( prev, curr ) => prev + curr.size, 0 ) ).toBe( size * 2 );
    expect( result.map( ( { id } ) => id ) ).toMatchObject( [ "1", "2" ] );
  } );

  it( "visibility", () => {
    const messages: Message[] = [
      { visibility: Visibility.OPTIONAL, key: "a" },
      { visibility: Visibility.EXCLUDE },
      { visibility: Visibility.OPTIONAL },
      { visibility: Visibility.REQUIRED },
      { visibility: Visibility.EXCLUDE },
      { visibility: Visibility.SYSTEM },
    ].map( ( { key, visibility }, index ) => ( {
      id: String( index ),
      key: key,
      content: content,
      role: "user",
      visibility,
      size: size,
      createdAt: new Date(),
      prompt: String( index )
    } ) );
    const target = 3;
    const result = main( { chat, messages, tokenLimit: size * target + ( 3 * target ) + 3 } );
    expect( result.length ).toBe( target );
    expect( result.reduce( ( prev, curr ) => prev + curr.size, 0 ) ).toBe( size * 3 );
    expect( result.map( ( { id } ) => id ) ).toMatchObject( [ "2", "3", "5" ] );
  } );

  it( "token limit", () => {
    const messages: Message[] = [
      { visibility: Visibility.OPTIONAL, key: "a" },
      { visibility: Visibility.EXCLUDE },
      { visibility: Visibility.OPTIONAL },
      { visibility: Visibility.REQUIRED },
      { visibility: Visibility.EXCLUDE },
      { visibility: Visibility.SYSTEM },
      { visibility: Visibility.OPTIONAL },
      { visibility: Visibility.OPTIONAL },
      { visibility: Visibility.REQUIRED },
      { visibility: Visibility.OPTIONAL },
      { visibility: Visibility.OPTIONAL },
      { visibility: Visibility.OPTIONAL },
    ].map( ( { key, visibility }, index ) => ( {
      id: String( index ),
      key: key,
      content: content,
      role: "user",
      visibility,
      size: size,
      createdAt: new Date(),
      prompt: String( index )
    } ) );
    const target = 5;
    const result = main( { chat, messages, tokenLimit: size * target + ( 3 * target ) + 3 } );
    expect( result.length ).toBe( target );
    expect( result.reduce( ( prev, curr ) => prev + curr.size, 0 ) ).toBe( size * 5 );
    expect( result.map( ( { id } ) => id ) ).toMatchObject( [ "3", "8", "9", "10", "11" ] );
  } );
} );