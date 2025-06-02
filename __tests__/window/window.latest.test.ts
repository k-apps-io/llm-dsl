import { LLM } from "../../src";
import { latest } from "../../src/Window";
import { ChatGPT, Options, Prompts, Responses, ToolResults } from "../ChatGPT";

const chat = new ChatGPT( { model: "gpt-4o-mini" } );

describe( "main.window", () => {
  it( "empty []", () => {
    const result = latest( { n: 5 } )( { chat: chat as any, messages: [], tokenLimit: 500 } );
    expect( result.length ).toBe( 0 );
    expect( result ).toMatchObject( [] );
  } );

  it( "max is more than messages length", () => {
    const messages: LLM.Message.Message<Options, Prompts, Responses, ToolResults>[] = [
      { visibility: LLM.Visibility.OPTIONAL, key: "a" },
      { visibility: LLM.Visibility.EXCLUDE },
      { visibility: LLM.Visibility.OPTIONAL },
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
        message: 0
      }
    } ) );
    const result = latest( { n: 5 } )( { chat: chat as any, messages: messages as any, tokenLimit: 500 } );
    expect( result.length ).toBe( 3 );
    expect( result.map( ( { id } ) => id ) ).toMatchObject( [ "0", "1", "2" ] );
  } );

  it( "max is less than messages length", () => {
    const messages: LLM.Message.Message<Options, Prompts, Responses, ToolResults>[] = [
      { visibility: LLM.Visibility.OPTIONAL, key: "a", },
      { visibility: LLM.Visibility.EXCLUDE, },
      { visibility: LLM.Visibility.OPTIONAL, },
      { visibility: LLM.Visibility.REQUIRED, },
      { visibility: LLM.Visibility.EXCLUDE, },
      { visibility: LLM.Visibility.SYSTEM, },
      { visibility: LLM.Visibility.OPTIONAL, },
      { visibility: LLM.Visibility.OPTIONAL, },
      { visibility: LLM.Visibility.REQUIRED, },
      { visibility: LLM.Visibility.OPTIONAL, },
      { visibility: LLM.Visibility.OPTIONAL, },
      { visibility: LLM.Visibility.OPTIONAL, },
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
        message: 0
      }
    } ) );
    const result = latest( { n: 7 } )( { chat: chat as any, messages, tokenLimit: 500 } );
    expect( result.length ).toBe( 7 );
    expect( result.map( ( { id } ) => id ) ).toMatchObject( [ "5", "6", "7", "8", "9", "10", "11" ] );
  } );
} );