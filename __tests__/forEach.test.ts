import { ChatGPT, Options } from "@k-apps-io/llm-dsl-chatgpt";
import { DSL } from "../src/DSL";
import { stdout } from "../src/Stream";

describe( "forEach", () => {
  it( 'single prompt', async () => {
    const chat = new DSL<Options, any, undefined>( {
      llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
    } );
    const jsonArray = [
      { city: "New York" },
      { city: "Los Angeles" },
      { city: "Chicago" },
      { city: "Houston" },
    ];

    await chat
      .forEach( jsonArray, ( { chat: $chat, item } ) => {
        $chat
          .prompt( {
            message: `What is the population of ${ item.city }?`,
            key: item.city
          } );
      } )
      .stream( stdout() );
    const messages = chat.data.messages;
    expect( messages.length ).toBe( 8 );
    const actualLean = messages.map( m => ( { key: m.key, content: m.role === "user" ? m.content : undefined, role: m.role } ) );
    const exepctedLean = [
      { key: "New York", content: "What is the population of New York?", role: "user" },
      { key: undefined, content: undefined, role: "assistant" },
      { key: "Los Angeles", content: "What is the population of Los Angeles?", role: "user" },
      { key: undefined, content: undefined, role: "assistant" },
      { key: "Chicago", content: "What is the population of Chicago?", role: "user" },
      { key: undefined, content: undefined, role: "assistant" },
      { key: "Houston", content: "What is the population of Houston?", role: "user" },
      { key: undefined, content: undefined, role: "assistant" }
    ];
    expect( actualLean ).toMatchObject( exepctedLean );
  }, 100000 );

  it( 'multiple prompts', async () => {
    const chat = new DSL<Options, any, undefined>( {
      llm: new ChatGPT( { model: "gpt-3.5-turbo" } )
    } );
    const jsonArray = [
      { city: "New York" },
      { city: "Los Angeles" },
      { city: "Chicago" },
      { city: "Houston" },
    ];

    await chat
      .forEach( jsonArray, ( { chat: $chat, item } ) => {
        $chat
          .prompt( {
            message: `What is the population of ${ item.city }?`,
            key: `${ item.city }-population`
          } )
          .prompt( {
            message: `What is the area of ${ item.city }?`,
            key: `${ item.city }-area`
          } );
      } )
      .stream( stdout() );
    const messages = chat.data.messages;
    expect( messages.length ).toBe( 16 );
    const actualLean = messages.map( m => ( { key: m.key, content: m.role === "user" ? m.content : undefined, role: m.role } ) );
    const exepctedLean = [
      { key: "New York-population", content: "What is the population of New York?", role: "user" },
      { key: undefined, content: undefined, role: "assistant" },
      { key: "New York-area", content: "What is the area of New York?", role: "user" },
      { key: undefined, content: undefined, role: "assistant" },
      { key: "Los Angeles-population", content: "What is the population of Los Angeles?", role: "user" },
      { key: undefined, content: undefined, role: "assistant" },
      { key: "Los Angeles-area", content: "What is the area of Los Angeles?", role: "user" },
      { key: undefined, content: undefined, role: "assistant" },
      { key: "Chicago-population", content: "What is the population of Chicago?", role: "user" },
      { key: undefined, content: undefined, role: "assistant" },
      { key: "Chicago-area", content: "What is the area of Chicago?", role: "user" },
      { key: undefined, content: undefined, role: "assistant" },
      { key: "Houston-population", content: "What is the population of Houston?", role: "user" },
      { key: undefined, content: undefined, role: "assistant" },
      { key: "Houston-area", content: "What is the area of Houston?", role: "user" },
      { key: undefined, content: undefined, role: "assistant" }
    ];
    expect( actualLean ).toMatchObject( exepctedLean );
  }, 100000 );
} );