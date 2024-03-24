import { ChatGPT } from "@k-apps-io/llm-dsl-chatgpt";
import { Message } from "../../src/Chat";
import { Visibility, latest } from "../../src/Window";

const llm = new ChatGPT( {}, "gpt-3.5-turbo" );

describe( "main.window", () => {
  it( "empty []", () => {
    const result = latest( { max: 5 } )( { messages: [], tokenLimit: 500 } );
    expect( result.length ).toBe( 0 );
    expect( result ).toMatchObject( [] );
  } );

  it( "max is more than messages length", () => {
    const messages: Message[] = [
      { visibility: Visibility.OPTIONAL, key: "a" },
      { visibility: Visibility.EXCLUDE },
      { visibility: Visibility.OPTIONAL },
    ].map( ( { key, visibility }, index ) => ( {
      id: String( index ),
      key: key,
      content: "",
      role: "user",
      visibility,
      size: 0,
      createdAt: new Date()
    } ) );
    const result = latest( { max: 5 } )( { messages, tokenLimit: 500 } );
    expect( result.length ).toBe( 3 );
    expect( result.map( ( { id } ) => id ) ).toMatchObject( [ "0", "1", "2" ] );
  } );

  it( "max is less than messages length", () => {
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
      content: "",
      role: "user",
      visibility,
      size: 0,
      createdAt: new Date()
    } ) );
    const result = latest( { max: 7 } )( { messages, tokenLimit: 500 } );
    expect( result.length ).toBe( 7 );
    expect( result.map( ( { id } ) => id ) ).toMatchObject( [ "5", "6", "7", "8", "9", "10", "11" ] );
  } );
} );