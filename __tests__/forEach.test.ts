import { ChatGPT } from "./ChatGPT";

describe( "forEach", () => {
  it( 'single prompt', async () => {
    const chat = new ChatGPT( { model: "gpt-4o-mini" } );
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
            prompt: {
              role: "user",
              content: `What is the population of ${ item.city }?`,
            },
            key: item.city
          } );
      } )
      .execute();
    const messages = chat.data.messages;
    expect( messages.length ).toBe( 8 );
    const actual = messages.filter( m => m.type === "prompt" )
      .map( m => m.key );
    const exppected = jsonArray.map( item => item.city );
    expect( actual ).toMatchObject( exppected );
  }, 100000 );

  it( 'multiple prompts', async () => {
    const chat = new ChatGPT( { model: "gpt-4o-mini" } );
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
            prompt: {
              role: "user",
              content: `What is the population of ${ item.city }?`,
            },
            key: `${ item.city }-population`,
          } )
          .prompt( {
            prompt: {
              role: "user",
              content: `What is the area of ${ item.city }?`,
            },
            key: `${ item.city }-area`
          } );
      } )
      .execute();
    const messages = chat.data.messages;
    expect( messages.length ).toBe( 16 );
    const actual = messages.filter( m => m.type === "prompt" )
      .map( m => m.key );
    const expected = jsonArray.flatMap( item => [
      `${ item.city }-population`,
      `${ item.city }-area`
    ] );
    expect( actual ).toMatchObject( expected );
  }, 100000 );
} );